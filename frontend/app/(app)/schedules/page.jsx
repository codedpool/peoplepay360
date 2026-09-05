"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import ScheduleForm from "../../../components/schedules/ScheduleForm";

export default function SchedulesPage() {
  const { can } = useAuth();
  const canWrite = can("schedule:write");

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/api/schedules?pageSize=100");
      setSchedules(res.data);
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
        await api.post("/api/schedules", values);
      } else {
        await api.patch(`/api/schedules/${modal.schedule.id}`, values);
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
        title="Working schedules"
        description="Weekly patterns that attendance and payroll compute against."
        action={
          canWrite && (
            <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
              + New schedule
            </button>
          )
        }
      />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load schedules: ${loadError}`} />}
      {!loading && !loadError && schedules.length === 0 && <EmptyState message="No working schedules yet." />}

      {!loading && !loadError && schedules.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th className="text-right">Days / week</th>
              <th className="text-right">Hours / week</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td className="text-fade">{s.type.replace("_", " ")}</td>
                <td className="num text-right">{s.pattern.length}</td>
                <td className="num text-right">{Number(s.weeklyHours)}</td>
                <td className="text-right">
                  {canWrite && (
                    <button
                      className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                      onClick={() => setModal({ mode: "edit", schedule: s })}
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
        title={modal?.mode === "edit" ? "Edit schedule" : "New schedule"}
        width="max-w-2xl"
      >
        {modal && (
          <ScheduleForm
            initial={modal.mode === "edit" ? modal.schedule : undefined}
            submitLabel={modal.mode === "edit" ? "Save changes" : "Create schedule"}
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
