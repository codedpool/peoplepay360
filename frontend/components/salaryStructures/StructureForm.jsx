"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

export default function StructureForm({ initial, submitLabel = "Save", submitting = false, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name, active });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="field-group">
        <label className="field-label">Structure name</label>
        <input required className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-[0.85rem]">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
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
