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
import { ROLE_LABELS } from "../../../lib/permissions";

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | {mode:"create"} | {mode:"edit", user}
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersRes, employeesRes] = await Promise.all([
        api.get("/api/users?pageSize=100"),
        api.get("/api/employees?pageSize=100"),
      ]);
      setUsers(usersRes.data);
      setEmployees(employeesRes.data);
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
  const linkedEmployeeIds = useMemo(() => new Set(users.map((u) => u.employeeId).filter(Boolean)), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  function closeModal() {
    setModal(null);
    setFormError(null);
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

  function doneAfterCreate() {
    setModal(null);
    setCreatedCredentials(null);
  }

  // Employees not yet linked to any user, plus the one already linked to the
  // account being edited (so its own selection still shows in the dropdown).
  const availableEmployees = employees.filter(
    (e) => !linkedEmployeeIds.has(e.id) || (modal?.mode === "edit" && modal.user.employeeId === e.id)
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Login access and role assignment — separate from the Employee record itself."
        action={
          <button className="btn-primary" onClick={() => setModal({ mode: "create" })}>
            + New user
          </button>
        }
      />

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
                  <Stamp tone={u.isActive ? "approved" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Stamp>
                </td>
                <td className="text-right">
                  <button
                    className="text-[0.78rem] text-ledger hover:text-ledger-dark"
                    onClick={() => setModal({ mode: "edit", user: u })}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!modal}
        onClose={createdCredentials ? doneAfterCreate : closeModal}
        title={createdCredentials ? "User created" : modal?.mode === "edit" ? "Edit user" : "New user"}
      >
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
