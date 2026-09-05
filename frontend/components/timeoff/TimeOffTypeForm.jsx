"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

export default function TimeOffTypeForm({ initial, submitLabel = "Save", submitting = false, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "DAYS");
  const [requiresAllocation, setRequiresAllocation] = useState(initial?.requiresAllocation ?? true);
  const [payrollIntegrated, setPayrollIntegrated] = useState(initial?.payrollIntegrated ?? false);
  const [approverRole, setApproverRole] = useState(initial?.approverRole ?? "");
  const [displayColor, setDisplayColor] = useState(initial?.displayColor ?? "");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      name,
      unit,
      requiresAllocation,
      payrollIntegrated,
      approverRole: approverRole || null,
      displayColor: displayColor || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group col-span-2">
          <label className="field-label">Type name</label>
          <input required className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Unit</label>
          <select className="field" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="DAYS">Days</option>
            <option value="HOURS">Hours</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Approver role</label>
          <input
            className="field"
            placeholder="e.g. Manager"
            value={approverRole}
            onChange={(e) => setApproverRole(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[0.85rem]">
          <input type="checkbox" checked={requiresAllocation} onChange={(e) => setRequiresAllocation(e.target.checked)} />
          Requires an allocation before it can be used
        </label>
        <label className="flex items-center gap-2 text-[0.85rem]">
          <input type="checkbox" checked={payrollIntegrated} onChange={(e) => setPayrollIntegrated(e.target.checked)} />
          Integrated with payroll
        </label>
      </div>

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
