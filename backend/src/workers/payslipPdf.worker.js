const { Worker } = require("bullmq");
const { connection } = require("../lib/queue");
const { renderPayslipPdf } = require("../services/payslipPdf");

// PDF rendering runs off the request thread like Payrun compute — a batch
// "print all payslips" action shouldn't block on rendering N documents
// synchronously (Section 6 of plan.md). The rendered bytes are the job's
// return value; a caller polls for them the same way Payrun compute is polled.
const payslipPdfWorker = new Worker(
  "payslip-pdf",
  async (job) => {
    const { payslipId } = job.data;
    const bytes = await renderPayslipPdf(payslipId);
    // BullMQ serializes the return value as JSON — base64-encode the binary
    // PDF so it survives that round trip intact.
    return { payslipId, pdfBase64: Buffer.from(bytes).toString("base64") };
  },
  { connection }
);

payslipPdfWorker.on("failed", (job, err) => {
  console.error(`payslip-pdf job ${job?.id} failed:`, err);
});

module.exports = { payslipPdfWorker };
