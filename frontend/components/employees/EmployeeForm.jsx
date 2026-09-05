"use client";

import { useState, useEffect } from "react";
import ErrorNote from "../ui/ErrorNote";
import { ROLE_LABELS } from "../../lib/permissions";
import { suggestEmail, generatePassword } from "../../lib/credentials";

const EMPTY = { department: "", jobPosition: "", managerId: "", scheduleId: "", status: "ACTIVE" };
const ROLE_VALUES = Object.keys(ROLE_LABELS);

// Employee.name is one column in the schema — split only at the UI edge, so
// editing an existing employee still shows separate First/Last inputs.
function splitName(fullName) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

// `onSubmit` always receives `{ employee, credentials }` — `credentials` is
// null unless `withLogin` is on and the admin left "create login access" checked.
export default function EmployeeForm({
  initial,
  employees = [],
  schedules = [],
  excludeId,
  showStatus = false,
  withLogin = false,
  existingEmails,
  submitLabel = "Save",
  submitting = false,
  error,
  onSubmit,
  onCancel,
}) {
  const { firstName: initialFirst, lastName: initialLast } = splitName(initial?.name);
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [createLogin, setCreateLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState(() => (withLogin ? generatePassword() : ""));
  const [roles, setRoles] = useState(["EMPLOYEE"]);

  // Keep the suggested email in sync with the name fields until the admin edits it directly.
  useEffect(() => {
    if (!withLogin || emailTouched) return;
    setEmail(firstName || lastName ? suggestEmail(firstName, lastName, existingEmails ?? new Set()) : "");
  }, [withLogin, firstName, lastName, emailTouched, existingEmails]);

  function set(field, value) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function toggleRole(role) {
    setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const employee = {
      name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
      department: values.department,
      jobPosition: values.jobPosition,
      managerId: values.managerId || null,
      scheduleId: values.scheduleId || null,
      ...(showStatus ? { status: values.status } : {}),
    };
    const credentials = withLogin && createLogin ? { email, password, roles } : null;
    onSubmit({ employee, credentials });
  }

  const managerOptions = employees.filter((e) => e.id !== excludeId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group">
          <label className="field-label">First name</label>
          <input required className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Last name</label>
          <input required className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Department</label>
          <input
            required
            className="field"
            value={values.department}
            onChange={(e) => set("department", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Job position</label>
          <input
            required
            className="field"
            value={values.jobPosition}
            onChange={(e) => set("jobPosition", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Manager</label>
          <select className="field" value={values.managerId ?? ""} onChange={(e) => set("managerId", e.target.value)}>
            <option value="">No manager</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Working schedule</label>
          <select
            className="field"
            value={values.scheduleId ?? ""}
            onChange={(e) => set("scheduleId", e.target.value)}
          >
            <option value="">No schedule</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {showStatus && (
          <div className="field-group">
            <label className="field-label">Status</label>
            <select className="field" value={values.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        )}
      </div>

      {withLogin && (
        <div className="panel px-4 py-4">
          <label className="flex items-center gap-2 text-[0.85rem] font-medium mb-1">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
            Create login access
          </label>
          <p className="text-[0.78rem] text-fade mb-4">
            An Employee record alone can&apos;t sign in — this also creates their account. Uncheck this for
            someone who shouldn&apos;t get system access (e.g. a contractor).
          </p>

          {createLogin && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-5">
                <div className="field-group">
                  <label className="field-label">Login email</label>
                  <input
                    type="email"
                    required
                    className="field"
                    value={email}
                    onChange={(e) => {
                      setEmailTouched(true);
                      setEmail(e.target.value);
                    }}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Temporary password</label>
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

              <div>
                <p className="field-label mb-2">Roles</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {ROLE_VALUES.map((role) => (
                    <label key={role} className="flex items-center gap-1.5 text-[0.85rem]">
                      <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
                      {ROLE_LABELS[role]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || (withLogin && createLogin && roles.length === 0)}
          className="btn-primary"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
