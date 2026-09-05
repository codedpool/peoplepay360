const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission, isElevated } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { deriveAttendanceFields } = require("../services/attendance");
const { invalidateDashboardCache } = require("../lib/dashboardCache");

const router = express.Router();

const dateTimeSchema = z.coerce.date();

// A check-out before its own check-in produces negative worked time, which
// every downstream calculation (worked hours, day fraction, payroll
// proration) would then have to defend against. Rejected at the edge instead,
// on every route that can set the pair — including the ones that only supply
// one half and have to compare against what's already stored.
const ORDER_MESSAGE = "Check-out must be after check-in";

function checkOutAfterCheckIn(checkIn, checkOut) {
  return !checkOut || checkOut.getTime() > checkIn.getTime();
}

// workedHours, dayFraction and status are deliberately not accepted here —
// they're derived server-side from checkIn/checkOut against the employee's
// schedule (Section 7).
const createAttendanceSchema = z
  .object({
    employeeId: z.string().uuid(),
    checkIn: dateTimeSchema,
    checkOut: dateTimeSchema.nullable().optional(),
  })
  .refine((v) => checkOutAfterCheckIn(v.checkIn, v.checkOut), {
    message: ORDER_MESSAGE,
    path: ["checkOut"],
  });

// A correction may backfill/adjust either timestamp after the fact; it always
// goes through this route so it's always audit-logged (never a raw DB edit).
// Only the pair it actually carries can be ordered here — a correction that
// moves just one side is checked against the stored other side in the handler.
const correctAttendanceSchema = z
  .object({
    checkIn: dateTimeSchema.optional(),
    checkOut: dateTimeSchema.nullable().optional(),
  })
  .refine((v) => v.checkIn === undefined || checkOutAfterCheckIn(v.checkIn, v.checkOut), {
    message: ORDER_MESSAGE,
    path: ["checkOut"],
  });

async function loadScheduleForEmployee(employeeId) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { schedule: true },
  });
  return employee?.schedule ?? null;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};

    if (!isElevated(req.user.roles)) {
      where.employeeId = req.user.employeeId;
    } else if (!hasPermission(req.user.roles, "attendance:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    } else if (req.query.employeeId) {
      where.employeeId = req.query.employeeId;
    }

    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.attendance.findMany({ where, skip, take, orderBy: { checkIn: "desc" } }),
      prisma.attendance.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: "Attendance record not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, record.employeeId)) return;
    } else if (!hasPermission(req.user.roles, "attendance:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    res.json(record);
  })
);

// An Employee may create their own check-in/check-out entries (attendance:write:own);
// HR-tier roles may create on behalf of anyone (attendance:write).
router.post(
  "/",
  requireAuth,
  validateBody(createAttendanceSchema),
  asyncHandler(async (req, res) => {
    const { employeeId } = req.body;

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, employeeId)) return;
    } else if (!hasPermission(req.user.roles, "attendance:write")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const schedule = await loadScheduleForEmployee(employeeId);
    const checkOut = req.body.checkOut ?? null;

    const record = await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: req.body.checkIn,
        checkOut,
        ...deriveAttendanceFields({ checkIn: req.body.checkIn, checkOut, schedule }),
      },
    });

    await invalidateDashboardCache();
    res.status(201).json(record);
  })
);

// Employees may supply their own checkout later (still their own record, not a
// "correction" in the audit sense — the value was simply missing, not overwritten).
router.patch(
  "/:id/checkout",
  requireAuth,
  validateBody(z.object({ checkOut: dateTimeSchema })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Attendance record not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, existing.employeeId)) return;
    } else if (!hasPermission(req.user.roles, "attendance:write")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (existing.checkOut) {
      return res.status(409).json({ error: "This record already has a check-out; use the correction route" });
    }
    if (!checkOutAfterCheckIn(existing.checkIn, req.body.checkOut)) {
      return res.status(400).json({ error: ORDER_MESSAGE });
    }

    const schedule = await loadScheduleForEmployee(existing.employeeId);
    const record = await prisma.attendance.update({
      where: { id: req.params.id },
      data: {
        checkOut: req.body.checkOut,
        ...deriveAttendanceFields({ checkIn: existing.checkIn, checkOut: req.body.checkOut, schedule }),
      },
    });

    await invalidateDashboardCache();
    res.json(record);
  })
);

// Manual correction — restricted to attendance:correct (HR-tier and above) and
// always audit-logged with before/after, since this is exactly the kind of edit
// a payroll audit trail needs to capture (Section 3/5 of plan.md).
router.patch(
  "/:id/correct",
  requireAuth,
  requirePermission("attendance:correct"),
  validateBody(correctAttendanceSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Attendance record not found" });

    const checkIn = req.body.checkIn ?? existing.checkIn;
    const checkOut = req.body.checkOut !== undefined ? req.body.checkOut : existing.checkOut;

    // The schema could only order the two values the request carried; this is
    // the merged pair, which is what actually gets stored.
    if (!checkOutAfterCheckIn(checkIn, checkOut)) {
      return res.status(400).json({ error: ORDER_MESSAGE });
    }

    const schedule = await loadScheduleForEmployee(existing.employeeId);

    const before = {
      checkIn: existing.checkIn,
      checkOut: existing.checkOut,
      workedHours: existing.workedHours,
      overtimeHours: existing.overtimeHours,
      dayFraction: existing.dayFraction,
      status: existing.status,
    };

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.attendance.update({
        where: { id: req.params.id },
        data: {
          checkIn,
          checkOut,
          ...deriveAttendanceFields({ checkIn, checkOut, schedule }),
          isManualCorrection: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "attendance.correct",
          entityType: "Attendance",
          entityId: updated.id,
          before,
          after: {
            checkIn: updated.checkIn,
            checkOut: updated.checkOut,
            workedHours: updated.workedHours,
            overtimeHours: updated.overtimeHours,
            dayFraction: updated.dayFraction,
            status: updated.status,
          },
        },
      });

      return updated;
    });

    await invalidateDashboardCache();
    res.json(record);
  })
);

module.exports = router;
