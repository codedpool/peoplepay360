const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { computeWeeklyHours } = require("../services/workingSchedule");

const router = express.Router();

const patternEntrySchema = z.object({
  day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  break: z.number().int().min(0).default(0),
});

// weeklyHours is deliberately not accepted here — it's derived from `pattern`
// server-side (Section 5/7 of plan.md), never taken as direct input.
const createScheduleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["FULL_TIME", "PART_TIME", "SHIFT"]),
  pattern: z.array(patternEntrySchema).min(1),
});

const updateScheduleSchema = createScheduleSchema.partial();

router.get(
  "/",
  requireAuth,
  requirePermission("schedule:read"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      prisma.workingSchedule.findMany({ skip, take, orderBy: { name: "asc" } }),
      prisma.workingSchedule.count(),
    ]);
    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  requirePermission("schedule:read"),
  asyncHandler(async (req, res) => {
    const schedule = await prisma.workingSchedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: "Working schedule not found" });
    res.json(schedule);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("schedule:write"),
  validateBody(createScheduleSchema),
  asyncHandler(async (req, res) => {
    const weeklyHours = computeWeeklyHours(req.body.pattern);
    const schedule = await prisma.workingSchedule.create({ data: { ...req.body, weeklyHours } });
    res.status(201).json(schedule);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("schedule:write"),
  validateBody(updateScheduleSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workingSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Working schedule not found" });

    const data = { ...req.body };
    if (data.pattern) {
      data.weeklyHours = computeWeeklyHours(data.pattern);
    }

    const schedule = await prisma.workingSchedule.update({ where: { id: req.params.id }, data });
    res.json(schedule);
  })
);

module.exports = router;
