const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { applyAdminPasswordReset, MIN_PASSWORD_LENGTH } = require("../services/passwordReset");

const router = express.Router();

// The admin side of the "I forgot my password" flow raised from the login
// screen (POST /api/auth/password-reset-requests). Same permission as User
// Management — resolving one of these sets somebody's password, which is the
// same privilege as creating their account in the first place.

const resolveSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

function publicRequest(request) {
  return {
    id: request.id,
    email: request.email,
    userId: request.userId,
    note: request.note,
    status: request.status,
    resolvedById: request.resolvedById,
    resolvedAt: request.resolvedAt,
    createdAt: request.createdAt,
    user: request.user
      ? { id: request.user.id, email: request.user.email, roles: request.user.roles }
      : null,
  };
}

router.get(
  "/",
  requireAuth,
  requirePermission("user:manage"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.passwordResetRequest.findMany({
        where,
        skip,
        take,
        // Oldest pending first: this is a work queue, and the person who has
        // been locked out longest is the one to help next.
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: { user: true },
      }),
      prisma.passwordResetRequest.count({ where }),
    ]);

    res.json(paginatedResponse(data.map(publicRequest), total, page, pageSize));
  })
);

// Resolve = actually set the person a new password and close the ticket, in
// one transaction. Closing the ticket without setting a password would leave
// the requester still locked out with nothing in the queue to show for it.
router.post(
  "/:id/resolve",
  requireAuth,
  requirePermission("user:manage"),
  validateBody(resolveSchema),
  asyncHandler(async (req, res) => {
    const request = await prisma.passwordResetRequest.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!request) return res.status(404).json({ error: "Password reset request not found" });
    if (request.status !== "PENDING") {
      return res.status(409).json({ error: "This request has already been dealt with" });
    }
    if (!request.userId || !request.user) {
      return res
        .status(409)
        .json({ error: "The account this request was raised for no longer exists" });
    }

    await applyAdminPasswordReset({
      targetUser: request.user,
      newPassword: req.body.newPassword,
      actorUserId: req.user.id,
      reason: "passwordResetRequest",
      extraWrites: (tx) =>
        tx.passwordResetRequest.update({
          where: { id: request.id },
          data: { status: "COMPLETED", resolvedById: req.user.id, resolvedAt: new Date() },
        }),
    });

    const updated = await prisma.passwordResetRequest.findUnique({
      where: { id: request.id },
      include: { user: true },
    });
    res.json(publicRequest(updated));
  })
);

// Dismiss without setting a password — for a request the admin knows to be
// bogus, or one already handled in person.
router.post(
  "/:id/reject",
  requireAuth,
  requirePermission("user:manage"),
  asyncHandler(async (req, res) => {
    const request = await prisma.passwordResetRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Password reset request not found" });
    if (request.status !== "PENDING") {
      return res.status(409).json({ error: "This request has already been dealt with" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rejected = await tx.passwordResetRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", resolvedById: req.user.id, resolvedAt: new Date() },
        include: { user: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "passwordResetRequest.reject",
          entityType: "PasswordResetRequest",
          entityId: rejected.id,
          before: { status: "PENDING" },
          after: { status: "REJECTED" },
        },
      });

      return rejected;
    });

    res.json(publicRequest(updated));
  })
);

module.exports = router;
