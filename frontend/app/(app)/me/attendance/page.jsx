"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";

const STATUS_TONE = { PRESENT: "approved", OVERTIME: "approved", LATE: "pending", MISSING_CHECKOUT: "pending", ABSENT: "blocking" };

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

function elapsedLabel(since, until) {
  const ms = until - since;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/api/attendance?pageSize=50");
      setRecords(res.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openSession = useMemo(() => records.find((r) => !r.checkOut) ?? null, [records]);

  useEffect(() => {
    if (!openSession) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [openSession]);

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

  return (
    <div>
      <PageHeader title="My attendance" description="Check in when you start, check out when you're done." />

      <div className="panel px-6 py-5 mb-8 max-w-md">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.85rem] text-fade">Welcome back</p>
          <span className={`inline-block w-2 h-2 rounded-full ${openSession ? "bg-approved" : "bg-fade"}`} />
        </div>
        {openSession ? (
          <>
            <p className="text-[1.05rem] font-semibold mb-1">
              {formatDateTime(openSession.checkIn)} — now
            </p>
            <p className="num text-[0.85rem] text-fade mb-4">
              {elapsedLabel(new Date(openSession.checkIn), now)} today
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
      </div>

      <ErrorNote>{actionError}</ErrorNote>

      <h2 className="font-medium text-[0.95rem] mb-3">History</h2>
      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load your attendance: ${loadError}`} />}
      {!loading && !loadError && records.length === 0 && <EmptyState message="No attendance recorded yet." />}

      {!loading && !loadError && records.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Check in</th>
              <th>Check out</th>
              <th className="text-right">Worked</th>
              <th className="text-right">Overtime</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className="num">{formatDateTime(r.checkIn)}</td>
                <td className="num">{formatDateTime(r.checkOut)}</td>
                <td className="num text-right">{r.workedHours ? `${Number(r.workedHours)}h` : "—"}</td>
                <td className="num text-right">{Number(r.overtimeHours) > 0 ? `${Number(r.overtimeHours)}h` : "—"}</td>
                <td>
                  <Stamp tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Stamp>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
