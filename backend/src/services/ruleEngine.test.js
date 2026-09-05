import { describe, it, expect } from "vitest";
import { computePayslipLines } from "./ruleEngine.js";

// Mirrors the seed's "Standard Structure": BASIC -> HRA (10% of BASIC) ->
// GROSS (BASIC + HRA) -> TAX (10% of GROSS) -> NET (GROSS - TAX). NET and
// TAX both depend on values computed earlier in the same walk, so this only
// passes if sequencing/context propagation actually works, not a flat sum.
const STANDARD_RULES = [
  { id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
  { id: "r2", code: "HRA", category: "ALLOWANCE", sequence: 2, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * BASIC" },
  { id: "r3", code: "GROSS", category: "GROSS", sequence: 3, computationMethod: "FORMULA", formulaOrValue: "BASIC + HRA" },
  { id: "r4", code: "TAX", category: "DEDUCTION", sequence: 4, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * GROSS" },
  { id: "r5", code: "NET", category: "NET", sequence: 5, computationMethod: "FORMULA", formulaOrValue: "GROSS - TAX" },
];

describe("computePayslipLines", () => {
  it("walks rules in sequence, threading each result into the next via the running context", () => {
    const lines = computePayslipLines({ contract: { wage: 60000 }, rules: STANDARD_RULES });

    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));
    expect(byCode.BASIC).toBe(60000);
    expect(byCode.HRA).toBe(6000); // 10% of BASIC
    expect(byCode.GROSS).toBe(66000); // BASIC + HRA
    expect(byCode.TAX).toBe(6600); // 10% of GROSS — depends on GROSS, not WAGE
    expect(byCode.NET).toBe(59400); // GROSS - TAX

    expect(lines.map((l) => l.code)).toEqual(["BASIC", "HRA", "GROSS", "TAX", "NET"]);
  });

  it("computes correctly even if rules are supplied out of sequence order", () => {
    const shuffled = [...STANDARD_RULES].reverse();
    const lines = computePayslipLines({ contract: { wage: 60000 }, rules: shuffled });
    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));
    expect(byCode.NET).toBe(59400);
  });

  it("is pure: computing twice with different wages never leaks state between calls", () => {
    const first = computePayslipLines({ contract: { wage: 60000 }, rules: STANDARD_RULES });
    const second = computePayslipLines({ contract: { wage: 90000 }, rules: STANDARD_RULES });

    const firstNet = first.find((l) => l.code === "NET").amount;
    const secondNet = second.find((l) => l.code === "NET").amount;
    expect(firstNet).toBe(59400);
    expect(secondNet).toBe(89100);
  });

  it("throws rather than silently producing NaN when a formula is malformed", () => {
    const broken = [{ id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FORMULA", formulaOrValue: "UNKNOWN" }];
    expect(() => computePayslipLines({ contract: { wage: 1000 }, rules: broken })).toThrow(/unknown value/);
  });

  it("throws on a duplicate rule code within the same structure", () => {
    const dup = [
      { id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
      { id: "r2", code: "BASIC", category: "ALLOWANCE", sequence: 2, computationMethod: "FIXED", formulaOrValue: "1" },
    ];
    expect(() => computePayslipLines({ contract: { wage: 1000 }, rules: dup })).toThrow(/Duplicate rule code/);
  });

  it("requires a resolved contract", () => {
    expect(() => computePayslipLines({ contract: null, rules: STANDARD_RULES })).toThrow(/resolved contract/);
  });
});
