"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { printPayslip } from "../../../../lib/pdf";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";

const STATUS_TONE = { DRAFT: "neutral", COMPUTED: "pending", VALIDATED: "pending", PAID: "approved", SENT: "approved" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}
function formatMoney(v) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));
}

// One payslip detail page for everybody, replacing the separate /me/payslips/[id].
// The API already scopes access — an Employee can only fetch their own — so the
// page doesn't need a role-specific variant, only a heading that reads right
// depending on whose payslip it is.
export default function PayslipDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPayslip(await api.get(`/api/payslips/${id}`));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePrint() {
    setPrinting(true);
    setPrintError(null);
    try {
      await printPayslip(id);
    } catch (err) {
      setPrintError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  if (loading) return <p className="text-fade text-[0.85rem]">Loading…</p>;
  if (loadError) return <EmptyState message={`Couldn't load this payslip: ${loadError}`} />;
  if (!payslip) return null;

  const isOwn = payslip.employeeId === user?.employeeId;

  return (
    <div className="max-w-2xl">
      <button onClick={() => router.push("/payslips")} className="btn-ghost px-0 mb-4">
        ← Payslips
      </button>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-[1.2rem] font-semibold">{payslip.payrun.name}</h1>
          <Stamp tone={STATUS_TONE[payslip.status]}>{payslip.status}</Stamp>
        </div>
        <button className="btn-secondary" disabled={printing} onClick={handlePrint}>
          {printing ? "Generating…" : "Download PDF"}
        </button>
      </div>
      <p className="text-[0.85rem] text-fade mb-1">
        {isOwn ? "Your payslip" : payslip.employee?.name} ·{" "}
        {formatDate(payslip.payrun.periodStart)} – {formatDate(payslip.payrun.periodEnd)}
      </p>
      {/* Worked days is now the figure the amounts below were prorated by, so
          it's stated up front rather than buried as a column somewhere. */}
      <p className="num text-[0.82rem] text-fade mb-6">
        {Number(payslip.workedDays)} day{Number(payslip.workedDays) === 1 ? "" : "s"} worked · amounts prorated
        to attendance
      </p>

      <ErrorNote>{printError}</ErrorNote>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Category</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payslip.lines.map((line) => (
            <tr key={line.id}>
              <td className="font-medium">{line.salaryRule.name}</td>
              <td className="text-fade">{line.salaryRule.category}</td>
              <td className="num text-right">{formatMoney(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
