"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED"];

function toDateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

// employeeId is only settable on create — the backend's update schema omits it,
// a contract is never reassigned to a different employee after the fact.
export default function ContractForm({
  mode = "create",
  initial,
  employees = [],
  structures = [],
  submitLabel = "Save",
  submitting = false,
  error,
  onSubmit,
  onCancel,
}) {
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate) || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(toDateInput(initial?.endDate));
  const [wage, setWage] = useState(initial?.wage ?? "");
  const [salaryStructureId, setSalaryStructureId] = useState(initial?.salaryStructureId ?? "");
  const [status, setStatus] = useState(initial?.status ?? "DRAFT");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      ...(mode === "create" ? { employeeId } : {}),
      startDate,
      endDate: endDate || null,
      wage: Number(wage),
      salaryStructureId: salaryStructureId || null,
      status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group col-span-2">
          <label className="field-label">Employee</label>
          <select
            required
            disabled={mode === "edit"}
            className="field disabled:text-fade"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Start date</label>
          <input
            type="date"
            required
            className="field num"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">End date</label>
          <input type="date" className="field num" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Wage / month</label>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            className="field num"
            value={wage}
            onChange={(e) => setWage(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Salary structure</label>
          <select className="field" value={salaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
            <option value="">None</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Status</label>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
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
