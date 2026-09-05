const { Worker } = require("bullmq");
const { connection } = require("../lib/queue");
const { prisma } = require("../lib/prisma");
const { renderPayslipPdf } = require("../services/payslipPdf");
const { sendMail } = require("../services/mailer");

// One job per payslip, enqueued in bulk by the parent Payrun's "Send
// Payslips" action (Stage 5.3) — not one job that loops over every employee
// itself, so a single failed send doesn't block or retry the whole batch.
//
// Employee has no email field of its own; delivery only works for employees
// with a linked User account (User.email). An employee with none is a real,
// reportable gap — surfaced as a skipped result, not a silent no-op.
const payslipEmailWorker = new Worker(
  "payslip-email",
  async (job) => {
    const { payslipId, actorUserId } = job.data;

    const payslip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      include: { employee: { include: { user: true } } },
    });
    if (!payslip) {
      throw new Error(`Payslip ${payslipId} not found`);
    }

    if (!payslip.employee.user?.email) {
      return { payslipId, sent: false, reason: "Employee has no linked user account with an email address" };
    }

    // Rendered here rather than via the pdf queue's job result, so this job
    // doesn't depend on job-to-job data passing — it's self-contained and
    // independently retryable.
    await renderPayslipPdf(payslipId);

    const result = await sendMail({
      to: payslip.employee.user.email,
      subject: `Your payslip is ready`,
      body: `Hi ${payslip.employee.name}, your payslip for this pay period has been generated and is attached.`,
      actorUserId,
    });

    return { payslipId, sent: true, to: result.to };
  },
  { connection }
);

payslipEmailWorker.on("failed", (job, err) => {
  console.error(`payslip-email job ${job?.id} failed:`, err);
});

module.exports = { payslipEmailWorker };
