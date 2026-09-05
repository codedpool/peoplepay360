const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");

const router = express.Router();

const dateSchema = z.coerce.date();

const createAllocationSchema = z.object({
  employeeId: z.string().uuid(),
  timeOffTypeId: z.string().uuid(),
  allocated: z.coerce.number().nonnegative(),
  validFrom: dateSchema,
  validTo: dateSchema,
});

// `taken`/`remaining` are deliberately not client-writable here — they only move
// via the atomic approval-deduction flow (Phase 3), never a direct edit on this route.
const updateAllocationSchema = z.object({
  allocated: z.coerce.number().nonnegative().optional(),
  validFrom: dateSchema.optional(),
  validTo: dateSchema.optional(),
  status: z.enum(["ACTIVE", "EXPIRED"]).optional(),
});

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};

    if (req.user.role === "EMPLOYEE") {
      where.employeeId = req.user.employeeId;
    } else if (!hasPermission(req.user.role, "timeoff:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    } else if (req.query.employeeId) {
      where.employeeId = req.query.employeeId;
    }

    const [data, total] = await Promise.all([
      prisma.timeOffAllocation.findMany({ where, skip, take, orderBy: { validFrom: "desc" } }),
      prisma.timeOffAllocation.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const allocation = await prisma.timeOffAllocation.findUnique({ where: { id: req.params.id } });
    if (!allocation) return res.status(404).json({ error: "Allocation not found" });

    if (req.user.role === "EMPLOYEE") {
      if (!assertOwnsOrElevated(req, res, allocation.employeeId)) return;
    } else if (!hasPermission(req.user.role, "timeoff:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    res.json(allocation);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("timeoff:write"),
  validateBody(createAllocationSchema),
  asyncHandler(async (req, res) => {
    const allocation = await prisma.timeOffAllocation.create({
      data: { ...req.body, taken: 0, remaining: req.body.allocated, status: "ACTIVE" },
    });
    res.status(201).json(allocation);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("timeoff:write"),
  validateBody(updateAllocationSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffAllocation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Allocation not found" });

    const data = { ...req.body };
    if (data.allocated !== undefined) {
      const delta = data.allocated - Number(existing.allocated);
      data.remaining = Number(existing.remaining) + delta;
    }

    const allocation = await prisma.timeOffAllocation.update({ where: { id: req.params.id }, data });
    res.json(allocation);
  })
);

module.exports = router;
