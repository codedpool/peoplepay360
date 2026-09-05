"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

const CATEGORIES = ["BASIC", "ALLOWANCE", "GROSS", "DEDUCTION", "NET"];
const METHODS = ["FIXED", "PERCENTAGE", "FORMULA"];

const METHOD_HINT = {
  FIXED: "The exact amount entered, e.g. 2000",
  PERCENTAGE: "A percentage of a base, e.g. 20 for 20% of BASIC",
  FORMULA: "An expression over other rule codes, e.g. BASIC + HRA - 100",
};

export default function RuleForm({ initial, nextSequence, submitLabel = "Save", submitting = false, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [category, setCategory] = useState(initial?.category ?? "ALLOWANCE");
  const [sequence, setSequence] = useState(initial?.sequence ?? nextSequence ?? 1);
  const [computationMethod, setComputationMethod] = useState(initial?.computationMethod ?? "FIXED");
  const [formulaOrValue, setFormulaOrValue] = useState(initial?.formulaOrValue ?? "");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name, code, category, sequence: Number(sequence), computationMethod, formulaOrValue });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="field-group">
          <label className="field-label">Rule name</label>
          <input required className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Code</label>
          <input
            required
            className="field num"
            placeholder="BASIC_SALARY"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Category</label>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Sequence</label>
          <input
            type="number"
            required
            className="field num"
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          />
        </div>
        <div className="field-group col-span-2">
          <label className="field-label">Computation method</label>
          <select className="field" value={computationMethod} onChange={(e) => setComputationMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group col-span-2">
          <label className="field-label">
            {computationMethod === "FIXED" ? "Amount" : computationMethod === "PERCENTAGE" ? "Percentage" : "Formula"}
          </label>
          <input
            required
            className="field num"
            value={formulaOrValue}
            onChange={(e) => setFormulaOrValue(e.target.value)}
          />
          <p className="text-[0.75rem] text-fade mt-1">{METHOD_HINT[computationMethod]}</p>
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
