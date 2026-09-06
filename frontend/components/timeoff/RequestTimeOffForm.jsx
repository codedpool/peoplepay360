"use client";

import { useState, useMemo, useEffect } from "react";
import ErrorNote from "../ui/ErrorNote";
import Stamp from "../ui/Stamp";

// Remaining balance across this type's ACTIVE allocations. The API rejects a
// request that exceeds it (matching the exact allocation resolution approval
// itself uses), so this is disabled here rather than shown as a soft warning
// the submit would silently reject — a request that can never be approved
// shouldn't be submittable in the first place.
// A working day's worth of hours, used only to suggest a duration for
// HOURS-based leave types. The authoritative per-employee figure lives in
// their WorkingSchedule server-side; this is just the default in the form.
const HOURS_PER_WORKING_DAY = 8;

function remainingFor(typeId, allocations) {
  return allocations
    .filter((a) => a.timeOffTypeId === typeId && a.status === "ACTIVE")
    .reduce((sum, a) => sum + Number(a.remaining), 0);
}

export default function RequestTimeOffForm({ types, allocations = [], submitting = false, error, onSubmit, onCancel }) {
  const [timeOffTypeId, setTimeOffTypeId] = useState(types[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState("");
  // Once the employee types their own duration (a half day, say), the dates
  // stop driving it — otherwise picking a date would silently overwrite what
  // they deliberately entered.
  const [durationEdited, setDurationEdited] = useState(false);

  const selectedType = types.find((t) => t.id === timeOffTypeId);
  const unpaidType = types.find((t) => !t.requiresAllocation);

  const remaining = useMemo(
    () => (selectedType?.requiresAllocation ? remainingFor(timeOffTypeId, allocations) : null),
    [selectedType, timeOffTypeId, allocations]
  );
  const requestedAmount = Number(duration) || 0;
  const insufficientBalance = remaining !== null && requestedAmount > 0 && requestedAmount > remaining;

  const datesInverted = Boolean(startDate) && Boolean(endDate) && endDate < startDate;

  // Calendar days the range covers, inclusive of both ends. The API caps
  // duration against this — a two-day range can't burn thirty days of balance
  // — so the same ceiling is shown here rather than letting the submit fail.
  const spanDays =
    startDate && endDate && !datesInverted
      ? Math.round((new Date(endDate) - new Date(startDate)) / 86_400_000) + 1
      : null;
  const durationCeiling =
    spanDays === null ? null : selectedType?.unit === "HOURS" ? spanDays * 24 : spanDays;
  const durationTooLong = durationCeiling !== null && requestedAmount > durationCeiling;

  // Auto-fill the duration from the chosen range: a Mon-Fri request is 5 days
  // without the employee counting them off a calendar. HOURS-based types get
  // the scheduled hours those days represent. Kept as an editable default
  // rather than a locked value, since half days and partial hours are real.
  useEffect(() => {
    if (durationEdited) return;
    if (durationCeiling === null) return;
    const suggested = selectedType?.unit === "HOURS" ? spanDays * HOURS_PER_WORKING_DAY : spanDays;
    setDuration(String(suggested));
  }, [durationCeiling, spanDays, selectedType?.unit, durationEdited]);

  const canSubmit = !datesInverted && !durationTooLong && !insufficientBalance;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ timeOffTypeId, startDate, endDate, duration: requestedAmount });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="field-group">
        <label className="field-label">Time off type</label>
        <select required className="field" value={timeOffTypeId} onChange={(e) => setTimeOffTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {remaining !== null && (
          <p className="text-[0.78rem] text-fade mt-1.5">
            {remaining} {selectedType.unit.toLowerCase()} remaining
          </p>
        )}
        {selectedType && !selectedType.requiresAllocation && (
          <p className="text-[0.78rem] text-fade mt-1.5">No balance required for this leave type.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-5">
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
          <input
            type="date"
            required
            min={startDate || undefined}
            className="field num"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          {datesInverted && (
            <p className="text-[0.75rem] text-stamp mt-1">End date can&apos;t be before the start date.</p>
          )}
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">Duration ({selectedType?.unit?.toLowerCase() ?? "days"})</label>
        <input
          type="number"
          min="0"
          step="0.5"
          max={durationCeiling ?? undefined}
          required
          className="field num"
          value={duration}
          onChange={(e) => {
            setDurationEdited(true);
            setDuration(e.target.value);
          }}
        />
        {durationTooLong ? (
          <p className="text-[0.75rem] text-stamp mt-1">
            Those dates cover {durationCeiling} {selectedType?.unit?.toLowerCase() ?? "days"} — a request
            can&apos;t claim more than that.
          </p>
        ) : (
          durationCeiling !== null && (
            <p className="text-[0.75rem] text-fade mt-1">
              Those dates cover {durationCeiling} {selectedType?.unit?.toLowerCase() ?? "days"}.
            </p>
          )
        )}
      </div>

      {insufficientBalance && (
        <div className="panel border-seal px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Stamp tone="pending">Low balance</Stamp>
            <p className="text-[0.82rem]">
              Only {remaining} {selectedType.unit.toLowerCase()} of {selectedType.name} remaining — this request needs{" "}
              {requestedAmount}.
            </p>
          </div>
          {unpaidType ? (
            <button
              type="button"
              className="text-[0.8rem] text-ledger hover:text-ledger-dark self-start"
              onClick={() => setTimeOffTypeId(unpaidType.id)}
            >
              Switch to {unpaidType.name} instead →
            </button>
          ) : (
            <p className="text-[0.78rem] text-fade">
              Reduce the duration or pick a different leave type — a request over the remaining balance can&apos;t be
              submitted.
            </p>
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
        <button type="submit" disabled={submitting || !canSubmit} className="btn-primary">
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
