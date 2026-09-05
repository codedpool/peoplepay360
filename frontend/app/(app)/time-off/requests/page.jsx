"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";
import TimeOffTabs from "../../../../components/timeoff/TimeOffTabs";

const STATUS_TONE = { APPROVED: "approved", PENDING: "pending", REFUSED: "blocking", CANCELLED: "neutral" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

// Advisory only — sums remaining across the employee's ACTIVE allocations for
// this type. The real check (does an allocation actually cover these exact
// dates) happens server-side at approval time; this just flags likely
// trouble before an approver clicks the button.
function remainingFor(employeeId, typeId, allocations) {
  return allocations
    .filter((a) => a.employeeId === employeeId && a.timeOffTypeId === typeId && a.status === "ACTIVE")
    .reduce((sum, a) => sum + Number(a.remaining), 0);
}

export default function TimeOffRequestsPage() {
  const { can } = useAuth();
  const canApprove = can("timeoff:approve");
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Coming from "View all" on an employee's own page should show their full
  // history, not just what's pending — the general admin view still defaults
  // to PENDING since that's the actionable queue.
  const [statusFilter, setStatusFilter] = useState(employeeIdFilter ? "" : "PENDING");
  const [actionError, setActionError] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
      const [reqRes, employeesRes, typesRes, allocRes] = await Promise.all([
        api.get(`/api/timeoff-requests?${params}`),
        api.get("/api/employees?pageSize=100"),
        api.get("/api/timeoff-types"),
        api.get("/api/timeoff-allocations?pageSize=100"),
      ]);
      setRequests(reqRes.data);
      setEmployees(employeesRes.data);
      setTypes(typesRes.data);
      setAllocations(allocRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, employeeIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  async function act(id, action) {
    setActingId(id);
    setActionError(null);
    try {
      await api.post(`/api/timeoff-requests/${id}/${action}`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Time off" description="Leave requests awaiting review, or already decided." />
      <TimeOffTabs active="requests" />

      {employeeIdFilter && (
        <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
          <span className="text-fade">Filtered to</span>
          <span className="font-medium">{employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}</span>
          <button onClick={() => router.push("/time-off/requests")} className="text-ledger hover:text-ledger-dark">
            Clear
          </button>
        </div>
      )}

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
      {loadError && <EmptyState message={`Couldn't load requests: ${loadError}`} />}
      {!loading && !loadError && requests.length === 0 && <EmptyState message="No requests match." />}

      {!loading && !loadError && requests.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Duration</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const type = typeById[r.timeOffTypeId];
              const remaining = type?.requiresAllocation ? remainingFor(r.employeeId, r.timeOffTypeId, allocations) : null;
              const short = remaining !== null && Number(r.duration) > remaining;
              return (
                <tr key={r.id}>
                  <td className="font-medium">{employeeById[r.employeeId]?.name ?? "—"}</td>
                  <td className="text-fade">{type?.name ?? "—"}</td>
                  <td className="num">{formatDate(r.startDate)}</td>
                  <td className="num">{formatDate(r.endDate)}</td>
                  <td className="num text-right">
                    {Number(r.duration)} {type?.unit?.toLowerCase() ?? ""}
                  </td>
                  <td>
                    {remaining === null ? (
                      <span className="text-fade text-[0.8rem]">No balance needed</span>
                    ) : (
                      <span className={`num text-[0.8rem] ${short ? "text-stamp" : "text-fade"}`}>
                        {remaining} remaining{short ? " — insufficient" : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    <Stamp tone={STATUS_TONE[r.status]}>{r.status}</Stamp>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {canApprove && r.status === "PENDING" && (
                      <>
                        <button
                          disabled={actingId === r.id}
                          className="text-[0.78rem] text-approved hover:underline mr-3"
                          onClick={() => act(r.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          disabled={actingId === r.id}
                          className="text-[0.78rem] text-stamp hover:underline"
                          onClick={() => act(r.id, "refuse")}
                        >
                          Refuse
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
