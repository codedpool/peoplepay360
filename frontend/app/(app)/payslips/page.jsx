"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
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

// One Payslips page for every role. An employee sees "My payslips"; anyone
// with payslip:read additionally sees the organization-wide list below it.
// This replaces the old /me/payslips + /payslips pair, which were two copies
// of the same table reading the same endpoint.
export default function PayslipsPage() {
  const { user, can } = useAuth();
  const canReadAll = can("payslip:read");
  const hasOwnRecord = Boolean(user?.employeeId);

  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
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
      const requests = [];

      // Someone who can read every payslip still gets their own section, but
      // it has to be filtered to them explicitly — the unfiltered endpoint
      // returns the whole organization for an elevated caller.
      if (hasOwnRecord) {
        requests.push(api.get(`/api/payslips?employeeId=${user.employeeId}&pageSize=50`));
      } else {
        requests.push(Promise.resolve({ data: [] }));
      }

      if (canReadAll) {
        const params = new URLSearchParams({ page: String(page), pageSize: "20" });
        if (statusFilter) params.set("status", statusFilter);
        requests.push(api.get(`/api/payslips?${params}`));
      } else {
        requests.push(Promise.resolve({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } }));
      }

      const [mineRes, allRes] = await Promise.all(requests);
      setMine(mineRes.data);
      setAll(allRes.data);
      setPagination(allRes.pagination ?? { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, canReadAll, hasOwnRecord, user?.employeeId]);

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
      <PageHeader
        title="Payslips"
        description={
          canReadAll
            ? "Your own payslips, and every payslip generated across all payruns."
            : "Every payslip you've been issued."
        }
      />

      <ErrorNote>{actionError}</ErrorNote>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load payslips: ${loadError}`} />}

      {!loading && !loadError && (
        <>
          {hasOwnRecord && (
            <section className="mb-10">
              <h2 className="font-medium text-[0.95rem] mb-3">My payslips</h2>
              {mine.length === 0 ? (
                <EmptyState message="No payslips issued to you yet." />
              ) : (
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Payrun</th>
                      <th>Period</th>
                      <th className="text-right">Worked days</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/payslips/${p.id}`} className="font-medium hover:text-ledger">
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
                            {printingId === p.id ? "Generating…" : "Download PDF"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {canReadAll && (
            <section>
              <h2 className="font-medium text-[0.95rem] mb-3">All payslips</h2>

              <div className="flex items-center gap-4 mb-5">
                <select
                  className="field max-w-[11rem]"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1);
                    setStatusFilter(e.target.value);
                  }}
                >
                  <option value="">All statuses</option>
                  {Object.keys(STATUS_TONE).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {all.length === 0 ? (
                <EmptyState message="No payslips match." />
              ) : (
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
                      {all.map((p) => (
                        <tr key={p.id}>
                          <td className="font-medium">
                            <Link href={`/payslips/${p.id}`} className="hover:text-ledger">
                              {p.employee.name}
                            </Link>
                          </td>
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
                              {printingId === p.id ? "Generating…" : "Download PDF"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    onPageChange={setPage}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
