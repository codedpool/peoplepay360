const express = require("express");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { isElevated } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { payslipPdfQueue } = require("../lib/queue");

const router = express.Router();

// Any HR-tier role may read/print any payslip; an Employee only their own —
// same ownership pattern as attendance/time-off, no separate payslip:read
// permission needed since "elevated at all" is the bar here.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};

    if (!isElevated(req.user.roles)) {
      where.employeeId = req.user.employeeId;
    } else if (req.query.employeeId) {
      where.employeeId = req.query.employeeId;
    }
    if (req.query.payrunId) where.payrunId = req.query.payrunId;
    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.payslip.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { employee: true, payrun: true },
      }),
      prisma.payslip.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: { employee: true, contract: true, payrun: true, lines: { include: { salaryRule: true } } },
    });
    if (!payslip) return res.status(404).json({ error: "Payslip not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, payslip.employeeId)) return;
    }

    res.json(payslip);
  })
);

// "Print Payslip" (Stage 5.3) — enqueues PDF rendering and returns a job id
// to poll, same pattern as Payrun compute, rather than rendering inline and
// blocking the request.
router.post(
  "/:id/print",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payslip = await prisma.payslip.findUnique({ where: { id: req.params.id } });
    if (!payslip) return res.status(404).json({ error: "Payslip not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, payslip.employeeId)) return;
    }

    const job = await payslipPdfQueue.add("render", { payslipId: payslip.id });
    res.status(202).json({ jobId: job.id, payslipId: payslip.id });
  })
);

router.get(
  "/:id/print/:jobId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payslip = await prisma.payslip.findUnique({ where: { id: req.params.id } });
    if (!payslip) return res.status(404).json({ error: "Payslip not found" });

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, payslip.employeeId)) return;
    }

    const job = await payslipPdfQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const state = await job.getState();
    if (state !== "completed") {
      return res.json({ jobId: job.id, state });
    }

    const { pdfBase64 } = job.returnvalue;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="payslip-${payslip.id}.pdf"`);
    res.send(Buffer.from(pdfBase64, "base64"));
  })
);

module.exports = router;
