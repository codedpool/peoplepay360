const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");

const router = express.Router();

const createTimeOffTypeSchema = z.object({
  name: z.string().min(1),
  unit: z.enum(["DAYS", "HOURS"]),
  requiresAllocation: z.boolean().optional(),
  payrollIntegrated: z.boolean().optional(),
});

const updateTimeOffTypeSchema = createTimeOffTypeSchema.partial();

// Reference/lookup data (e.g. "Sick Leave", "Annual Leave") — any authenticated
// user can read the list to file a request against it; only HR-tier roles define types.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const types = await prisma.timeOffType.findMany({ orderBy: { name: "asc" } });
    res.json({ data: types });
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("timeoff:write"),
  validateBody(createTimeOffTypeSchema),
  asyncHandler(async (req, res) => {
    const type = await prisma.timeOffType.create({ data: req.body });
    res.status(201).json(type);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("timeoff:write"),
  validateBody(updateTimeOffTypeSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffType.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Time off type not found" });

    const type = await prisma.timeOffType.update({ where: { id: req.params.id }, data: req.body });
    res.json(type);
  })
);

module.exports = router;
