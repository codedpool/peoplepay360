"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import Modal from "../../../../components/ui/Modal";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";
import TimeOffTabs from "../../../../components/timeoff/TimeOffTabs";
import RequestTimeOffForm from "../../../../components/timeoff/RequestTimeOffForm";

const STATUS_TONE = { APPROVED: "approved", PENDING: "pending", REFUSED: "blocking", CANCELLED: "neutral" };
const ALLOCATION_TONE = { ACTIVE: "approved", PENDING: "pending", REFUSED: "blocking", EXPIRED: "neutral" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

// Remaining balance across an employee's ACTIVE allocations for one type. The
// authoritative check (does an allocation actually cover these exact dates)
// still happens server-side inside the approval transaction; this decides what
// the approver is shown and whether the Approve button is live at all.
function remainingFor(employeeId, typeId, allocations) {
  return allocations
    .filter((a) => a.employeeId === employeeId && a.timeOffTypeId === typeId && a.status === "ACTIVE")
    .reduce((sum, a) => sum + Number(a.remaining), 0);
}

// One Time off page for every role, replacing the old /time-off/requests +
// /me/time-off pair. Anyone linked to an employee record sees their balances,
// their own requests and the request form; anyone with timeoff:read also sees
// the organization-wide queue below.
export default function TimeOffRequestsPage() {
  const { user, can } = useAuth();
  const canReadAll = can("timeoff:read");
  const canApprove = can("timeoff:approve");
  const hasOwnRecord = Boolean(user?.employeeId);

  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [myRequests, setMyRequests] = useState([]);
  const [myAllocations, setMyAllocations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actingId, setActingId] = useState(null);
  // Coming from "View all" on an employee's own page should show their full
  // history, not just what's pending — the general admin view still defaults
  // to PENDING since that's the actionable queue.
  const [statusFilter, setStatusFilter] = useState(employeeIdFilter ? "" : "PENDING");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const requestsToRun = [api.get("/api/timeoff-types")];

      // Own data has to be requested with an explicit employeeId: for an
      // elevated caller the unfiltered endpoints return the whole company.
      if (hasOwnRecord) {
        requestsToRun.push(
          api.get(`/api/timeoff-requests?employeeId=${user.employeeId}&pageSize=50`),
          api.get(`/api/timeoff-allocations?employeeId=${user.employeeId}&pageSize=50`)
        );
      } else {
        requestsToRun.push(Promise.resolve({ data: [] }), Promise.resolve({ data: [] }));
      }

      if (canReadAll) {
        const params = new URLSearchParams({ pageSize: "100" });
        if (statusFilter) params.set("status", statusFilter);
        if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
        requestsToRun.push(
          api.get(`/api/timeoff-requests?${params}`),
          api.get("/api/timeoff-allocations?pageSize=100"),
          api.get("/api/employees?pageSize=100")
        );
      } else {
        requestsToRun.push(
          Promise.resolve({ data: [] }),
          Promise.resolve({ data: [] }),
          Promise.resolve({ data: [] })
        );
      }

      const [typesRes, myReqRes, myAllocRes, reqRes, allocRes, employeesRes] = await Promise.all(
        requestsToRun
      );
      setTypes(typesRes.data);
      setMyRequests(myReqRes.data);
      setMyAllocations(myAllocRes.data);
      setRequests(reqRes.data);
      setAllocations(allocRes.data);
      setEmployees(employeesRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, employeeIdFilter, canReadAll, hasOwnRecord, user?.employeeId]);

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

  async function handleSubmit(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/api/timeoff-requests", { ...values, employeeId: user.employeeId });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Time off"
        description={
          canReadAll
            ? "Your own leave, and every request awaiting review or already decided."
            : "Your leave balances and requests."
        }
        action={
          hasOwnRecord && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Request time off
            </button>
          )
        }
      />
      <TimeOffTabs active="requests" />

      <ErrorNote>{actionError}</ErrorNote>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load time off: ${loadError}`} />}

      {!loading && !loadError && (
        <>
          {hasOwnRecord && (
            <section className="mb-10">
              <h2 className="font-medium text-[0.95rem] mb-3">My balances</h2>
              {myAllocations.length === 0 ? (
                <EmptyState message="No allocations yet." />
              ) : (
                <table className="ledger-table mb-8">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th className="text-right">Allocated</th>
                      <th className="text-right">Taken</th>
                      <th className="text-right">Remaining</th>
                      <th>Valid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAllocations.map((a) => (
                      <tr key={a.id}>
                        <td className="font-medium">{typeById[a.timeOffTypeId]?.name ?? "—"}</td>
                        <td className="num text-right">{Number(a.allocated)}</td>
                        <td className="num text-right">{Number(a.taken)}</td>
                        <td className="num text-right">{Number(a.remaining)}</td>
                        <td className="num text-[0.8rem] text-fade">
                          {formatDate(a.validFrom)} – {formatDate(a.validTo)}
                        </td>
                        <td>
                          <Stamp tone={ALLOCATION_TONE[a.status]}>{a.status}</Stamp>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h2 className="font-medium text-[0.95rem] mb-3">My requests</h2>
              {myRequests.length === 0 ? (
                <EmptyState message="No requests yet." />
              ) : (
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Start</th>
                      <th>End</th>
                      <th className="text-right">Duration</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((r) => (
                      <tr key={r.id}>
                        <td className="font-medium">{typeById[r.timeOffTypeId]?.name ?? "—"}</td>
                        <td className="num">{formatDate(r.startDate)}</td>
                        <td className="num">{formatDate(r.endDate)}</td>
                        <td className="num text-right">{Number(r.duration)}</td>
                        <td>
                          <Stamp tone={STATUS_TONE[r.status]}>{r.status}</Stamp>
                        </td>
                        <td className="text-right">
                          {r.status === "PENDING" && (
                            <button
                              className="text-[0.78rem] text-stamp hover:underline"
                              disabled={actingId === r.id}
                              onClick={() => act(r.id, "cancel")}
                            >
                              {actingId === r.id ? "Cancelling…" : "Cancel"}
                            </button>
                          )}
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
              <h2 className="font-medium text-[0.95rem] mb-3">
                {canApprove ? "Approval queue" : "All requests"}
              </h2>

              {employeeIdFilter && (
                <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
                  <span className="text-fade">Filtered to</span>
                  <span className="font-medium">
                    {employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}
                  </span>
                  <button
                    onClick={() => router.push("/time-off/requests")}
                    className="text-ledger hover:text-ledger-dark"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="flex items-center gap-4 mb-5">
                <select
                  className="field max-w-[11rem]"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {Object.keys(STATUS_TONE).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {requests.length === 0 ? (
                <EmptyState message="No requests match." />
              ) : (
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
                      const needsBalance = Boolean(type?.requiresAllocation);
                      const remaining = needsBalance
                        ? remainingFor(r.employeeId, r.timeOffTypeId, allocations)
                        : null;
                      const short = remaining !== null && Number(r.duration) > remaining;
                      const busy = actingId === r.id;

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
                                {/* Approve is disabled outright when the
                                    balance can't cover the request, rather
                                    than left clickable to fail server-side.
                                    The server still rejects it either way —
                                    this just stops an approver discovering
                                    the problem only after they've clicked. */}
                                <button
                                  disabled={busy || short}
                                  title={
                                    short
                                      ? `Insufficient balance: ${remaining} remaining, ${Number(r.duration)} requested`
                                      : undefined
                                  }
                                  className="text-[0.78rem] text-approved hover:underline mr-3 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                                  onClick={() => act(r.id, "approve")}
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={busy}
                                  className="text-[0.78rem] text-stamp hover:underline"
                                  onClick={() => act(r.id, "refuse")}
                                >
                                  Refuse
                                </button>
                              </>
                            )}
                            {/* Reversing an approval after the fact. The
                                deducted balance goes back to the allocation
                                it came from. */}
                            {canApprove && r.status === "APPROVED" && (
                              <button
                                disabled={busy}
                                className="text-[0.78rem] text-stamp hover:underline"
                                onClick={() => act(r.id, "cancel")}
                              >
                                {busy ? "Cancelling…" : "Cancel approval"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {!hasOwnRecord && !canReadAll && (
            <EmptyState message="This account isn't linked to an employee record, so there's no time off to show." />
          )}
        </>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Request time off">
        <RequestTimeOffForm
          types={types}
          allocations={myAllocations}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
