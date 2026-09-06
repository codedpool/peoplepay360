const express = require("express");
const { z } = require("zod");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission, isElevated } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { invalidateDashboardCache } = require("../lib/dashboardCache");
const { orderedRangeRefinement } = require("../lib/dateRange");
const { toId, validateIdParam } = require("../lib/ids");

const router = express.Router();

// A non-numeric :id is a resource that cannot exist -> 404, not a 500 out
// of Prisma. See lib/ids.js.
router.param("id", validateIdParam);

const dateSchema = z.coerce.date();

const createRequestSchema = z
  .object({
    employeeId: z.coerce.number().int().positive(),
    timeOffTypeId: z.coerce.number().int().positive(),
    startDate: dateSchema,
    endDate: dateSchema,
    duration: z.coerce.number().positive(),
  })
  .refine(
    ...orderedRangeRefinement(
      "startDate",
      "endDate",
      "A leave request's end date cannot be before its start date"
    )
  );

const MS_PER_DAY = 86_400_000;

// Calendar days the request spans, inclusive of both ends — a single-day
// request spans 1, not 0.
function spanInDays(startDate, endDate) {
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}

// `duration` is what the balance is deducted by, and nothing tied it to the
// dates being requested — a one-day request could claim 30 days and, if the
// balance happened to cover it, permanently burn 30 days of leave. Capped
// against the span the request actually covers, in whichever unit the type
// is measured in.
function durationCeilingFor(unit, startDate, endDate) {
  const days = spanInDays(startDate, endDate);
  return unit === "HOURS" ? days * 24 : days;
}

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
    } else if (toId(req.query.employeeId)) {
      where.employeeId = toId(req.query.employeeId);
    }

    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.timeOffRequest.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.timeOffRequest.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await prisma.timeOffRequest.findUnique({ where: { id: toId(req.params.id) } });
    if (!request) return res.status(404).json({ error: "Time off request not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, request.employeeId)) return;
    } else if (!hasPermission(req.user.roles, "timeoff:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    res.json(request);
  })
);

// An Employee may only submit a request for themself; HR-tier roles may file on
// behalf of anyone. Filing never touches the Allocation — only approval does.
router.post(
  "/",
  requireAuth,
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const { employeeId } = req.body;

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, employeeId)) return;
    } else if (!hasPermission(req.user.roles, "timeoff:write")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const type = await prisma.timeOffType.findUnique({ where: { id: req.body.timeOffTypeId } });
    if (!type) return res.status(400).json({ error: "Unknown time off type" });

    const ceiling = durationCeilingFor(type.unit, req.body.startDate, req.body.endDate);
    if (req.body.duration > ceiling) {
      return res.status(400).json({
        error: `Duration of ${req.body.duration} exceeds the ${ceiling} ${type.unit.toLowerCase()} this date range covers`,
      });
    }

    // A request against a balance that can't cover it was previously allowed
    // to sit PENDING forever — only approval checked the allocation, so it
    // rejected there instead of never having been submittable. Checked here
    // too now, against the exact same allocation approval will later resolve
    // (same type/dates/ACTIVE-status match), so a request that can't possibly
    // be approved is refused up front instead of sitting in the queue.
    if (type.requiresAllocation) {
      const allocation = await prisma.timeOffAllocation.findFirst({
        where: {
          employeeId: req.body.employeeId,
          timeOffTypeId: req.body.timeOffTypeId,
          status: "ACTIVE",
          validFrom: { lte: req.body.startDate },
          validTo: { gte: req.body.endDate },
        },
      });

      if (!allocation) {
        return res.status(400).json({ error: "No active allocation covers these dates for this leave type" });
      }

      const remaining = Number(allocation.remaining);
      if (req.body.duration > remaining) {
        return res.status(400).json({
          error: `Insufficient balance: ${remaining} ${type.unit.toLowerCase()} remaining, ${req.body.duration} requested`,
        });
      }
    }

    const request = await prisma.timeOffRequest.create({ data: { ...req.body, status: "PENDING" } });
    await invalidateDashboardCache();
    res.status(201).json(request);
  })
);

// Two different cancellations share this route, because to the caller they're
// the same verb:
//
//   PENDING  — a withdrawal. The employee may withdraw their own; anyone with
//              timeoff:write may withdraw on their behalf. No balance has
//              moved yet, so there's nothing to undo.
//   APPROVED — an approver reversing a decision after the fact. This requires
//              timeoff:approve (never the employee themself, who would
//              otherwise be able to hand themselves their leave balance back)
//              and must give the deducted balance back.
//
// The restore runs at the same Serializable isolation as the approval that
// took the balance, against the exact allocation recorded on the request, so
// a cancel racing another approval on the same allocation can't lose a write.
router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffRequest.findUnique({ where: { id: toId(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Time off request not found" });

    if (existing.status === "PENDING") {
      if (!isElevated(req.user.roles)) {
        if (!assertOwnsOrElevated(req, res, existing.employeeId)) return;
      } else if (!hasPermission(req.user.roles, "timeoff:write")) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
    } else if (existing.status === "APPROVED") {
      if (!hasPermission(req.user.roles, "timeoff:approve")) {
        return res
          .status(403)
          .json({ error: "Only an approver can cancel a request that has already been approved" });
      }
    } else {
      return res
        .status(409)
        .json({ error: `A ${existing.status.toLowerCase()} request cannot be cancelled` });
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Re-read inside the transaction: the status checked above was read
          // before it opened, and an approval could have landed since.
          const request = await tx.timeOffRequest.findUnique({ where: { id: toId(req.params.id) } });
          if (!request) {
            const err = new Error("Time off request not found");
            err.statusCode = 404;
            throw err;
          }
          if (request.status !== "PENDING" && request.status !== "APPROVED") {
            const err = new Error(`A ${request.status.toLowerCase()} request cannot be cancelled`);
            err.statusCode = 409;
            throw err;
          }

          let restored = null;
          if (request.status === "APPROVED" && request.allocationId) {
            const duration = Number(request.duration);
            const allocation = await tx.timeOffAllocation.update({
              where: { id: request.allocationId },
              data: {
                taken: { decrement: duration },
                remaining: { increment: duration },
              },
            });
            restored = { allocationId: allocation.id, duration };
          }

          const cancelled = await tx.timeOffRequest.update({
            where: { id: toId(req.params.id) },
            // Clears any pending cancellation request alongside the cancel
            // itself — the ask has now been answered.
            data: {
              status: "CANCELLED",
              allocationId: null,
              cancellationRequested: false,
              cancellationRequestedAt: null,
            },
          });

          // Only the approval-tier reversal is audited. A pending withdrawal
          // changes no balance and needs no paper trail; undoing an approval
          // moves money-adjacent state and does.
          if (request.status === "APPROVED") {
            await tx.auditLog.create({
              data: {
                actorUserId: req.user.id,
                action: "timeoff.cancelApproved",
                entityType: "TimeOffRequest",
                entityId: String(cancelled.id),
                before: { status: "APPROVED", allocationId: request.allocationId },
                after: { status: "CANCELLED", restored },
              },
            });
          }

          return cancelled;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      await invalidateDashboardCache();
      res.json(result);
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === "P2034") {
        return res.status(409).json({ error: "This request was modified concurrently; please retry" });
      }
      // The recorded allocation was deleted out from under the request — the
      // cancellation itself is still the right outcome, but silently skipping
      // the restore would hide a real data problem, so say so.
      if (err.code === "P2025") {
        return res
          .status(409)
          .json({ error: "The allocation this leave was deducted from no longer exists" });
      }
      throw err;
    }
  })
);

// An employee can withdraw their own PENDING request outright, but an
// APPROVED one has already moved their balance — letting them reverse that
// unilaterally would let them hand themselves leave back. So they ask
// instead: this flags the request for HR, who then use the existing
// /cancel route (which requires timeoff:approve and restores the balance
// properly). Nothing about the request's own status changes here.
router.post(
  "/:id/request-cancellation",
  requireAuth,
  validateBody(z.object({ reason: z.string().trim().min(1).max(500).optional() })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffRequest.findUnique({ where: { id: toId(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Time off request not found" });

    // The employee whose leave it is, or someone acting for them.
    if (!assertOwnsOrElevated(req, res, existing.employeeId)) return;

    if (existing.status !== "APPROVED") {
      return res.status(409).json({
        error:
          existing.status === "PENDING"
            ? "A pending request can be withdrawn directly — no cancellation request needed"
            : `A ${existing.status.toLowerCase()} request cannot be cancelled`,
      });
    }
    if (existing.cancellationRequested) {
      return res.status(409).json({ error: "Cancellation has already been requested for this leave" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.timeOffRequest.update({
        where: { id: toId(req.params.id) },
        data: {
          cancellationRequested: true,
          cancellationReason: req.body.reason ?? null,
          cancellationRequestedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "timeoff.requestCancellation",
          entityType: "TimeOffRequest",
          entityId: String(request.id),
          before: { cancellationRequested: false },
          after: { cancellationRequested: true, reason: request.cancellationReason },
        },
      });
      return request;
    });

    await invalidateDashboardCache();
    res.json(updated);
  })
);

// Approval is the one write path that moves an Allocation balance. Everything
// here runs inside a single serializable transaction: reload the allocation,
// reload the request, and only commit remaining -= duration if the request is
// still PENDING and the allocation still covers it. Two approvers racing the
// same allocation cannot both succeed — one hits P2034 (serialization failure)
// and is asked to retry, so remaining can never double-deduct or go negative.
router.post(
  "/:id/approve",
  requireAuth,
  requirePermission("timeoff:approve"),
  asyncHandler(async (req, res) => {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const request = await tx.timeOffRequest.findUnique({
            where: { id: toId(req.params.id) },
            include: { timeOffType: true },
          });
          if (!request) {
            const err = new Error("Time off request not found");
            err.statusCode = 404;
            throw err;
          }
          if (request.status !== "PENDING") {
            const err = new Error("Only a pending request can be approved");
            err.statusCode = 409;
            throw err;
          }

          let allocation = null;
          if (request.timeOffType.requiresAllocation) {
            allocation = await tx.timeOffAllocation.findFirst({
              where: {
                employeeId: request.employeeId,
                timeOffTypeId: request.timeOffTypeId,
                status: "ACTIVE",
                validFrom: { lte: request.startDate },
                validTo: { gte: request.endDate },
              },
            });

            if (!allocation) {
              const err = new Error("No active allocation covers this request's dates");
              err.statusCode = 409;
              throw err;
            }

            const remaining = Number(allocation.remaining);
            const duration = Number(request.duration);
            if (remaining < duration) {
              const err = new Error(
                `Insufficient balance: ${remaining} remaining, ${duration} requested`
              );
              err.statusCode = 409;
              throw err;
            }

            await tx.timeOffAllocation.update({
              where: { id: allocation.id },
              data: {
                taken: { increment: duration },
                remaining: { decrement: duration },
              },
            });
          }

          const approved = await tx.timeOffRequest.update({
            where: { id: toId(req.params.id) },
            data: { status: "APPROVED", allocationId: allocation?.id ?? null },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: req.user.id,
              action: "timeoff.approve",
              entityType: "TimeOffRequest",
              entityId: String(approved.id),
              before: { status: "PENDING" },
              after: { status: "APPROVED", allocationId: allocation?.id ?? null },
            },
          });

          return approved;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      await invalidateDashboardCache();
      res.json(result);
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      // Serialization failure from a concurrent approval racing the same
      // allocation — the safe outcome is "ask the client to retry", not a 500.
      if (err.code === "P2034") {
        return res.status(409).json({ error: "This request was modified concurrently; please retry" });
      }
      throw err;
    }
  })
);

router.post(
  "/:id/refuse",
  requireAuth,
  requirePermission("timeoff:approve"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffRequest.findUnique({ where: { id: toId(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Time off request not found" });
    if (existing.status !== "PENDING") {
      return res.status(409).json({ error: "Only a pending request can be refused" });
    }

    const request = await prisma.$transaction(async (tx) => {
      const refused = await tx.timeOffRequest.update({
        where: { id: toId(req.params.id) },
        data: { status: "REFUSED" },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "timeoff.refuse",
          entityType: "TimeOffRequest",
          entityId: String(refused.id),
          before: { status: "PENDING" },
          after: { status: "REFUSED" },
        },
      });

      return refused;
    });

    await invalidateDashboardCache();
    res.json(request);
  })
);

module.exports = router;
