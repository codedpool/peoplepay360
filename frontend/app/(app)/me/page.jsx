"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Avatar from "../../../components/ui/Avatar";
import Stamp from "../../../components/ui/Stamp";

function Field({ label, value }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[0.9rem]">{value ?? "—"}</p>
    </div>
  );
}

// Manager/schedule names are deliberately not shown: GET /api/employees/:id and
// GET /api/schedules/:id both require either ownership or an elevated role, so
// a plain EMPLOYEE can load their own record but not a colleague's or a
// schedule's — resolving those names isn't something this account can do.
export default function MyProfilePage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const emp = await api.get(`/api/employees/${user.employeeId}`);
      setEmployee(emp);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-fade text-[0.85rem]">Loading…</p>;
  if (loadError) return <EmptyState message={`Couldn't load your profile: ${loadError}`} />;
  if (!employee) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="My profile" description="Your HR record. Ask an Admin if anything here needs updating." />

      <div className="flex items-center gap-4 mb-6">
        <Avatar name={employee.name} size={14} />
        <div>
          <h2 className="text-[1.1rem] font-semibold">{employee.name}</h2>
          <p className="text-[0.85rem] text-fade">
            {employee.jobPosition} · {employee.department}
          </p>
        </div>
      </div>

      <div className="panel px-6 py-6 grid grid-cols-2 gap-x-6 gap-y-5">
        <Field label="Department" value={employee.department} />
        <Field label="Job position" value={employee.jobPosition} />
        <div>
          <p className="field-label">Status</p>
          <Stamp tone={employee.status === "ACTIVE" ? "approved" : "neutral"}>{employee.status}</Stamp>
        </div>
      </div>
    </div>
  );
}
