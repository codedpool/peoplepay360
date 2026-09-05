const crypto = require("crypto");
const { prisma } = require("./prisma");
const { env } = require("./env");

const TTL_MULTIPLIERS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseTtlToMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}`);
  }
  return Number(match[1]) * TTL_MULTIPLIERS[match[2]];
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(64).toString("hex");
}

async function issueRefreshToken(userId, familyId = crypto.randomUUID()) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + parseTtlToMs(env.jwtRefreshTtl));

  await prisma.refreshToken.create({
    data: { userId, tokenHash, familyId, expiresAt },
  });

  return { rawToken, familyId, expiresAt };
}

// Rotates a refresh token on use. If the presented token was already rotated away
// (i.e. reused), the whole token family is revoked — that pattern only occurs if a
// stolen/replayed token is presented after the legitimate client already rotated past it.
async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.expiresAt < new Date()) {
    return { status: "invalid" };
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { status: "reused" };
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const next = await issueRefreshToken(existing.userId, existing.familyId);
  return { status: "rotated", userId: existing.userId, ...next };
}

async function revokeRefreshTokenFamily(rawToken) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return;

  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenFamily,
  hashToken,
};
