"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorNote from "../../../components/ui/ErrorNote";
import Stamp from "../../../components/ui/Stamp";
import Pagination from "../../../components/ui/Pagination";
import { printPayslip as downloadPayslipPdf } from "../../../lib/pdf";

const STATUS_TONE = { DRAFT: "neutral", COMPUTED: "pending", VALIDATED: "pending", PAID: "approved", SENT: "approved" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get(`/api/payslips?${params}`);
      setPayslips(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <div>
      <PageHeader title="Payslips" description="Every payslip ever generated, across all payruns." />

      <div className="flex items-center gap-4 mb-5">
        <select className="field max-w-[11rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote>{actionError}</ErrorNote>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load payslips: ${loadError}`} />}
      {!loading && !loadError && payslips.length === 0 && <EmptyState message="No payslips match." />}

      {!loading && !loadError && payslips.length > 0 && (
        <>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Payrun</th>
                <th>Period</th>
                <th className="text-right">Worked days</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.employee.name}</td>
                  <td>
                    <Link href={`/payruns/${p.payrunId}`} className="text-fade hover:text-ledger">
                      {p.payrun.name}
                    </Link>
                  </td>
                  <td className="num text-[0.82rem] text-fade">
                    {formatDate(p.payrun.periodStart)} – {formatDate(p.payrun.periodEnd)}
                  </td>
                  <td className="num text-right">{Number(p.workedDays)}</td>
                  <td>
                    <Stamp tone={STATUS_TONE[p.status]}>{p.status}</Stamp>
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
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
