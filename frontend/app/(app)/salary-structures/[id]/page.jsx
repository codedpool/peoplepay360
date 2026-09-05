"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import Modal from "../../../../components/ui/Modal";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";
import StructureForm from "../../../../components/salaryStructures/StructureForm";
import RuleForm from "../../../../components/salaryStructures/RuleForm";

export default function SalaryStructureDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { can } = useAuth();
  const canWriteStructure = can("salarystructure:write");
  const canWriteRule = can("salaryrule:write");

  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingStructure, setEditingStructure] = useState(false);
  const [ruleModal, setRuleModal] = useState(null); // null | {mode:"create"} | {mode:"edit", rule}
  const [deletingRule, setDeletingRule] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/api/salary-structures/${id}`);
      setStructure(res);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveStructure(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.patch(`/api/salary-structures/${id}`, values);
      setEditingStructure(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveRule(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (ruleModal.mode === "create") {
        await api.post(`/api/salary-structures/${id}/rules`, values);
      } else {
        await api.patch(`/api/salary-structures/${id}/rules/${ruleModal.rule.id}`, values);
      }
      setRuleModal(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRule() {
    setSubmitting(true);
    setActionError(null);
    try {
      await api.del(`/api/salary-structures/${id}/rules/${deletingRule.id}`);
      setDeletingRule(null);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-fade text-[0.85rem]">Loading…</p>;
  if (loadError) return <EmptyState message={`Couldn't load this structure: ${loadError}`} />;
  if (!structure) return null;

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.push("/salary-structures")} className="btn-ghost px-0 mb-4">
        ← Salary structures
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[1.2rem] font-semibold">{structure.name}</h1>
          <Stamp tone={structure.active ? "approved" : "neutral"}>{structure.active ? "Active" : "Inactive"}</Stamp>
        </div>
        {canWriteStructure && (
          <button className="btn-secondary" onClick={() => setEditingStructure(true)}>
            Edit
          </button>
        )}
      </div>

      <ErrorNote>{actionError}</ErrorNote>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-[0.95rem]">Salary rules</h2>
        {canWriteRule && (
          <button
            className="btn-secondary"
            onClick={() => setRuleModal({ mode: "create" })}
          >
            + Add rule
          </button>
        )}
      </div>

      {structure.rules.length === 0 ? (
        <EmptyState message="No rules yet — a structure with no rules can't compute a payslip." />
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="text-right">Seq</th>
              <th>Name</th>
              <th>Code</th>
              <th>Category</th>
              <th>Method</th>
              <th>Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {structure.rules.map((r) => (
              <tr key={r.id}>
                <td className="num text-right">{r.sequence}</td>
                <td className="font-medium">{r.name}</td>
                <td className="num text-fade">{r.code}</td>
                <td className="text-fade">{r.category}</td>
                <td className="text-fade">{r.computationMethod}</td>
                <td className="num">{r.formulaOrValue}</td>
                <td className="text-right whitespace-nowrap">
                  {canWriteRule && (
                    <>
                      <button
                        className="text-[0.78rem] text-ledger hover:text-ledger-dark mr-3"
                        onClick={() => setRuleModal({ mode: "edit", rule: r })}
                      >
                        Edit
                      </button>
                      <button
                        className="text-[0.78rem] text-stamp hover:underline"
                        onClick={() => setDeletingRule(r)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={editingStructure} onClose={() => setEditingStructure(false)} title="Edit structure">
        <StructureForm
          initial={structure}
          submitLabel="Save changes"
          submitting={submitting}
          error={formError}
          onSubmit={handleSaveStructure}
          onCancel={() => setEditingStructure(false)}
        />
      </Modal>

      <Modal open={!!ruleModal} onClose={() => setRuleModal(null)} title={ruleModal?.mode === "edit" ? "Edit rule" : "New rule"}>
        {ruleModal && (
          <RuleForm
            initial={ruleModal.mode === "edit" ? ruleModal.rule : undefined}
            nextSequence={(structure.rules.at(-1)?.sequence ?? 0) + 10}
            submitLabel={ruleModal.mode === "edit" ? "Save changes" : "Add rule"}
            submitting={submitting}
            error={formError}
            onSubmit={handleSaveRule}
            onCancel={() => setRuleModal(null)}
          />
        )}
      </Modal>

      <Modal open={!!deletingRule} onClose={() => setDeletingRule(null)} title="Delete rule">
        {deletingRule && (
          <div className="flex flex-col gap-5">
            <p className="text-[0.85rem]">
              Delete <strong>{deletingRule.name}</strong>? This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setDeletingRule(null)}>
                Cancel
              </button>
              <button className="btn-danger" disabled={submitting} onClick={handleDeleteRule}>
                {submitting ? "Deleting…" : "Delete rule"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
