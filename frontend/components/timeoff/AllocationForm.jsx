"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

function todayPlusYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AllocationForm({ employees, types, submitting = false, error, onSubmit, onCancel }) {
  const [employeeId, setEmployeeId] = useState("");
  const [timeOffTypeId, setTimeOffTypeId] = useState(types[0]?.id ?? "");
  const [allocated, setAllocated] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState(todayPlusYear());

  // A window that runs backwards can never be matched by the approval lookup,
  // so the allocation would silently be unusable. Blocked here as well as
  // server-side.
  const datesInverted = Boolean(validTo) && Boolean(validFrom) && validTo < validFrom;

  function handleSubmit(e) {
    e.preventDefault();
    if (datesInverted) return;
    onSubmit({ employeeId, timeOffTypeId, allocated: Number(allocated), validFrom, validTo });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group col-span-2">
          <label className="field-label">Employee</label>
          <select required className="field" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Time off type</label>
          <select required className="field" value={timeOffTypeId} onChange={(e) => setTimeOffTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Allocated</label>
          <input
            type="number"
            min="0"
            step="0.5"
            required
            className="field num"
            value={allocated}
            onChange={(e) => setAllocated(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Valid from</label>
          <input
            type="date"
            required
            className="field num"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Valid to</label>
          <input
            type="date"
            required
            min={validFrom || undefined}
            className="field num"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
          {datesInverted && (
            <p className="text-[0.75rem] text-stamp mt-1">Valid-to can&apos;t be before valid-from.</p>
          )}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || datesInverted} className="btn-primary">
          {submitting ? "Saving…" : "Grant allocation"}
        </button>
      </div>
    </form>
  );
}
