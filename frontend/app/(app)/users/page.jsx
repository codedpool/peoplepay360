"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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

const PAGE_SIZE = 8;

const ROLE_BADGE_CLASS = {
  EMPLOYEE: "text-slate-600 bg-slate-100",
  HR_MANAGER: "text-sky-700 bg-sky-50",
  HR_PAYROLL_USER: "text-seal bg-seal-light",
  HR_PAYROLL_MANAGER: "text-violet-700 bg-violet-50",
  ADMIN: "text-ledger bg-ledger-light",
};

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

function initialsFor(label) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : label.slice(0, 2);
  return letters.toUpperCase();
}

function RowActions({ onEdit, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-fade hover:text-ink hover:bg-paper transition-colors"
        aria-label="Row actions"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-panel border border-line rounded-xl shadow-lg shadow-ink/10 py-1.5 z-20">
          <button
            className="w-full text-left px-3.5 py-2 text-[0.82rem] text-ink hover:bg-paper transition-colors"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          {onReset && (
            <button
              className="w-full text-left px-3.5 py-2 text-[0.82rem] text-ink hover:bg-paper transition-colors"
              onClick={() => {
                setOpen(false);
                onReset();
              }}
            >
              Reset password
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
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
    return users.filter((u) => {
      if (roleFilter && !u.roles.includes(roleFilter)) return false;
      if (!q) return true;
      const name = u.employeeId ? employeeById[u.employeeId]?.name ?? "" : "";
      return u.email.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, employeeById]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
      <PageHeader
        title="User Management"
        description="Manage platform users, roles and access permissions."
        action={
          <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
            + New User
          </button>
        }
      />

      <ErrorNote>{actionError}</ErrorNote>

      {/* Reset requests are raised from the login screen by people who can't
          get in, so this queue is the only place they surface. It sits above
          the user list because it's the actionable work on this page. */}
      {!loading && !loadError && resetRequests.length > 0 && (
        <section className="panel px-5 py-4 mb-6">
          <h2 className="font-semibold text-[0.92rem] mb-3 flex items-center gap-2">
            Password reset requests
            <span className="num text-[0.68rem] px-1.5 py-0.5 text-white bg-seal rounded-full leading-none">
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

      <div className="panel p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 max-w-xs flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 focus-within:ring-2 focus-within:ring-ledger/20 focus-within:border-ledger transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fade shrink-0">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <input
                  className="flex-1 min-w-0 bg-transparent text-[0.9rem] text-ink placeholder:text-fade/70 focus:outline-none"
                  placeholder="Search users, employees or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="field w-auto max-w-[10rem]"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                {Object.keys(ROLE_LABELS).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
            {loadError && <EmptyState message={`Couldn't load users: ${loadError}`} />}
            {!loading && !loadError && filtered.length === 0 && <EmptyState message="No users match." />}

            {!loading && !loadError && filtered.length > 0 && (
              <>
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th className="text-left">User</th>
                      <th className="text-left">Employee</th>
                      <th className="text-left">Work Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((u) => {
                      const employeeName = u.employeeId ? employeeById[u.employeeId]?.name : null;
                      const displayName = employeeName ?? u.email;
                      return (
                        <tr key={u.id}>
                          <td className="text-left">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-ledger-light text-ledger text-[0.7rem] font-semibold flex items-center justify-center shrink-0">
                                {initialsFor(displayName)}
                              </span>
                              <span className="font-medium">{displayName}</span>
                            </div>
                          </td>
                          <td className="text-fade text-left">{employeeName ?? "—"}</td>
                          <td className="text-fade text-left">{u.email}</td>
                          <td>
                            <div className="flex flex-wrap justify-center gap-1">
                              {u.roles.map((r) => (
                                <span key={r} className={`stamp ${ROLE_BADGE_CLASS[r] ?? "text-fade bg-paper"}`}>
                                  {ROLE_LABELS[r] ?? r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-2">
                              <Stamp tone={u.isActive ? "approved" : "neutral"}>
                                {u.isActive ? "Active" : "Inactive"}
                              </Stamp>
                              {/* Worth showing: it means the password on this account is
                                  an admin-issued handover credential, not the person's
                                  own, and they can't use the app until they change it. */}
                              {u.mustChangePassword && <Stamp tone="pending">Must reset</Stamp>}
                            </div>
                          </td>
                          <td className="text-center">
                            <RowActions
                              onEdit={() => setModal({ mode: "edit", user: u })}
                              // An admin sets their own password through the normal
                              // change-password flow, which requires the current one —
                              // the API refuses a self-targeted reset.
                              onReset={u.id !== currentUser?.id ? () => setModal({ mode: "reset", user: u }) : null}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex items-center justify-between pt-4 mt-1 border-t border-line">
                  <p className="text-[0.8rem] text-fade">
                    Showing {paged.length} of {filtered.length} users
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-8 h-8 rounded-lg border border-line text-fade hover:text-ink hover:border-ink/30 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                      disabled={pageSafe <= 1}
                      onClick={() => setPage(pageSafe - 1)}
                      aria-label="Previous page"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`num w-8 h-8 rounded-lg text-[0.8rem] font-medium transition-colors ${
                          p === pageSafe ? "bg-ledger text-white" : "text-fade hover:bg-paper hover:text-ink"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      className="w-8 h-8 rounded-lg border border-line text-fade hover:text-ink hover:border-ink/30 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                      disabled={pageSafe >= totalPages}
                      onClick={() => setPage(pageSafe + 1)}
                      aria-label="Next page"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
      </div>

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
