"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import PageHeader from "../../../../components/ui/PageHeader";
import Modal from "../../../../components/ui/Modal";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorNote from "../../../../components/ui/ErrorNote";
import Stamp from "../../../../components/ui/Stamp";
import RequestTimeOffForm from "../../../../components/timeoff/RequestTimeOffForm";

const REQUEST_TONE = { APPROVED: "approved", PENDING: "pending", REFUSED: "blocking", CANCELLED: "neutral" };
const ALLOCATION_TONE = { ACTIVE: "approved", PENDING: "pending", REFUSED: "blocking", EXPIRED: "neutral" };

function formatDate(d) {
  return new Date(d).toLocaleDateString();
}

export default function MyTimeOffPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [requestsRes, allocationsRes, typesRes] = await Promise.all([
        api.get("/api/timeoff-requests?pageSize=50"),
        api.get("/api/timeoff-allocations?pageSize=50"),
        api.get("/api/timeoff-types"),
      ]);
      setRequests(requestsRes.data);
      setAllocations(allocationsRes.data);
      setTypes(typesRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  async function handleSubmit(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/api/timeoff-requests", { ...values, employeeId: user.employeeId });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id) {
    setCancellingId(id);
    setActionError(null);
    try {
      await api.post(`/api/timeoff-requests/${id}/cancel`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="My time off"
        description="Your leave balances and requests."
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Request time off
          </button>
        }
      />

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load your time off: ${loadError}`} />}

      {!loading && !loadError && (
        <>
          <h2 className="font-medium text-[0.95rem] mb-3">Balances</h2>
          {allocations.length === 0 ? (
            <EmptyState message="No allocations yet." />
          ) : (
            <table className="ledger-table mb-8">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="text-right">Allocated</th>
                  <th className="text-right">Taken</th>
                  <th className="text-right">Remaining</th>
                  <th>Valid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{typeById[a.timeOffTypeId]?.name ?? "—"}</td>
                    <td className="num text-right">{Number(a.allocated)}</td>
                    <td className="num text-right">{Number(a.taken)}</td>
                    <td className="num text-right">{Number(a.remaining)}</td>
                    <td className="num text-[0.8rem] text-fade">
                      {formatDate(a.validFrom)} – {formatDate(a.validTo)}
                    </td>
                    <td>
                      <Stamp tone={ALLOCATION_TONE[a.status]}>{a.status}</Stamp>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <ErrorNote>{actionError}</ErrorNote>

          <h2 className="font-medium text-[0.95rem] mb-3">Requests</h2>
          {requests.length === 0 ? (
            <EmptyState message="No requests yet." />
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
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{typeById[r.timeOffTypeId]?.name ?? "—"}</td>
                    <td className="num">{formatDate(r.startDate)}</td>
                    <td className="num">{formatDate(r.endDate)}</td>
                    <td className="num text-right">{Number(r.duration)}</td>
                    <td>
                      <Stamp tone={REQUEST_TONE[r.status]}>{r.status}</Stamp>
                    </td>
                    <td className="text-right">
                      {r.status === "PENDING" && (
                        <button
                          className="text-[0.78rem] text-stamp hover:underline"
                          disabled={cancellingId === r.id}
                          onClick={() => handleCancel(r.id)}
                        >
                          {cancellingId === r.id ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Request time off">
        <RequestTimeOffForm
          types={types}
          allocations={allocations}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
