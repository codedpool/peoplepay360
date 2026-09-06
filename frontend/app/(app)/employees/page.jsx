"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorNote from "../../../components/ui/ErrorNote";
import Stamp from "../../../components/ui/Stamp";
import CredentialRow from "../../../components/ui/CredentialRow";
import EmployeeCard from "../../../components/employees/EmployeeCard";
import EmployeeForm from "../../../components/employees/EmployeeForm";
import Link from "next/link";

export default function EmployeesPage() {
  const { can } = useAuth();
  const canWrite = can("employee:write");
  const canReadSchedules = can("schedule:read");
  const canManageUsers = can("user:manage");

  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [existingEmails, setExistingEmails] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState("kanban");
  // Seeded from ?q= (the topbar search hands off here on Enter), then plain
  // local state from there — typing further shouldn't rewrite the URL.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [employeesRes, schedulesRes, usersRes] = await Promise.all([
        api.get("/api/employees?pageSize=500"),
        canReadSchedules ? api.get("/api/schedules?pageSize=500") : Promise.resolve({ data: [] }),
        canManageUsers ? api.get("/api/users?pageSize=500") : Promise.resolve({ data: [] }),
      ]);
      setEmployees(employeesRes.data);
      setSchedules(schedulesRes.data);
      setExistingEmails(new Set(usersRes.data.map((u) => u.email.toLowerCase())));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [canReadSchedules, canManageUsers]);

  useEffect(() => {
    load();
  }, [load]);

  const managerNameById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.name])), [employees]);
  const scheduleNameById = useMemo(() => Object.fromEntries(schedules.map((s) => [s.id, s.name])), [schedules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.department, e.jobPosition].some((v) => v?.toLowerCase().includes(q))
    );
  }, [employees, search]);

  async function handleCreate({ employee, credentials }) {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.post("/api/employees", employee);
      if (credentials) {
        try {
          await api.post("/api/users", { ...credentials, employeeId: created.id });
          setCreatedCredentials({ email: credentials.email, password: credentials.password });
        } catch (err) {
          setFormError(
            `Employee was created, but creating login access failed: ${err.message}. Try again from here, or leave login unchecked and grant access later.`
          );
          await load();
          return;
        }
      } else {
        setShowNew(false);
      }
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    setShowNew(false);
    setCreatedCredentials(null);
    setFormError(null);
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Every person on the payroll, and how to reach their record."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              + New employee
            </button>
          )
        }
      />

      <div className="flex items-center justify-between gap-4 mb-5">
        <input
          className="field max-w-xs"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex border border-line text-[0.8rem]">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 ${view === "kanban" ? "bg-ledger text-paper" : "text-fade hover:text-ink"}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 border-l border-line ${
              view === "list" ? "bg-ledger text-paper" : "text-fade hover:text-ink"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load employees: ${loadError}`} />}

      {!loading && !loadError && filtered.length === 0 && <EmptyState message="No employees match." />}

      {!loading && !loadError && filtered.length > 0 && view === "kanban" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} />
          ))}
        </div>
      )}

      {!loading && !loadError && filtered.length > 0 && view === "list" && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Job position</th>
              <th>Department</th>
              <th>Manager</th>
              <th>Schedule</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/employees/${e.id}`} className="font-medium hover:text-ledger">
                    {e.name}
                  </Link>
                </td>
                <td>{e.jobPosition}</td>
                <td>{e.department}</td>
                <td className="text-fade">{e.managerId ? managerNameById[e.managerId] ?? "—" : "—"}</td>
                <td className="text-fade">{e.scheduleId ? scheduleNameById[e.scheduleId] ?? "—" : "—"}</td>
                <td>
                  <Stamp tone={e.status === "ACTIVE" ? "approved" : "neutral"}>{e.status}</Stamp>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showNew} onClose={closeModal} title={createdCredentials ? "Login created" : "New employee"}>
        {createdCredentials ? (
          <div className="flex flex-col gap-4">
            <ErrorNote>{formError}</ErrorNote>
            <p className="text-[0.85rem] text-fade">
              Share these with the new employee now — the password can&apos;t be shown again after you close this.
            </p>
            <div className="panel px-4">
              <CredentialRow label="Login email" value={createdCredentials.email} />
              <CredentialRow label="Temporary password" value={createdCredentials.password} />
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={closeModal}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <EmployeeForm
            employees={employees}
            schedules={schedules}
            submitLabel="Create employee"
            submitting={submitting}
            error={formError}
            onSubmit={handleCreate}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </div>
  );
}
