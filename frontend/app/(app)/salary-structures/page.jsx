"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import Stamp from "../../../components/ui/Stamp";
import StructureForm from "../../../components/salaryStructures/StructureForm";

export default function SalaryStructuresPage() {
  const { can } = useAuth();
  const canWrite = can("salarystructure:write");

  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/api/salary-structures?pageSize=100");
      setStructures(res.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/api/salary-structures", values);
      setShowNew(false);
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
        title="Salary structures"
        description="Each structure groups the salary rules used to calculate a payslip."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              + New structure
            </button>
          )
        }
      />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load salary structures: ${loadError}`} />}
      {!loading && !loadError && structures.length === 0 && <EmptyState message="No salary structures yet." />}

      {!loading && !loadError && structures.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Structure</th>
              <th className="text-right">Rules</th>
              <th className="text-right">Active employees</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {structures.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/salary-structures/${s.id}`} className="font-medium hover:text-ledger">
                    {s.name}
                  </Link>
                </td>
                <td className="num text-right">{s.ruleCount}</td>
                <td className="num text-right">{s.activeEmployeeCount}</td>
                <td>
                  <Stamp tone={s.active ? "approved" : "neutral"}>{s.active ? "Active" : "Inactive"}</Stamp>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New salary structure">
        <StructureForm submitLabel="Create structure" submitting={submitting} error={formError} onSubmit={handleCreate} onCancel={() => setShowNew(false)} />
      </Modal>
    </div>
  );
}
