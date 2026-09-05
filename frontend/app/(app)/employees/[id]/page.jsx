"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import Avatar from "../../../../components/ui/Avatar";
import Stamp from "../../../../components/ui/Stamp";
import EmployeeForm from "../../../../components/employees/EmployeeForm";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import { formatCurrency } from "../../../../lib/currency";

const CONTRACT_TONE = { ACTIVE: "approved", DRAFT: "pending", EXPIRED: "neutral", CANCELLED: "blocking" };
const ATTENDANCE_TONE = { PRESENT: "approved", OVERTIME: "approved", LATE: "pending", MISSING_CHECKOUT: "pending", ABSENT: "blocking" };
const ALLOCATION_TONE = { ACTIVE: "approved", PENDING: "pending", REFUSED: "blocking", EXPIRED: "neutral" };
const REQUEST_TONE = { APPROVED: "approved", PENDING: "pending", REFUSED: "blocking", CANCELLED: "neutral" };

function Field({ label, value }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[0.9rem]">{value ?? "—"}</p>
    </div>
  );
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}
function formatDateTime(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

function SectionHeader({ title, viewAllHref }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-medium text-[0.95rem]">{title}</h2>
      {viewAllHref && (
        <Link href={viewAllHref} className="text-[0.78rem] text-ledger hover:text-ledger-dark">
          View all →
        </Link>
      )}
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can("employee:write");
  const canReadSchedules = can("schedule:read");
  const canReadContracts = can("contract:read");
  const canReadAttendance = can("attendance:read");
  const canReadTimeOff = can("timeoff:read");
  const canApproveTimeOff = can("timeoff:approve");

  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [contracts, setContracts] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [allocations, setAllocations] = useState(null);
  const [requests, setRequests] = useState(null);
  const [timeOffTypes, setTimeOffTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [emp, employeesRes, schedulesRes, contractsRes, attendanceRes, allocationsRes, requestsRes, typesRes] =
        await Promise.all([
          api.get(`/api/employees/${id}`),
          api.get("/api/employees?pageSize=500"),
          canReadSchedules ? api.get("/api/schedules?pageSize=500") : Promise.resolve({ data: [] }),
          canReadContracts ? api.get(`/api/contracts?employeeId=${id}&pageSize=10`) : Promise.resolve(null),
          canReadAttendance ? api.get(`/api/attendance?employeeId=${id}&pageSize=10`) : Promise.resolve(null),
          canReadTimeOff ? api.get(`/api/timeoff-allocations?employeeId=${id}&pageSize=20`) : Promise.resolve(null),
          canReadTimeOff ? api.get(`/api/timeoff-requests?employeeId=${id}&pageSize=10`) : Promise.resolve(null),
          canReadTimeOff ? api.get("/api/timeoff-types") : Promise.resolve({ data: [] }),
        ]);
      setEmployee(emp);
      setEmployees(employeesRes.data);
      setSchedules(schedulesRes.data);
      setContracts(contractsRes);
      setAttendance(attendanceRes);
      setAllocations(allocationsRes);
      setRequests(requestsRes);
      setTimeOffTypes(typesRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, canReadSchedules, canReadContracts, canReadAttendance, canReadTimeOff]);

  useEffect(() => {
    load();
  }, [load]);

  const typeById = useMemo(() => Object.fromEntries(timeOffTypes.map((t) => [t.id, t])), [timeOffTypes]);

  async function handleSave({ employee: values }) {
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await api.patch(`/api/employees/${id}`, values);
      setEmployee(updated);
      setEditing(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function actOnRequest(requestId, action) {
    setActingId(requestId);
    setActionError(null);
    try {
      await api.post(`/api/timeoff-requests/${requestId}/${action}`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <p className="text-fade text-[0.85rem]">Loading…</p>;
  if (loadError) return <EmptyState message={`Couldn't load this employee: ${loadError}`} />;
  if (!employee) return null;

  const managerName = employee.managerId ? employees.find((e) => e.id === employee.managerId)?.name : null;
  const scheduleName = employee.scheduleId ? schedules.find((s) => s.id === employee.scheduleId)?.name : null;

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push("/employees")} className="btn-ghost px-0 mb-4">
        ← Employees
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Avatar name={employee.name} size={14} />
          <div>
            <h1 className="text-[1.2rem] font-semibold">{employee.name}</h1>
            <p className="text-[0.85rem] text-fade">
              {employee.jobPosition} · {employee.department}
            </p>
          </div>
        </div>
        {canWrite && !editing && (
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      <div className="panel px-6 py-6 mb-8">
        {editing ? (
          <EmployeeForm
            initial={{
              name: employee.name,
              department: employee.department,
              jobPosition: employee.jobPosition,
              managerId: employee.managerId ?? "",
              scheduleId: employee.scheduleId ?? "",
              status: employee.status,
              bankAccountOnFile: employee.bankAccountOnFile,
            }}
            employees={employees}
            schedules={schedules}
            excludeId={employee.id}
            showStatus
            submitLabel="Save changes"
            submitting={submitting}
            error={formError}
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Field label="Department" value={employee.department} />
            <Field label="Job position" value={employee.jobPosition} />
            <Field label="Manager" value={managerName} />
            <Field label="Working schedule" value={scheduleName} />
            <div>
              <p className="field-label">Status</p>
              <Stamp tone={employee.status === "ACTIVE" ? "approved" : "neutral"}>{employee.status}</Stamp>
            </div>
            <div>
              <p className="field-label">Bank account</p>
              <Stamp tone={employee.bankAccountOnFile ? "approved" : "pending"}>
                {employee.bankAccountOnFile ? "On file" : "Missing"}
              </Stamp>
            </div>
          </div>
        )}
      </div>

      {canReadContracts && contracts && (
        <div className="mb-8">
          <SectionHeader title="Contracts" viewAllHref={`/contracts?employeeId=${id}`} />
          {contracts.data.length === 0 ? (
            <EmptyState message="No contracts yet." />
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th className="text-right">Wage / month</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.data.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{formatDate(c.startDate)}</td>
                    <td className="num">{formatDate(c.endDate)}</td>
                    <td className="num text-right">{formatCurrency(c.wage)}</td>
                    <td>
                      <Stamp tone={CONTRACT_TONE[c.status]}>{c.status}</Stamp>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {canReadTimeOff && allocations && requests && (
        <div className="mb-8">
          <SectionHeader title="Time off" viewAllHref={`/time-off/requests?employeeId=${id}`} />

          <ErrorNote>{actionError}</ErrorNote>

          {allocations.data.length === 0 ? (
            <EmptyState message="No leave allocations yet." />
          ) : (
            <table className="ledger-table mb-4">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="text-right">Allocated</th>
                  <th className="text-right">Taken</th>
                  <th className="text-right">Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allocations.data.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{typeById[a.timeOffTypeId]?.name ?? "—"}</td>
                    <td className="num text-right">{Number(a.allocated)}</td>
                    <td className="num text-right">{Number(a.taken)}</td>
                    <td className="num text-right">{Number(a.remaining)}</td>
                    <td>
                      <Stamp tone={ALLOCATION_TONE[a.status]}>{a.status}</Stamp>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {requests.data.length === 0 ? (
            <EmptyState message="No leave requests yet." />
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
                {requests.data.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{typeById[r.timeOffTypeId]?.name ?? "—"}</td>
                    <td className="num">{formatDate(r.startDate)}</td>
                    <td className="num">{formatDate(r.endDate)}</td>
                    <td className="num text-right">{Number(r.duration)}</td>
                    <td>
                      <Stamp tone={REQUEST_TONE[r.status]}>{r.status}</Stamp>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canApproveTimeOff && r.status === "PENDING" && (
                        <>
                          <button
                            disabled={actingId === r.id}
                            className="text-[0.78rem] text-approved hover:underline mr-3"
                            onClick={() => actOnRequest(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            disabled={actingId === r.id}
                            className="text-[0.78rem] text-stamp hover:underline"
                            onClick={() => actOnRequest(r.id, "refuse")}
                          >
                            Refuse
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {canReadAttendance && attendance && (
        <div className="mb-8">
          <SectionHeader title="Attendance" viewAllHref={`/attendance?employeeId=${id}`} />
          {attendance.data.length === 0 ? (
            <EmptyState message="No attendance recorded yet." />
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th className="text-right">Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.data.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{formatDateTime(a.checkIn)}</td>
                    <td className="num">{formatDateTime(a.checkOut)}</td>
                    <td className="num text-right">{a.workedHours ? `${Number(a.workedHours)}h` : "—"}</td>
                    <td>
                      <Stamp tone={ATTENDANCE_TONE[a.status]}>{a.status.replace("_", " ")}</Stamp>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
