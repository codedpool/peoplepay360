"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import Stamp from "../../../components/ui/Stamp";
import CorrectionForm from "../../../components/attendance/CorrectionForm";

const STATUS_TONE = { PRESENT: "approved", OVERTIME: "approved", LATE: "pending", MISSING_CHECKOUT: "pending", ABSENT: "blocking" };

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

export default function AttendancePage() {
  const { can } = useAuth();
  const canCorrect = can("attendance:correct");
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [correcting, setCorrecting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
      const [recordsRes, employeesRes] = await Promise.all([
        api.get(`/api/attendance?${params}`),
        api.get("/api/employees?pageSize=100"),
      ]);
      setRecords(recordsRes.data);
      setEmployees(employeesRes.data);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => employeeById[r.employeeId]?.name?.toLowerCase().includes(q));
  }, [records, search, employeeById]);

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
      <PageHeader title="Attendance" description="Check-in and check-out records across the organization." />

      {employeeIdFilter && (
        <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
          <span className="text-fade">Filtered to</span>
          <span className="font-medium">{employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}</span>
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
        <select className="field max-w-[11rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
      {!loading && !loadError && filtered.length === 0 && <EmptyState message="No attendance records match." />}

      {!loading && !loadError && filtered.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Check in</th>
              <th>Check out</th>
              <th className="text-right">Worked</th>
              <th className="text-right">Overtime</th>
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
                <td className="num text-right">{Number(r.overtimeHours) > 0 ? `${Number(r.overtimeHours)}h` : "—"}</td>
                <td className="flex items-center gap-2">
                  <Stamp tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Stamp>
                  {r.isManualCorrection && <span className="text-[0.7rem] text-fade">corrected</span>}
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
