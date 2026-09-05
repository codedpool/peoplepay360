"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import Modal from "../../../../components/ui/Modal";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";
import EligibleEmployeesPicker from "../../../../components/payruns/EligibleEmployeesPicker";
import { pollJob, printPayslip as downloadPayslipPdf } from "../../../../lib/pdf";
import { formatCurrency } from "../../../../lib/currency";

const STATUS_TONE = {
  DRAFT: "neutral",
  COMPUTING: "pending",
  COMPUTED: "pending",
  VALIDATED: "approved",
  PAID: "approved",
  SENT: "approved",
};

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}
function netAmount(payslip) {
  const line = payslip.lines.find((l) => l.salaryRule.category === "NET");
  return line ? Number(line.amount) : null;
}

export default function PayrunDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can("payrun:write");

  const [payrun, setPayrun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null); // short status label while an action runs
  const [actionError, setActionError] = useState(null);
  const [findings, setFindings] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState([]);
  const [printingId, setPrintingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/api/payruns/${id}`);
      setPayrun(res);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runCompute(employeeIds) {
    setBusy("Computing…");
    setActionError(null);
    try {
      const job = await api.post(`/api/payruns/${id}/compute`, { employeeIds });
      const result = await pollJob(`/api/payruns/${id}/compute/${job.jobId}`);
      if (result.state === "failed") throw new Error("Compute job failed.");
      if (result.state === "timeout") throw new Error("Compute is taking longer than expected — refresh to check.");
      setPickerOpen(false);
      setFindings(null);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function runValidate() {
    setBusy("Validating…");
    setActionError(null);
    try {
      const res = await api.post(`/api/payruns/${id}/validate`);
      setFindings(res.findings);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function runMarkPaid() {
    setBusy("Marking paid…");
    setActionError(null);
    try {
      await api.post(`/api/payruns/${id}/mark-paid`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function runSendPayslips() {
    setBusy("Sending payslips…");
    setActionError(null);
    try {
      await api.post(`/api/payruns/${id}/send-payslips`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function printPayslip(payslipId) {
    setPrintingId(payslipId);
    setActionError(null);
    try {
      await downloadPayslipPdf(payslipId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPrintingId(null);
    }
  }

  function openPicker() {
    setPickerSelection(payrun.payslips.map((p) => p.employeeId));
    setPickerOpen(true);
  }

  if (loading) return <p className="text-fade text-[0.85rem]">Loading…</p>;
  if (loadError) return <EmptyState message={`Couldn't load this payrun: ${loadError}`} />;
  if (!payrun) return null;

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push("/payruns")} className="btn-ghost px-0 mb-4">
        ← Payruns
      </button>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-[1.2rem] font-semibold">{payrun.name}</h1>
          <Stamp tone={STATUS_TONE[payrun.status]}>{payrun.status}</Stamp>
        </div>
      </div>
      <p className="text-[0.85rem] text-fade mb-6">
        {formatDate(payrun.periodStart)} – {formatDate(payrun.periodEnd)} · {payrun.salaryStructure?.name}
      </p>

      <ErrorNote>{actionError}</ErrorNote>

      {canWrite && (
        <div className="flex items-center gap-3 mb-6">
          {(payrun.status === "DRAFT" || payrun.status === "COMPUTED") && (
            <button className="btn-primary" disabled={!!busy} onClick={openPicker}>
              {busy === "Computing…" ? busy : payrun.status === "DRAFT" ? "Compute" : "Recompute"}
            </button>
          )}
          {payrun.status === "COMPUTED" && (
            <button className="btn-secondary" disabled={!!busy} onClick={runValidate}>
              {busy === "Validating…" ? busy : "Validate"}
            </button>
          )}
          {payrun.status === "VALIDATED" && (
            <button className="btn-primary" disabled={!!busy} onClick={runMarkPaid}>
              {busy === "Marking paid…" ? busy : "Mark paid"}
            </button>
          )}
          {payrun.status === "PAID" && (
            <button className="btn-primary" disabled={!!busy} onClick={runSendPayslips}>
              {busy === "Sending payslips…" ? busy : "Send payslips"}
            </button>
          )}
        </div>
      )}

      {findings && (
        <div className="panel px-4 py-4 mb-6">
          <p className="font-medium text-[0.88rem] mb-3">Validation findings</p>
          {findings.length === 0 ? (
            <p className="text-[0.82rem] text-approved">No issues found — ready to mark paid.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[0.82rem]">
                  <Stamp tone={f.blocking ? "blocking" : "pending"}>{f.blocking ? "Blocking" : "Notice"}</Stamp>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2 className="font-medium text-[0.95rem] mb-3">Payslips ({payrun.payslips.length})</h2>
      {payrun.payslips.length === 0 ? (
        <EmptyState message="No payslips yet — compute this payrun to generate them." />
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="text-right">Worked days</th>
              <th className="text-right">Net</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payrun.payslips.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.employee.name}</td>
                <td className="num text-right">{Number(p.workedDays)}</td>
                <td className="num text-right">{netAmount(p) !== null ? formatCurrency(netAmount(p)) : "—"}</td>
                <td>
                  <Stamp tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Stamp>
                </td>
                <td className="text-right">
                  <button
                    className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                    disabled={printingId === p.id}
                    onClick={() => printPayslip(p.id)}
                  >
                    {printingId === p.id ? "Generating…" : "Print"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={payrun.status === "DRAFT" ? "Compute payrun" : "Recompute payrun"}
        width="max-w-xl"
      >
        <div className="flex flex-col gap-5">
          <EligibleEmployeesPicker
            periodStart={payrun.periodStart.slice(0, 10)}
            periodEnd={payrun.periodEnd.slice(0, 10)}
            selected={pickerSelection}
            onChange={setPickerSelection}
          />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setPickerOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!!busy || pickerSelection.length === 0}
              onClick={() => runCompute(pickerSelection)}
            >
              {busy === "Computing…" ? busy : `Compute (${pickerSelection.length})`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
