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

  // A check-out before its own check-in gives negative worked time, which
  // would then flow into the day fraction and into payroll. The API rejects it
  // too; this stops it being typed.
  const inverted = Boolean(checkOut) && Boolean(checkIn) && checkOut <= checkIn;

  function handleSubmit(e) {
    e.preventDefault();
    if (inverted) return;
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
            min={checkIn || undefined}
            className="field num"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
          {inverted && (
            <p className="text-[0.75rem] text-stamp mt-1">Check-out must be after check-in.</p>
          )}
        </div>
      </div>

      <p className="text-[0.75rem] text-fade -mt-1">
        Worked hours, overtime, the day fraction and the status are all recalculated from these two
        timestamps — they can&apos;t be set directly.
      </p>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || inverted} className="btn-primary">
          {submitting ? "Saving…" : "Save correction"}
        </button>
      </div>
    </form>
  );
}
