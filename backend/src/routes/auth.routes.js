const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { verifyPassword, hashPassword } = require("../lib/hash");
const { signAccessToken } = require("../lib/jwt");
const {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenFamily,
} = require("../lib/refreshToken");
const { requireAuth } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { authLimiter, makeLimiter } = require("../middleware/rateLimiters");
const { asyncHandler } = require("../lib/asyncHandler");
const { env } = require("../lib/env");

const router = express.Router();

const REFRESH_COOKIE = "refreshToken";
const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/api/auth",
};

// Minimum length matches the one users.routes.js enforces when an admin
// creates an account — one rule for what counts as an acceptable password,
// wherever it's being set from.
const MIN_PASSWORD_LENGTH = 8;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

const resetRequestSchema = z.object({
  email: z.string().email(),
  note: z.string().max(500).optional(),
});

// Unauthenticated and writes a row, so it needs its own throttle — the shared
// authLimiter is scoped to login/refresh and shouldn't have its budget spent
// by reset tickets (or vice versa).
const resetRequestLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  prefix: "rl:password-reset-request:",
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
  };
}

router.post("/login", authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
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
}));

router.post("/refresh", authLimiter, asyncHandler(async (req, res) => {
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
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (rawToken) {
    await revokeRefreshTokenFamily(rawToken);
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.json({ status: "ok" });
}));

// Self-service change, from inside the app. Requires the current password even
// though the caller is already authenticated: a bearer token left open on an
// unattended machine shouldn't be enough to lock the real owner out.
//
// This is also the one route a mustChangePassword session is allowed to reach
// (see PASSWORD_CHANGE_EXEMPT_PATHS in middleware/auth.js).
router.post(
  "/change-password",
  authLimiter,
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid session" });
    }

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
    });

    // Every other session belonging to this user is cut loose. If the password
    // is being changed because it leaked, leaving the leaked session's refresh
    // token alive would defeat the change entirely.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "user.changePassword",
        entityType: "User",
        entityId: user.id,
        before: { mustChangePassword: user.mustChangePassword },
        after: { mustChangePassword: false },
      },
    });

    // The caller's own session is re-established immediately, so changing a
    // password doesn't bounce them to the login screen — and the new token no
    // longer carries the mustChangePassword claim that was gating them.
    const accessToken = signAccessToken(updated);
    const { rawToken } = await issueRefreshToken(updated.id);
    res.cookie(REFRESH_COOKIE, rawToken, cookieOptions);

    res.json({ accessToken, user: publicUser(updated) });
  })
);

// "I forgot my password" from the login screen. There is no outbound mail path
// for a self-service reset link in this system, so this raises a ticket for an
// administrator to action instead of sending anything.
//
// The response is deliberately identical whether or not the address matches an
// account, and the row is only written when it does. Answering differently
// would turn this into an account-enumeration oracle: anyone could discover
// which company email addresses have logins.
router.post(
  "/password-reset-requests",
  resetRequestLimiter,
  validateBody(resetRequestSchema),
  asyncHandler(async (req, res) => {
    const { email, note } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // One open ticket per account. Without this, repeatedly hitting the
      // button (or a bot doing so) would bury the admin queue under duplicates
      // for the same person.
      const open = await prisma.passwordResetRequest.findFirst({
        where: { userId: user.id, status: "PENDING" },
      });

      if (open) {
        await prisma.passwordResetRequest.update({
          where: { id: open.id },
          data: { note: note ?? open.note, createdAt: new Date() },
        });
      } else {
        await prisma.passwordResetRequest.create({
          data: { email, userId: user.id, note: note ?? null },
        });
      }
    }

    res.status(202).json({
      status: "received",
      message: "If that address has an account, an administrator has been notified.",
    });
  })
);

module.exports = router;
