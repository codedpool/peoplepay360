"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TYPES = ["FULL_TIME", "PART_TIME", "SHIFT"];

function buildInitialPattern(pattern) {
  const byDay = Object.fromEntries((pattern ?? []).map((p) => [p.day, p]));
  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      byDay[day]
        ? { enabled: true, start: byDay[day].start, end: byDay[day].end, break: byDay[day].break }
        : { enabled: false, start: "09:00", end: "17:00", break: 60 },
    ])
  );
}

// weeklyHours is never submitted — the backend derives it from `pattern` server-side.
export default function ScheduleForm({ initial, submitLabel = "Save", submitting = false, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "FULL_TIME");
  const [days, setDays] = useState(() => buildInitialPattern(initial?.pattern));

  function setDay(day, patch) {
    setDays((d) => ({ ...d, [day]: { ...d[day], ...patch } }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const pattern = DAYS.filter((day) => days[day].enabled).map((day) => ({
      day,
      start: days[day].start,
      end: days[day].end,
      break: Number(days[day].break) || 0,
    }));
    onSubmit({ name, type, pattern });
  }

  const activeCount = DAYS.filter((day) => days[day].enabled).length;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group">
          <label className="field-label">Schedule name</label>
          <input required className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Type</label>
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="field-label mb-2">Weekly pattern</p>
        <div className="panel divide-y divide-line">
          {DAYS.map((day) => (
            <div key={day} className="flex items-center gap-4 px-3 py-2">
              <label className="flex items-center gap-2 w-20 shrink-0 text-[0.85rem] font-medium">
                <input
                  type="checkbox"
                  checked={days[day].enabled}
                  onChange={(e) => setDay(day, { enabled: e.target.checked })}
                />
                {day}
              </label>
              {days[day].enabled ? (
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="time"
                    className="field num max-w-[7rem]"
                    value={days[day].start}
                    onChange={(e) => setDay(day, { start: e.target.value })}
                  />
                  <span className="text-fade text-[0.8rem]">to</span>
                  <input
                    type="time"
                    className="field num max-w-[7rem]"
                    value={days[day].end}
                    onChange={(e) => setDay(day, { end: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    className="field num max-w-[6rem]"
                    value={days[day].break}
                    onChange={(e) => setDay(day, { break: e.target.value })}
                  />
                  <span className="text-fade text-[0.78rem]">min break</span>
                </div>
              ) : (
                <span className="text-fade text-[0.8rem]">Not worked</span>
              )}
            </div>
          ))}
        </div>
        {activeCount === 0 && <p className="text-[0.78rem] text-stamp mt-2">Enable at least one day.</p>}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || activeCount === 0} className="btn-primary">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
