"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../lib/api";
import { printPayslip } from "../../../../../lib/pdf";
import EmptyState from "../../../../../components/ui/EmptyState";
import ErrorNote from "../../../../../components/ui/ErrorNote";
import Stamp from "../../../../../components/ui/Stamp";

const STATUS_TONE = { DRAFT: "neutral", COMPUTED: "pending", VALIDATED: "pending", PAID: "approved", SENT: "approved" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}
function formatMoney(v) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));
}

export default function MyPayslipDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/api/payslips/${id}`);
      setPayslip(res);
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

  return (
    <div className="max-w-2xl">
      <button onClick={() => router.push("/me/payslips")} className="btn-ghost px-0 mb-4">
        ← My payslips
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
      <p className="text-[0.85rem] text-fade mb-6">
        {formatDate(payslip.payrun.periodStart)} – {formatDate(payslip.payrun.periodEnd)} · {Number(payslip.workedDays)} worked days
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
