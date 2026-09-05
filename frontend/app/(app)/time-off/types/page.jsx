"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import Modal from "../../../../components/ui/Modal";
import EmptyState from "../../../../components/ui/EmptyState";
import Stamp from "../../../../components/ui/Stamp";
import TimeOffTypeForm from "../../../../components/timeoff/TimeOffTypeForm";
import TimeOffTabs from "../../../../components/timeoff/TimeOffTabs";

export default function TimeOffTypesPage() {
  const { can } = useAuth();
  const canWrite = can("timeoff:write");

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/api/timeoff-types");
      setTypes(res.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (modal.mode === "create") {
        await api.post("/api/timeoff-types", values);
      } else {
        await api.patch(`/api/timeoff-types/${modal.type.id}`, values);
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
        title="Time off"
        description="Types define how each leave policy behaves."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
              + New type
            </button>
          )
        }
      />
      <TimeOffTabs active="types" />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load time off types: ${loadError}`} />}
      {!loading && !loadError && types.length === 0 && <EmptyState message="No time off types configured yet." />}

      {!loading && !loadError && types.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Unit</th>
              <th>Allocation</th>
              <th>Approver</th>
              <th>Payroll</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{t.name}</td>
                <td className="text-fade">{t.unit}</td>
                <td>
                  <Stamp tone={t.requiresAllocation ? "pending" : "neutral"}>
                    {t.requiresAllocation ? "Required" : "Not required"}
                  </Stamp>
                </td>
                <td className="text-fade">{t.approverRole ?? "—"}</td>
                <td className="text-fade">{t.payrollIntegrated ? "Yes" : "No"}</td>
                <td className="text-right">
                  {canWrite && (
                    <button
                      className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                      onClick={() => setModal({ mode: "edit", type: t })}
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

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "edit" ? "Edit type" : "New time off type"}>
        {modal && (
          <TimeOffTypeForm
            initial={modal.mode === "edit" ? modal.type : undefined}
            submitLabel={modal.mode === "edit" ? "Save changes" : "Create type"}
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
