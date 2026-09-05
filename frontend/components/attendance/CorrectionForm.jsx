"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CorrectionForm({ record, submitting = false, error, onSubmit, onCancel }) {
  const [checkIn, setCheckIn] = useState(toLocalInput(record.checkIn));
  const [checkOut, setCheckOut] = useState(toLocalInput(record.checkOut));

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      checkIn: checkIn ? new Date(checkIn).toISOString() : undefined,
      checkOut: checkOut ? new Date(checkOut).toISOString() : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-[0.82rem] text-fade">
        This is a manual correction — it will be recorded in the audit log with the before/after values.
      </p>
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group">
          <label className="field-label">Check in</label>
          <input
            type="datetime-local"
            required
            className="field num"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Check out</label>
          <input
            type="datetime-local"
            className="field num"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
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
          {submitting ? "Saving…" : "Save correction"}
        </button>
      </div>
    </form>
  );
}
