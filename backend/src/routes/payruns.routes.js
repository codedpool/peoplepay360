const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { makeLimiter } = require("../middleware/rateLimiters");
const { payrunComputeQueue, payslipEmailQueue } = require("../lib/queue");
const { validatePayrun } = require("../services/payrunValidation");

const router = express.Router();

const dateSchema = z.coerce.date();

// Minimal creation shape — Step 1 (structure + period) and Step 2 (employee
// selection) collapsed into one call for now. Track A's two-step wizard
// (Stage 5.1) can call this same endpoint once its own UI collects the same
// fields; this route doesn't assume anything about how that selection UI works.
const createPayrunSchema = z.object({
  name: z.string().min(1),
  salaryStructureId: z.string().uuid(),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  employeeIds: z.array(z.string().uuid()).min(1),
});

// Expensive operation, naturally throttled further by running as a queued
// job — still rate limited itself so the trigger endpoint can't be spammed
// into enqueueing an unbounded number of jobs (Section 5 of plan.md).
const computeLimiter = makeLimiter({ windowMs: 60 * 1000, max: 5, prefix: "rl:payrun-compute:" });

router.get(
  "/",
  requireAuth,
  requirePermission("payrun:read"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.payrun.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { salaryStructure: true, _count: { select: { payslips: true } } },
      }),
      prisma.payrun.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  requirePermission("payrun:read"),
  asyncHandler(async (req, res) => {
    const payrun = await prisma.payrun.findUnique({
      where: { id: req.params.id },
      include: {
        salaryStructure: true,
        payslips: { include: { employee: true, lines: { include: { salaryRule: true } } } },
      },
    });
    if (!payrun) return res.status(404).json({ error: "Payrun not found" });
    res.json(payrun);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("payrun:write"),
  validateBody(createPayrunSchema),
  asyncHandler(async (req, res) => {
    const { name, salaryStructureId, periodStart, periodEnd, employeeIds } = req.body;

    const structure = await prisma.salaryStructure.findUnique({ where: { id: salaryStructureId } });
    if (!structure) return res.status(404).json({ error: "Salary structure not found" });

    // Selected employees aren't persisted on the Payrun row itself (no schema
    // change made for this) — they're handed to the compute job directly at
    // enqueue time instead. The Payrun starts empty; Payslip rows only start
    // to exist once compute actually resolves a contract for each employee.
    const payrun = await prisma.payrun.create({
      data: { name, salaryStructureId, periodStart, periodEnd, status: "DRAFT" },
    });

    res.status(201).json({ ...payrun, employeeIds });
  })
);

router.post(
  "/:id/compute",
  requireAuth,
  requirePermission("payrun:write"),
  computeLimiter,
  validateBody(z.object({ employeeIds: z.array(z.string().uuid()).min(1) })),
  asyncHandler(async (req, res) => {
    const payrun = await prisma.payrun.findUnique({ where: { id: req.params.id } });
    if (!payrun) return res.status(404).json({ error: "Payrun not found" });
    if (payrun.status !== "DRAFT" && payrun.status !== "COMPUTED") {
      return res.status(409).json({ error: `Cannot compute a Payrun in ${payrun.status} status` });
    }

    await prisma.payrun.update({ where: { id: payrun.id }, data: { status: "COMPUTING" } });

    const job = await payrunComputeQueue.add("compute", {
      payrunId: payrun.id,
      employeeIds: req.body.employeeIds,
      actorUserId: req.user.id,
    });

    res.status(202).json({ jobId: job.id, payrunId: payrun.id, status: "COMPUTING" });
  })
);

router.get(
  "/:id/compute/:jobId",
  requireAuth,
  requirePermission("payrun:read"),
  asyncHandler(async (req, res) => {
    const job = await payrunComputeQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const state = await job.getState();
    res.json({ jobId: job.id, state, progress: job.progress ?? null, returnValue: job.returnvalue ?? null });
  })
);

router.post(
  "/:id/validate",
  requireAuth,
  requirePermission("payrun:write"),
  asyncHandler(async (req, res) => {
    const payrun = await prisma.payrun.findUnique({ where: { id: req.params.id } });
    if (!payrun) return res.status(404).json({ error: "Payrun not found" });
    if (payrun.status !== "COMPUTED" && payrun.status !== "VALIDATED") {
      return res.status(409).json({ error: `Cannot validate a Payrun in ${payrun.status} status` });
    }

    const findings = await validatePayrun(payrun.id);
    const hasBlocking = findings.some((f) => f.blocking);
    const nextStatus = hasBlocking ? "COMPUTED" : "VALIDATED";

    await prisma.$transaction(async (tx) => {
      await tx.payrun.update({ where: { id: payrun.id }, data: { status: nextStatus } });
      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "payrun.validate",
          entityType: "Payrun",
          entityId: payrun.id,
          before: { status: payrun.status },
          after: { status: nextStatus, findings },
        },
      });
    });

    res.json({ payrunId: payrun.id, status: nextStatus, findings });
  })
);

router.post(
  "/:id/mark-paid",
  requireAuth,
  requirePermission("payrun:write"),
  asyncHandler(async (req, res) => {
    const payrun = await prisma.payrun.findUnique({ where: { id: req.params.id } });
    if (!payrun) return res.status(404).json({ error: "Payrun not found" });
    if (payrun.status !== "VALIDATED") {
      return res.status(409).json({ error: "Only a validated Payrun can be marked paid" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payrun.update({ where: { id: payrun.id }, data: { status: "PAID" } });
      await tx.payslip.updateMany({ where: { payrunId: payrun.id }, data: { status: "PAID" } });
      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "payrun.mark_paid",
          entityType: "Payrun",
          entityId: payrun.id,
          before: { status: "VALIDATED" },
          after: { status: "PAID" },
        },
      });
    });

    res.json({ payrunId: payrun.id, status: "PAID" });
  })
);

// Bulk "Send Payslips" (Stage 5.3) — enqueues one payslip-email job per
// payslip rather than looping and sending inline, so a batch of hundreds
// doesn't block this request or let one bad address stall the rest.
router.post(
  "/:id/send-payslips",
  requireAuth,
  requirePermission("payrun:write"),
  asyncHandler(async (req, res) => {
    const payrun = await prisma.payrun.findUnique({
      where: { id: req.params.id },
      include: { payslips: true },
    });
    if (!payrun) return res.status(404).json({ error: "Payrun not found" });
    if (payrun.status !== "PAID") {
      return res.status(409).json({ error: "Only a paid Payrun's payslips can be sent" });
    }

    const jobs = await Promise.all(
      payrun.payslips.map((payslip) =>
        payslipEmailQueue.add("send", { payslipId: payslip.id, actorUserId: req.user.id })
      )
    );

    await prisma.$transaction(async (tx) => {
      await tx.payrun.update({ where: { id: payrun.id }, data: { status: "SENT" } });
      await tx.payslip.updateMany({ where: { payrunId: payrun.id }, data: { status: "SENT" } });
      await tx.auditLog.create({
        data: {
          actorUserId: req.user.id,
          action: "payrun.send_payslips",
          entityType: "Payrun",
          entityId: payrun.id,
          before: { status: "PAID" },
          after: { status: "SENT", jobCount: jobs.length },
        },
      });
    });

    res.status(202).json({ payrunId: payrun.id, status: "SENT", jobIds: jobs.map((j) => j.id) });
  })
);

module.exports = router;
