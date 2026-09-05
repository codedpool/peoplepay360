"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";
import PageHeader from "../../../../components/ui/PageHeader";
import EmptyState from "../../../../components/ui/EmptyState";
import Stamp from "../../../../components/ui/Stamp";
import Pagination from "../../../../components/ui/Pagination";

const STATUS_TONE = { DRAFT: "neutral", COMPUTED: "pending", VALIDATED: "pending", PAID: "approved", SENT: "approved" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/api/payslips?page=${page}&pageSize=20`);
      setPayslips(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="My payslips" description="Every payslip you've been issued." />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load your payslips: ${loadError}`} />}
      {!loading && !loadError && payslips.length === 0 && <EmptyState message="No payslips yet." />}

      {!loading && !loadError && payslips.length > 0 && (
        <>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Payrun</th>
                <th>Period</th>
                <th className="text-right">Worked days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/me/payslips/${p.id}`} className="font-medium hover:text-ledger">
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
