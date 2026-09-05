"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorNote from "../../../components/ui/ErrorNote";
import Stamp from "../../../components/ui/Stamp";
import CorrectionForm from "../../../components/attendance/CorrectionForm";

const STATUS_TONE = {
  PRESENT: "approved",
  OVERTIME: "approved",
  HALF_DAY: "pending",
  LATE: "pending",
  MISSING_CHECKOUT: "pending",
  ABSENT: "blocking",
};

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

function elapsedLabel(since, until) {
  const ms = until - since;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${String(m).padStart(2, "0")}`;
}

// A record's day fraction is what payroll actually pays on, so it's shown as
// its own column rather than left implicit behind the status label.
function dayLabel(fraction) {
  const value = Number(fraction);
  if (value >= 1) return "1";
  if (value === 0.5) return "½";
  return "0";
}

// One Attendance page for every role, replacing the old /attendance +
// /me/attendance pair. Anyone linked to an employee record gets the check
// in/out panel and their own history; anyone with attendance:read also gets
// the organization-wide table underneath.
export default function AttendancePage() {
  const { user, can } = useAuth();
  const canReadAll = can("attendance:read");
  const canCorrect = can("attendance:correct");
  const hasOwnRecord = Boolean(user?.employeeId);

  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [mine, setMine] = useState([]);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [correcting, setCorrecting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const requests = [];

      // Own history has to be requested with an explicit employeeId: for an
      // elevated caller the unfiltered endpoint returns everyone.
      requests.push(
        hasOwnRecord
          ? api.get(`/api/attendance?employeeId=${user.employeeId}&pageSize=50`)
          : Promise.resolve({ data: [] })
      );

      if (canReadAll) {
        const params = new URLSearchParams({ pageSize: "100" });
        if (statusFilter) params.set("status", statusFilter);
        if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
        requests.push(api.get(`/api/attendance?${params}`));
        requests.push(api.get("/api/employees?pageSize=500"));
      } else {
        requests.push(Promise.resolve({ data: [] }));
        requests.push(Promise.resolve({ data: [] }));
      }

      const [mineRes, allRes, employeesRes] = await Promise.all(requests);
      setMine(mineRes.data);
      setRecords(allRes.data);
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

  const openSession = useMemo(() => mine.find((r) => !r.checkOut) ?? null, [mine]);

  useEffect(() => {
    if (!openSession) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [openSession]);

  const employeeById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => employeeById[r.employeeId]?.name?.toLowerCase().includes(q));
  }, [records, search, employeeById]);

  async function handleCheckIn() {
    setWorking(true);
    setActionError(null);
    try {
      await api.post("/api/attendance", { employeeId: user.employeeId, checkIn: new Date().toISOString() });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleCheckOut() {
    setWorking(true);
    setActionError(null);
    try {
      await api.patch(`/api/attendance/${openSession.id}/checkout`, { checkOut: new Date().toISOString() });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleCorrect(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.patch(`/api/attendance/${correcting.id}/correct`, values);
      setCorrecting(null);
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
        title="Attendance"
        description={
          canReadAll
            ? "Your own check-ins, and the check-in/check-out record across the organization."
            : "Check in when you start, check out when you're done."
        }
      />

      <ErrorNote>{actionError}</ErrorNote>

      {hasOwnRecord && (
        <section className="mb-10">
          <div className="panel px-6 py-5 mb-6 max-w-md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[0.85rem] text-fade">Today</p>
              <span className={`inline-block w-2 h-2 rounded-full ${openSession ? "bg-approved" : "bg-fade"}`} />
            </div>
            {openSession ? (
              <>
                <p className="text-[1.05rem] font-semibold mb-1">
                  {formatDateTime(openSession.checkIn)} — now
                </p>
                <p className="num text-[0.85rem] text-fade mb-4">
                  {elapsedLabel(new Date(openSession.checkIn), now)} so far
                </p>
                <button className="btn-primary w-full" disabled={working} onClick={handleCheckOut}>
                  {working ? "Checking out…" : "Check out"}
                </button>
              </>
            ) : (
              <>
                <p className="text-[0.85rem] text-fade mb-4">No active session right now.</p>
                <button className="btn-primary w-full" disabled={working} onClick={handleCheckIn}>
                  {working ? "Checking in…" : "Check in"}
                </button>
              </>
            )}
            {/* Stated plainly, because the rule changed: a short day no longer
                counts as a whole day's attendance or a whole day's pay. */}
            <p className="text-[0.75rem] text-fade mt-3 leading-relaxed">
              A full scheduled day counts as 1 day, at least half of one counts as ½, and anything shorter
              counts as 0. Payslips are prorated on that.
            </p>
          </div>

          <h2 className="font-medium text-[0.95rem] mb-3">My history</h2>
          {mine.length === 0 ? (
            <EmptyState message="No attendance recorded yet." />
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th className="text-right">Worked</th>
                  <th className="text-right">Overtime</th>
                  <th className="text-right">Day</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{formatDateTime(r.checkIn)}</td>
                    <td className="num">{formatDateTime(r.checkOut)}</td>
                    <td className="num text-right">{r.workedHours ? `${Number(r.workedHours)}h` : "—"}</td>
                    <td className="num text-right">
                      {Number(r.overtimeHours) > 0 ? `${Number(r.overtimeHours)}h` : "—"}
                    </td>
                    <td className="num text-right">{dayLabel(r.dayFraction)}</td>
                    <td>
                      <Stamp tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Stamp>
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
          <h2 className="font-medium text-[0.95rem] mb-3">All records</h2>

          {employeeIdFilter && (
            <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
              <span className="text-fade">Filtered to</span>
              <span className="font-medium">
                {employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}
              </span>
              <button onClick={() => router.push("/attendance")} className="text-ledger hover:text-ledger-dark">
                Clear
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 mb-5">
            <input
              className="field max-w-xs"
              placeholder="Search by employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="field max-w-[11rem]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_TONE).map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
          {loadError && <EmptyState message={`Couldn't load attendance: ${loadError}`} />}
          {!loading && !loadError && filtered.length === 0 && (
            <EmptyState message="No attendance records match." />
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th className="text-right">Worked</th>
                  <th className="text-right">Overtime</th>
                  <th className="text-right">Day</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{employeeById[r.employeeId]?.name ?? "—"}</td>
                    <td className="num">{formatDateTime(r.checkIn)}</td>
                    <td className="num">{formatDateTime(r.checkOut)}</td>
                    <td className="num text-right">{r.workedHours ? `${Number(r.workedHours)}h` : "—"}</td>
                    <td className="num text-right">
                      {Number(r.overtimeHours) > 0 ? `${Number(r.overtimeHours)}h` : "—"}
                    </td>
                    <td className="num text-right">{dayLabel(r.dayFraction)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Stamp tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Stamp>
                        {r.isManualCorrection && <span className="text-[0.7rem] text-fade">corrected</span>}
                      </div>
                    </td>
                    <td className="text-right">
                      {canCorrect && (
                        <button
                          className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                          onClick={() => setCorrecting(r)}
                        >
                          Correct
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

      {!hasOwnRecord && !canReadAll && !loading && (
        <EmptyState message="This account isn't linked to an employee record, so there's no attendance to show." />
      )}

      <Modal open={!!correcting} onClose={() => setCorrecting(null)} title="Correct attendance record">
        {correcting && (
          <CorrectionForm
            record={correcting}
            submitting={submitting}
            error={formError}
            onSubmit={handleCorrect}
            onCancel={() => setCorrecting(null)}
          />
        )}
      </Modal>
    </div>
  );
}
