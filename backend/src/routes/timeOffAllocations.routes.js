const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission, isElevated } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { invalidateDashboardCache } = require("../lib/dashboardCache");
const { isOrderedRange, orderedRangeRefinement } = require("../lib/dateRange");

const router = express.Router();

const dateSchema = z.coerce.date();
const DATE_ORDER_MESSAGE = "An allocation's valid-to date cannot be before its valid-from date";

const createAllocationSchema = z
  .object({
    employeeId: z.string().uuid(),
    timeOffTypeId: z.string().uuid(),
    allocated: z.coerce.number().nonnegative(),
    validFrom: dateSchema,
    validTo: dateSchema,
  })
  .refine(...orderedRangeRefinement("validFrom", "validTo", DATE_ORDER_MESSAGE));

// `taken`/`remaining` are deliberately not client-writable here — they only move
// via the atomic approval-deduction flow (Phase 3), never a direct edit on this route.
// `status` here is limited to EXPIRED — moving to/from PENDING/ACTIVE/REFUSED goes
// through the dedicated approve/refuse actions below, not a free-form field edit.
const updateAllocationSchema = z
  .object({
    allocated: z.coerce.number().nonnegative().optional(),
    validFrom: dateSchema.optional(),
    validTo: dateSchema.optional(),
    status: z.enum(["EXPIRED"]).optional(),
  })
  .refine(...orderedRangeRefinement("validFrom", "validTo", DATE_ORDER_MESSAGE));

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};

    if (!isElevated(req.user.roles)) {
      where.employeeId = req.user.employeeId;
    } else if (!hasPermission(req.user.roles, "timeoff:read")) {
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

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, allocation.employeeId)) return;
    } else if (!hasPermission(req.user.roles, "timeoff:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    res.json(allocation);
  })
);

// Allocations are created PENDING and only become usable once approved — the
// mockup shows a dedicated Approve/Refuse action, not an immediately-active grant.
router.post(
  "/",
  requireAuth,
  requirePermission("timeoff:write"),
  validateBody(createAllocationSchema),
  asyncHandler(async (req, res) => {
    const allocation = await prisma.timeOffAllocation.create({
      data: { ...req.body, taken: 0, remaining: req.body.allocated, status: "PENDING" },
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

    // Moving one end of the validity window still has to leave it ordered —
    // the schema above can only compare the halves the request carried.
    if (
      !isOrderedRange(
        req.body.validFrom ?? existing.validFrom,
        req.body.validTo ?? existing.validTo
      )
    ) {
      return res.status(400).json({ error: DATE_ORDER_MESSAGE });
    }

    const data = { ...req.body };
    if (data.allocated !== undefined) {
      const delta = data.allocated - Number(existing.allocated);
      data.remaining = Number(existing.remaining) + delta;
    }

    const allocation = await prisma.timeOffAllocation.update({ where: { id: req.params.id }, data });
    await invalidateDashboardCache();
    res.json(allocation);
  })
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission("timeoff:approve"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffAllocation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Allocation not found" });
    if (existing.status !== "PENDING") {
      return res.status(409).json({ error: `Cannot approve an allocation in ${existing.status} status` });
    }

    const allocation = await prisma.timeOffAllocation.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE" },
    });
    await invalidateDashboardCache();
    res.json(allocation);
  })
);

router.post(
  "/:id/refuse",
  requireAuth,
  requirePermission("timeoff:approve"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffAllocation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Allocation not found" });
    if (existing.status !== "PENDING") {
      return res.status(409).json({ error: `Cannot refuse an allocation in ${existing.status} status` });
    }

    const allocation = await prisma.timeOffAllocation.update({
      where: { id: req.params.id },
      data: { status: "REFUSED" },
    });
    res.json(allocation);
  })
);

module.exports = router;
