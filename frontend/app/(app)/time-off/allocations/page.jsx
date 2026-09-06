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
import AllocationForm from "../../../../components/timeoff/AllocationForm";

const STATUS_TONE = { ACTIVE: "approved", PENDING: "pending", REFUSED: "blocking", EXPIRED: "neutral" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

export default function AllocationsPage() {
  const { can } = useAuth();
  const canWrite = can("timeoff:write");
  const canApprove = can("timeoff:approve");
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [allocations, setAllocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: "500" });
      if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
      const [allocRes, employeesRes, typesRes] = await Promise.all([
        api.get(`/api/timeoff-allocations?${params}`),
        api.get("/api/employees?pageSize=500"),
        api.get("/api/timeoff-types"),
      ]);
      setAllocations(allocRes.data);
      setEmployees(employeesRes.data);
      setTypes(typesRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [employeeIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  // A type with requiresAllocation: false (e.g. Leave Without Pay) is never
  // granted a balance by design — it's unpaid leave approved directly, with
  // nothing to allocate. Listing it here would let HR "grant" an allocation
  // that the request-approval flow can never draw against.
  const allocatableTypes = useMemo(() => types.filter((t) => t.requiresAllocation), [types]);

  async function handleCreate(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/api/timeoff-allocations", values);
      setShowNew(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function act(id, action) {
    setActingId(id);
    setActionError(null);
    try {
      await api.post(`/api/timeoff-allocations/${id}/${action}`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Time off"
        description="Leave balances granted to each employee."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              + Grant allocation
            </button>
          )
        }
      />
      <TimeOffTabs active="allocations" />

      {employeeIdFilter && (
        <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
          <span className="text-fade">Filtered to</span>
          <span className="font-medium">{employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}</span>
          <button onClick={() => router.push("/time-off/allocations")} className="text-ledger hover:text-ledger-dark">
            Clear
          </button>
        </div>
      )}

      <ErrorNote>{actionError}</ErrorNote>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load allocations: ${loadError}`} />}
      {!loading && !loadError && allocations.length === 0 && <EmptyState message="No allocations yet." />}

      {!loading && !loadError && allocations.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th className="text-right">Allocated</th>
              <th className="text-right">Taken</th>
              <th className="text-right">Remaining</th>
              <th>Valid</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{employeeById[a.employeeId]?.name ?? "—"}</td>
                <td className="text-fade">{typeById[a.timeOffTypeId]?.name ?? "—"}</td>
                <td className="num text-right">{Number(a.allocated)}</td>
                <td className="num text-right">{Number(a.taken)}</td>
                <td className="num text-right">{Number(a.remaining)}</td>
                <td className="num text-fade text-[0.8rem]">
                  {formatDate(a.validFrom)} – {formatDate(a.validTo)}
                </td>
                <td>
                  <Stamp tone={STATUS_TONE[a.status]}>{a.status}</Stamp>
                </td>
                <td className="text-right whitespace-nowrap">
                  {canApprove && a.status === "PENDING" && (
                    <>
                      <button
                        disabled={actingId === a.id}
                        className="text-[0.78rem] text-approved hover:underline mr-3"
                        onClick={() => act(a.id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        disabled={actingId === a.id}
                        className="text-[0.78rem] text-stamp hover:underline"
                        onClick={() => act(a.id, "refuse")}
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

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Grant allocation">
        <AllocationForm
          employees={employees}
          types={allocatableTypes}
          submitting={submitting}
          error={formError}
          onSubmit={handleCreate}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  );
}
