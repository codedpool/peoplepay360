"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import PageHeader from "../../../components/ui/PageHeader";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorNote from "../../../components/ui/ErrorNote";
import Stamp from "../../../components/ui/Stamp";
import CredentialRow from "../../../components/ui/CredentialRow";
import UserForm from "../../../components/users/UserForm";
import ResetPasswordForm from "../../../components/users/ResetPasswordForm";
import { ROLE_LABELS } from "../../../lib/permissions";

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [search, setSearch] = useState("");
  // null | {mode:"create"} | {mode:"edit", user} | {mode:"reset", user}
  //      | {mode:"resolve", request, user}
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  // The password an admin just set for someone else, surfaced once so it can
  // be read out or copied — the same one-time handover treatment as a newly
  // created account's credentials.
  const [handoverCredentials, setHandoverCredentials] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersRes, employeesRes, resetsRes] = await Promise.all([
        api.get("/api/users?pageSize=500"),
        api.get("/api/employees?pageSize=500"),
        api.get("/api/password-reset-requests?status=PENDING&pageSize=50"),
      ]);
      setUsers(usersRes.data);
      setEmployees(employeesRes.data);
      setResetRequests(resetsRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const linkedEmployeeIds = useMemo(() => new Set(users.map((u) => u.employeeId).filter(Boolean)), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  function closeModal() {
    setModal(null);
    setFormError(null);
    setHandoverCredentials(null);
  }

  async function handleSubmit(values) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (modal.mode === "create") {
        await api.post("/api/users", values);
        setCreatedCredentials({ email: values.email, password: values.password });
      } else {
        await api.patch(`/api/users/${modal.user.id}`, values);
        setModal(null);
      }
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Both admin reset paths land here. They differ only in which endpoint sets
  // the password — resolving a ticket also closes the ticket server-side.
  async function handleReset({ newPassword }) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (modal.mode === "resolve") {
        await api.post(`/api/password-reset-requests/${modal.request.id}/resolve`, { newPassword });
        setHandoverCredentials({ email: modal.request.email, password: newPassword });
      } else {
        await api.post(`/api/users/${modal.user.id}/reset-password`, { newPassword });
        setHandoverCredentials({ email: modal.user.email, password: newPassword });
      }
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function rejectRequest(id) {
    setActingId(id);
    setActionError(null);
    try {
      await api.post(`/api/password-reset-requests/${id}/reject`);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  function doneAfterCreate() {
    setModal(null);
    setCreatedCredentials(null);
  }

  // Employees not yet linked to any user, plus the one already linked to the
  // account being edited (so its own selection still shows in the dropdown).
  const availableEmployees = employees.filter(
    (e) => !linkedEmployeeIds.has(e.id) || (modal?.mode === "edit" && modal.user.employeeId === e.id)
  );

  const modalTitle = createdCredentials
    ? "User created"
    : handoverCredentials
      ? "Password set"
      : modal?.mode === "edit"
        ? "Edit user"
        : modal?.mode === "reset" || modal?.mode === "resolve"
          ? "Reset password"
          : "New user";

  return (
    <div>
      {/* No "New user" action: accounts are not created from this page. This
          page manages the accounts that already exist — role changes and
          password resets — which is what the reset-request queue below is
          for. */}
      <PageHeader
        title="Users"
        description="Role assignment and password resets for existing login accounts."
      />

      <ErrorNote>{actionError}</ErrorNote>

      {/* Reset requests are raised from the login screen by people who can't
          get in, so this queue is the only place they surface. It sits above
          the user list because it's the actionable work on this page. */}
      {!loading && !loadError && resetRequests.length > 0 && (
        <section className="mb-10">
          <h2 className="font-medium text-[0.95rem] mb-3">
            Password reset requests
            <span className="num ml-2 text-[0.7rem] px-1.5 py-0.5 border border-seal text-seal bg-seal-light rounded-sm">
              {resetRequests.length}
            </span>
          </h2>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Note</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resetRequests.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.email}</td>
                  <td className="text-fade">{r.note || "—"}</td>
                  <td className="num text-[0.82rem] text-fade">{formatDateTime(r.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      disabled={actingId === r.id}
                      className="text-[0.78rem] text-ledger hover:text-ledger-dark mr-3"
                      onClick={() =>
                        setModal({ mode: "resolve", request: r, user: userById[r.userId] ?? null })
                      }
                    >
                      Set password
                    </button>
                    <button
                      disabled={actingId === r.id}
                      className="text-[0.78rem] text-stamp hover:underline"
                      onClick={() => rejectRequest(r.id)}
                    >
                      {actingId === r.id ? "Dismissing…" : "Dismiss"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex items-center gap-4 mb-5">
        <input
          className="field max-w-xs"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load users: ${loadError}`} />}
      {!loading && !loadError && filtered.length === 0 && <EmptyState message="No users match." />}

      {!loading && !loadError && filtered.length > 0 && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Employee</th>
              <th>Roles</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.email}</td>
                <td className="text-fade">{u.employeeId ? employeeById[u.employeeId]?.name ?? "—" : "—"}</td>
                <td className="text-fade">{u.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <Stamp tone={u.isActive ? "approved" : "neutral"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Stamp>
                    {/* Worth showing: it means the password on this account is
                        an admin-issued handover credential, not the person's
                        own, and they can't use the app until they change it. */}
                    {u.mustChangePassword && <Stamp tone="pending">Must reset</Stamp>}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="text-[0.78rem] text-ledger hover:text-ledger-dark mr-3"
                    onClick={() => setModal({ mode: "edit", user: u })}
                  >
                    Edit
                  </button>
                  {/* An admin sets their own password through the normal
                      change-password flow, which requires the current one —
                      the API refuses a self-targeted reset. */}
                  {u.id !== currentUser?.id && (
                    <button
                      className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                      onClick={() => setModal({ mode: "reset", user: u })}
                    >
                      Reset password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={!!modal} onClose={createdCredentials ? doneAfterCreate : closeModal} title={modalTitle}>
        {createdCredentials ? (
          <div className="flex flex-col gap-4">
            <p className="text-[0.85rem] text-fade">
              Share these with the new user now — the password can&apos;t be shown again after you close this.
            </p>
            <div className="panel px-4">
              <CredentialRow label="Login email" value={createdCredentials.email} />
              <CredentialRow label="Password" value={createdCredentials.password} />
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={doneAfterCreate}>
                Done
              </button>
            </div>
          </div>
        ) : handoverCredentials ? (
          <div className="flex flex-col gap-4">
            <p className="text-[0.85rem] text-fade">
              Pass these on now — the password can&apos;t be shown again after you close this. They&apos;ll be
              asked to choose their own the next time they sign in.
            </p>
            <div className="panel px-4">
              <CredentialRow label="Login email" value={handoverCredentials.email} />
              <CredentialRow label="Temporary password" value={handoverCredentials.password} />
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={closeModal}>
                Done
              </button>
            </div>
          </div>
        ) : modal?.mode === "reset" || modal?.mode === "resolve" ? (
          <ResetPasswordForm
            subject={modal.mode === "resolve" ? modal.request.email : modal.user.email}
            submitting={submitting}
            error={formError}
            onSubmit={handleReset}
            onCancel={closeModal}
          />
        ) : (
          modal && (
            <UserForm
              mode={modal.mode}
              initial={modal.mode === "edit" ? modal.user : undefined}
              employees={availableEmployees}
              isSelf={modal.mode === "edit" && modal.user.id === currentUser?.id}
              submitting={submitting}
              error={formError}
              onSubmit={handleSubmit}
              onCancel={closeModal}
            />
          )
        )}
      </Modal>
    </div>
  );
}
