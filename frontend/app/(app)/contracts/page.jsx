"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import Stamp from "../../../components/ui/Stamp";
import ContractForm from "../../../components/contracts/ContractForm";
import { formatCurrency } from "../../../lib/currency";

const STATUS_TONE = { ACTIVE: "approved", DRAFT: "pending", EXPIRED: "neutral", CANCELLED: "blocking" };

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export default function ContractsPage() {
  const { can } = useAuth();
  const canWrite = can("contract:write");
  const canReadStructures = can("salarystructure:read");
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeIdFilter = searchParams.get("employeeId");

  const [contracts, setContracts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", contract }
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: "500" });
      if (statusFilter) params.set("status", statusFilter);
      if (employeeIdFilter) params.set("employeeId", employeeIdFilter);
      const [contractsRes, employeesRes, structuresRes] = await Promise.all([
        api.get(`/api/contracts?${params}`),
        api.get("/api/employees?pageSize=500"),
        canReadStructures ? api.get("/api/salary-structures?pageSize=500") : Promise.resolve({ data: [] }),
      ]);
      setContracts(contractsRes.data);
      setEmployees(employeesRes.data);
      setStructures(structuresRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, canReadStructures, employeeIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const structureNameById = useMemo(() => Object.fromEntries(structures.map((s) => [s.id, s.name])), [structures]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => employeeById[c.employeeId]?.name?.toLowerCase().includes(q));
  }, [contracts, search, employeeById]);

  async function handleSubmit(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (modal.mode === "create") {
        await api.post("/api/contracts", values);
      } else {
        await api.patch(`/api/contracts/${modal.contract.id}`, values);
      }
      setModal(null);
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
        title="Contracts"
        description="Every employment contract, past and present."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
              + New contract
            </button>
          )
        }
      />

      {employeeIdFilter && (
        <div className="mb-4 flex items-center gap-2 text-[0.8rem]">
          <span className="text-fade">Filtered to</span>
          <span className="font-medium">{employees.find((e) => e.id === employeeIdFilter)?.name ?? "employee"}</span>
          <button onClick={() => router.push("/contracts")} className="text-ledger hover:text-ledger-dark">
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
        <select className="field max-w-[10rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load contracts: ${loadError}`} />}
      {!loading && !loadError && filtered.length === 0 && <EmptyState message="No contracts match." />}

      {!loading && !loadError && filtered.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Wage / month</th>
              <th>Salary structure</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{employeeById[c.employeeId]?.name ?? "—"}</td>
                <td className="num">{formatDate(c.startDate)}</td>
                <td className="num">{formatDate(c.endDate)}</td>
                <td className="num text-right">{formatCurrency(c.wage)}</td>
                <td className="text-fade">{c.salaryStructureId ? structureNameById[c.salaryStructureId] ?? "—" : "—"}</td>
                <td>
                  <Stamp tone={STATUS_TONE[c.status]}>{c.status}</Stamp>
                </td>
                <td className="text-right">
                  {canWrite && (
                    <button
                      className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                      onClick={() => setModal({ mode: "edit", contract: c })}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? "Edit contract" : "New contract"}
      >
        {modal && (
          <ContractForm
            mode={modal.mode}
            initial={modal.mode === "edit" ? modal.contract : undefined}
            employees={employees}
            structures={structures}
            submitLabel={modal.mode === "edit" ? "Save changes" : "Create contract"}
            submitting={submitting}
            error={formError}
            onSubmit={handleSubmit}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}
