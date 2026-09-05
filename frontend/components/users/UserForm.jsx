"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";
import { ROLE_LABELS } from "../../lib/permissions";
import { generatePassword } from "../../lib/credentials";

const ROLE_VALUES = Object.keys(ROLE_LABELS);

// mode "create": email + password + employeeId + roles.
// mode "edit": roles + isActive + employeeId — password has no reset route yet,
// and roles are locked when editing your own account (matches the backend's
// self-role-elevation guard, so the UI never offers what the API will reject).
export default function UserForm({
  mode = "create",
  initial,
  employees = [],
  isSelf = false,
  submitting = false,
  error,
  onSubmit,
  onCancel,
}) {
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState(() => (mode === "create" ? generatePassword() : ""));
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [roles, setRoles] = useState(initial?.roles ?? ["EMPLOYEE"]);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function toggleRole(role) {
    if (isSelf) return;
    setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === "create") {
      onSubmit({ email, password, employeeId: employeeId || null, roles });
    } else {
      onSubmit({ employeeId: employeeId || null, isActive, ...(isSelf ? {} : { roles }) });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {mode === "create" && (
        <div className="grid grid-cols-2 gap-5">
          <div className="field-group">
            <label className="field-label">Work email</label>
            <input
              type="email"
              required
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Password</label>
            <div className="flex items-center gap-2">
              <input
                className="field num"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="text-[0.78rem] text-ledger hover:text-ledger-dark shrink-0"
                onClick={() => setPassword(generatePassword())}
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="field-group">
        <label className="field-label">Linked employee</label>
        <select className="field" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">No linked employee record</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {mode === "edit" && (
        <label className="flex items-center gap-2 text-[0.85rem]">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Account active
        </label>
      )}

      <div>
        <p className="field-label mb-2">Roles</p>
        {isSelf && <p className="text-[0.78rem] text-fade mb-2">You can&apos;t change your own roles.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {ROLE_VALUES.map((role) => (
            <label
              key={role}
              className={`flex items-center gap-1.5 text-[0.85rem] ${isSelf ? "text-fade" : ""}`}
            >
              <input
                type="checkbox"
                disabled={isSelf}
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || roles.length === 0} className="btn-primary">
          {submitting ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
