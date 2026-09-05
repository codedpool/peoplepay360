const express = require("express");
const { z } = require("zod");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");

const router = express.Router();

const dateSchema = z.coerce.date();

const createRequestSchema = z.object({
  employeeId: z.string().uuid(),
  timeOffTypeId: z.string().uuid(),
  startDate: dateSchema,
  endDate: dateSchema,
  duration: z.coerce.number().positive(),
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
    const request = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Time off request not found" });

    if (req.user.role === "EMPLOYEE") {
      if (!assertOwnsOrElevated(req, res, request.employeeId)) return;
    } else if (!hasPermission(req.user.role, "timeoff:read")) {
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

    if (req.user.role === "EMPLOYEE") {
      if (!assertOwnsOrElevated(req, res, employeeId)) return;
    } else if (!hasPermission(req.user.role, "timeoff:write")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const request = await prisma.timeOffRequest.create({ data: { ...req.body, status: "PENDING" } });
    res.status(201).json(request);
  })
);

// An Employee may withdraw their own request only while it is still PENDING —
// once approved, the balance has already moved and withdrawal must go through
// the refuse/approval-tier flow instead.
router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Time off request not found" });

    if (req.user.role === "EMPLOYEE") {
      if (!assertOwnsOrElevated(req, res, existing.employeeId)) return;
    } else if (!hasPermission(req.user.role, "timeoff:write")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (existing.status !== "PENDING") {
      return res.status(409).json({ error: "Only a pending request can be cancelled" });
    }

    const request = await prisma.timeOffRequest.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });
    res.json(request);
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
            where: { id: req.params.id },
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
            where: { id: req.params.id },
            data: { status: "APPROVED" },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: req.user.id,
              action: "timeoff.approve",
              entityType: "TimeOffRequest",
              entityId: approved.id,
              before: { status: "PENDING" },
              after: { status: "APPROVED", allocationId: allocation?.id ?? null },
            },
          });

          return approved;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

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
    const existing = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Time off request not found" });
    if (existing.status !== "PENDING") {
      return res.status(409).json({ error: "Only a pending request can be refused" });
    }

    const request = await prisma.$transaction(async (tx) => {
      const refused = await tx.timeOffRequest.update({
        where: { id: req.params.id },
        data: { status: "REFUSED" },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "timeoff.refuse",
          entityType: "TimeOffRequest",
          entityId: refused.id,
          before: { status: "PENDING" },
          after: { status: "REFUSED" },
        },
      });

      return refused;
    });

    res.json(request);
  })
);

module.exports = router;
