"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

const EMPTY = {
  department: "",
  jobPosition: "",
  managerId: "",
  scheduleId: "",
  status: "ACTIVE",
  bankAccountOnFile: false,
};

// Employee.name is one column in the schema — split only at the UI edge, so
// editing an existing employee still shows separate First/Last inputs.
function splitName(fullName) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

// Employee creation is data entry only — it never provisions a login. The
// `{ employee, credentials }` submit shape is kept (with `credentials` always
// null) because the pages calling this still destructure it.
export default function EmployeeForm({
  initial,
  employees = [],
  schedules = [],
  excludeId,
  showStatus = false,
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

  function set(field, value) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const employee = {
      name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
      department: values.department,
      jobPosition: values.jobPosition,
      managerId: values.managerId || null,
      scheduleId: values.scheduleId || null,
      bankAccountOnFile: values.bankAccountOnFile,
      ...(showStatus ? { status: values.status } : {}),
    };
    onSubmit({ employee, credentials: null });
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

      <label className="flex items-center gap-2 text-[0.85rem]">
        <input
          type="checkbox"
          checked={values.bankAccountOnFile}
          onChange={(e) => set("bankAccountOnFile", e.target.checked)}
        />
        Bank account on file
      </label>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
