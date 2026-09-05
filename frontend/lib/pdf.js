import { api } from "./api";

// PDF generation is a queued job (see backend/src/routes/payslips.routes.js) —
// poll returns JSON {jobId, state} while pending, then the actual PDF bytes
// once complete, which api.js's content-type sniffing hands back as a Blob.
export async function pollJob(getUrl) {
  for (let i = 0; i < 30; i++) {
    const res = await api.get(getUrl);
    if (res instanceof Blob) return { state: "completed", blob: res };
    if (res.state === "completed" || res.state === "failed") return res;
    await new Promise((r) => setTimeout(r, 800));
  }
  return { state: "timeout" };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function printPayslip(payslipId) {
  const job = await api.post(`/api/payslips/${payslipId}/print`);
  const result = await pollJob(`/api/payslips/${payslipId}/print/${job.jobId}`);
  if (result.state !== "completed" || !result.blob) throw new Error("Couldn't generate the PDF in time.");
  downloadBlob(result.blob, `payslip-${payslipId}.pdf`);
}
