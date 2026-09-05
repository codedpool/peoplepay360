const { Queue } = require("bullmq");
const { redis } = require("./redis");

// One connection, three named queues — Payrun compute, PDF generation, and
// bulk email all run as background jobs (Section 6 of plan.md) instead of
// inline in a request handler, since payroll compute time grows with
// employee count and a synchronous request would eventually time out.
const connection = redis;

const payrunComputeQueue = new Queue("payrun-compute", { connection });
const payslipPdfQueue = new Queue("payslip-pdf", { connection });
const payslipEmailQueue = new Queue("payslip-email", { connection });

module.exports = { connection, payrunComputeQueue, payslipPdfQueue, payslipEmailQueue };
