// Standalone worker process — run alongside the API (`npm run worker`), never
// imported by it. Keeping compute out of the API process is what lets Payrun
// compute, PDF generation and bulk email all be slow without ever blocking a
// request thread (Section 6 of plan.md).
require("./workers/payrunCompute.worker");
require("./workers/payslipPdf.worker");
require("./workers/payslipEmail.worker");

console.log("peoplepay360 worker process started (payrun-compute, payslip-pdf, payslip-email)");
