const { prisma } = require("../lib/prisma");
const { hashPassword } = require("../lib/hash");

// Minimum length matches auth.routes.js and users.routes.js — one rule for
// what counts as an acceptable password, wherever it's being set from.
const MIN_PASSWORD_LENGTH = 8;

// An admin setting somebody else's password, reached from two places: the
// direct "Reset password" action on User Management, and resolving a ticket
// raised from the login screen's forgot-password link. Both must do exactly
// the same four things, so they share one implementation rather than two that
// can drift:
//
//   1. store the new hash
//   2. flag mustChangePassword, so the admin's chosen string is a one-time
//      handover credential and not a lasting password on someone else's
//      account (requireAuth turns that flag into a hard server-side gate)
//   3. revoke the target's live sessions — if the reset is happening because
//      the account is compromised, leaving the intruder's refresh token alive
//      would make the reset pointless
//   4. audit who did it to whom
//
// All of it in one transaction: a hash written without the flag would silently
// hand out a permanent password, and a flag written without the hash would
// lock someone out of an account whose password still hasn't changed.
async function applyAdminPasswordReset({
  targetUser,
  newPassword,
  actorUserId,
  reason,
  extraWrites,
}) {
  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUser.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        // A reset is also the way out of a lockout from repeated failed
        // logins — clearing the counter here saves a locked-out user from
        // having to wait it out on top of losing their password.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await tx.refreshToken.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "user.resetPassword",
        entityType: "User",
        entityId: String(targetUser.id),
        before: { mustChangePassword: targetUser.mustChangePassword },
        // Never the password itself, in either column — the audit log records
        // that a reset happened and who did it, not the credential.
        after: { mustChangePassword: true, reason },
      },
    });

    if (extraWrites) await extraWrites(tx);

    return updated;
  });
}

module.exports = { applyAdminPasswordReset, MIN_PASSWORD_LENGTH };
