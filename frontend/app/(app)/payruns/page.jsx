"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Stamp from "../../../components/ui/Stamp";

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

export default function PayrunsPage() {
  const { can } = useAuth();
  const canWrite = can("payrun:write");

  const [payruns, setPayruns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/api/payruns?pageSize=100");
      setPayruns(res.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Payruns"
        description="One payrun per payroll period."
        action={
          canWrite && (
            <Link href="/payruns/new" className="btn-primary">
              + New payrun
            </Link>
          )
        }
      />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load payruns: ${loadError}`} />}
      {!loading && !loadError && payruns.length === 0 && <EmptyState message="No payruns yet." />}

      {!loading && !loadError && payruns.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Payrun</th>
              <th>Period</th>
              <th>Structure</th>
              <th className="text-right">Payslips</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payruns.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/payruns/${p.id}`} className="font-medium hover:text-ledger">
                    {p.name}
                  </Link>
                </td>
                <td className="num text-[0.82rem]">
                  {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                </td>
                <td className="text-fade">{p.salaryStructure?.name ?? "—"}</td>
                <td className="num text-right">{p._count?.payslips ?? 0}</td>
                <td>
                  <Stamp tone={STATUS_TONE[p.status]}>{p.status}</Stamp>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
