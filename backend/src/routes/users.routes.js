const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { hashPassword } = require("../lib/hash");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { applyAdminPasswordReset, MIN_PASSWORD_LENGTH } = require("../services/passwordReset");
const { toId, validateIdParam } = require("../lib/ids");

const router = express.Router();

// A non-numeric :id is a resource that cannot exist -> 404, not a 500 out
// of Prisma. See lib/ids.js.
router.param("id", validateIdParam);

const ROLE_VALUES = ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "ADMIN"];

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  employeeId: z.coerce.number().int().positive().nullable().optional(),
  roles: z.array(z.enum(ROLE_VALUES)).min(1),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

// `roles` is intentionally editable here for an admin acting on someone else —
// the self-elevation guard below is what blocks a user from touching their own.
const updateUserSchema = z.object({
  roles: z.array(z.enum(ROLE_VALUES)).min(1).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.coerce.number().int().positive().nullable().optional(),
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    employeeId: user.employeeId,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function isUniqueConstraintViolation(err) {
  return err?.code === "P2002";
}

// Admin-only screen per the mockup's "ADMIN ONLY" badge on User Management.
router.get(
  "/",
  requireAuth,
  requirePermission("user:manage"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      prisma.user.findMany({ skip, take, orderBy: { email: "asc" } }),
      prisma.user.count(),
    ]);
    res.json(paginatedResponse(data.map(publicUser), total, page, pageSize));
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("user:manage"),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, password, employeeId, roles } = req.body;
    const passwordHash = await hashPassword(password);

    try {
      const user = await prisma.user.create({
        data: { email, passwordHash, employeeId: employeeId ?? null, roles },
      });
      res.status(201).json(publicUser(user));
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return res.status(409).json({ error: "Email or employee is already linked to a user account" });
      }
      throw err;
    }
  })
);

// Users must not be able to assign or elevate their own roles (mockup's explicit
// rule) — enforced by rejecting any self-targeted request that includes `roles`,
// not just ones that would escalate it, since that's the simplest guarantee.
router.patch(
  "/:id",
  requireAuth,
  requirePermission("user:manage"),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    if (id === req.user.id && req.body.roles !== undefined) {
      return res.status(403).json({ error: "You cannot change your own roles" });
    }

    try {
      const user = await prisma.user.update({ where: { id }, data: req.body });
      res.json(publicUser(user));
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return res.status(409).json({ error: "That employee is already linked to a user account" });
      }
      throw err;
    }
  })
);

// Admin resets somebody else's password directly, without them having raised a
// ticket first — the "they're standing at my desk locked out" case.
//
// Self-reset is refused rather than allowed: an admin changing their own
// password belongs on /api/auth/change-password, which demands the current
// password. Routing it here instead would let anyone holding a live admin
// token replace that account's password without proving they know the old one.
router.post(
  "/:id/reset-password",
  requireAuth,
  requirePermission("user:manage"),
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: toId(req.params.id) } });
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.id === req.user.id) {
      return res
        .status(403)
        .json({ error: "Use the change-password flow to set your own password" });
    }

    const updated = await applyAdminPasswordReset({
      targetUser: target,
      newPassword: req.body.newPassword,
      actorUserId: req.user.id,
      reason: "adminDirectReset",
    });

    res.json(publicUser(updated));
  })
);

module.exports = router;
