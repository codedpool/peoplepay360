const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { verifyPassword } = require("../lib/hash");
const { signAccessToken } = require("../lib/jwt");
const {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenFamily,
} = require("../lib/refreshToken");
const { validateBody } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiters");
const { env } = require("../lib/env");

const router = express.Router();

const REFRESH_COOKIE = "refreshToken";
const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/api/auth",
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId };
}

router.post("/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: "Account temporarily locked. Try again later." });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const lockNow = attempts >= env.loginLockoutThreshold;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockNow ? 0 : attempts,
        lockedUntil: lockNow ? new Date(Date.now() + env.loginLockoutMinutes * 60_000) : null,
      },
    });

    return res.status(401).json({ error: "Invalid email or password" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken(user);
  const { rawToken } = await issueRefreshToken(user.id);

  res.cookie(REFRESH_COOKIE, rawToken, cookieOptions);
  res.json({ accessToken, user: publicUser(user) });
});

router.post("/refresh", authLimiter, async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) {
    return res.status(401).json({ error: "Missing refresh token" });
  }

  const result = await rotateRefreshToken(rawToken);

  if (result.status !== "rotated") {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    return res.status(401).json({ error: "Invalid or reused refresh token" });
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const accessToken = signAccessToken(user);
  res.cookie(REFRESH_COOKIE, result.rawToken, cookieOptions);
  res.json({ accessToken });
});

router.post("/logout", async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (rawToken) {
    await revokeRefreshTokenFamily(rawToken);
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.json({ status: "ok" });
});

module.exports = router;
