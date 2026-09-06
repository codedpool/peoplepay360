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

// contract.ctc is annual — these fixtures are 12x the monthly figure the
// assertions below are written against, so WAGE (ctc/12, prorated) comes out
// to exactly the same numbers as when these tests were written directly
// against a monthly wage. The point of these tests is sequencing/proration,
// not the /12 conversion itself — that gets its own dedicated tests below.
function contractWithMonthly(monthly) {
  return { ctc: monthly * 12 };
}

describe("computePayslipLines", () => {
  it("walks rules in sequence, threading each result into the next via the running context", () => {
    const lines = computePayslipLines({ contract: contractWithMonthly(60000), rules: STANDARD_RULES });

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
    const lines = computePayslipLines({ contract: contractWithMonthly(60000), rules: shuffled });
    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));
    expect(byCode.NET).toBe(59400);
  });

  it("is pure: computing twice with different wages never leaks state between calls", () => {
    const first = computePayslipLines({ contract: contractWithMonthly(60000), rules: STANDARD_RULES });
    const second = computePayslipLines({ contract: contractWithMonthly(90000), rules: STANDARD_RULES });

    const firstNet = first.find((l) => l.code === "NET").amount;
    const secondNet = second.find((l) => l.code === "NET").amount;
    expect(firstNet).toBe(59400);
    expect(secondNet).toBe(89100);
  });

  it("throws rather than silently producing NaN when a formula is malformed", () => {
    const broken = [{ id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FORMULA", formulaOrValue: "UNKNOWN" }];
    expect(() => computePayslipLines({ contract: contractWithMonthly(1000), rules: broken })).toThrow(/unknown value/);
  });

  it("throws on a duplicate rule code within the same structure", () => {
    const dup = [
      { id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
      { id: "r2", code: "BASIC", category: "ALLOWANCE", sequence: 2, computationMethod: "FIXED", formulaOrValue: "1" },
    ];
    expect(() => computePayslipLines({ contract: contractWithMonthly(1000), rules: dup })).toThrow(/Duplicate rule code/);
  });

  it("requires a resolved contract", () => {
    expect(() => computePayslipLines({ contract: null, rules: STANDARD_RULES })).toThrow(/resolved contract/);
  });
});

describe("computePayslipLines annual CTC -> monthly WAGE", () => {
  it("divides the annual CTC by 12 to seed WAGE, not the raw contract figure", () => {
    const rules = [{ id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" }];
    const lines = computePayslipLines({ contract: { ctc: 1_200_000 }, rules });
    expect(lines.find((l) => l.code === "BASIC").amount).toBe(100_000);
  });

  it("exposes the raw annual figure as ANNUAL_CTC for a rule that genuinely needs it", () => {
    const rules = [
      { id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
      { id: "r2", code: "GRATUITY_PROVISION", category: "ALLOWANCE", sequence: 2, computationMethod: "FORMULA", formulaOrValue: "0.0481 * ANNUAL_CTC / 12" },
    ];
    const lines = computePayslipLines({ contract: { ctc: 1_200_000 }, rules });
    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));
    expect(byCode.GRATUITY_PROVISION).toBeCloseTo((0.0481 * 1_200_000) / 12, 6);
  });

  it("refuses a rule coded as ANNUAL_CTC, the same as any other reserved name", () => {
    const clashing = [{ id: "r1", code: "ANNUAL_CTC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "1" }];
    expect(() => computePayslipLines({ contract: { ctc: 1000 }, rules: clashing })).toThrow(/reserved/);
  });
});

describe("computePayslipLines attendance proration", () => {
  it("defaults to a full month when no ratio is supplied", () => {
    const lines = computePayslipLines({ contract: contractWithMonthly(60000), rules: STANDARD_RULES });
    expect(lines.find((l) => l.code === "BASIC").amount).toBe(60000);
  });

  // The point of seeding WAGE already-scaled rather than scaling NET at the
  // end: every line is prorated, so the lines still add up to the NET printed
  // on the payslip.
  it("prorates every line, and the lines still reconcile to NET", () => {
    const lines = computePayslipLines({
      contract: contractWithMonthly(60000),
      rules: STANDARD_RULES,
      workedRatio: 0.5,
    });
    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));

    expect(byCode.BASIC).toBe(30000);
    expect(byCode.HRA).toBe(3000);
    expect(byCode.GROSS).toBe(33000);
    expect(byCode.TAX).toBe(3300);
    expect(byCode.NET).toBe(29700);
    expect(byCode.GROSS - byCode.TAX).toBe(byCode.NET);
    expect(byCode.BASIC + byCode.HRA).toBe(byCode.GROSS);
  });

  it("pays two days out of twenty-two as two days, not a whole month", () => {
    const lines = computePayslipLines({
      contract: contractWithMonthly(44000),
      rules: STANDARD_RULES,
      workedRatio: 2 / 22,
      workedDays: 2,
      periodDays: 22,
    });
    expect(lines.find((l) => l.code === "BASIC").amount).toBeCloseTo(4000, 6);
  });

  it("pays nothing for a month with no attendance", () => {
    const lines = computePayslipLines({
      contract: contractWithMonthly(60000),
      rules: STANDARD_RULES,
      workedRatio: 0,
    });
    expect(lines.every((l) => l.amount === 0)).toBe(true);
  });

  it("exposes the proration inputs as formula variables a rule can read", () => {
    const rules = [
      { id: "r1", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
      // A fixed monthly premium that shouldn't shrink with attendance.
      { id: "r2", code: "INSURANCE", category: "DEDUCTION", sequence: 2, computationMethod: "FORMULA", formulaOrValue: "0.01 * FULL_WAGE" },
      { id: "r3", code: "DAYS", category: "ALLOWANCE", sequence: 3, computationMethod: "FORMULA", formulaOrValue: "WORKED_DAYS * 100" },
    ];
    const lines = computePayslipLines({
      contract: contractWithMonthly(60000),
      rules,
      workedRatio: 0.5,
      workedDays: 11,
      periodDays: 22,
    });
    const byCode = Object.fromEntries(lines.map((l) => [l.code, l.amount]));

    expect(byCode.BASIC).toBe(30000); // prorated
    expect(byCode.INSURANCE).toBe(600); // 1% of the *unprorated monthly* wage
    expect(byCode.DAYS).toBe(1100);
  });

  it("rejects a ratio outside 0..1 instead of paying more than a full month", () => {
    expect(() =>
      computePayslipLines({ contract: contractWithMonthly(60000), rules: STANDARD_RULES, workedRatio: 1.5 })
    ).toThrow(/between 0 and 1/);
    expect(() =>
      computePayslipLines({ contract: contractWithMonthly(60000), rules: STANDARD_RULES, workedRatio: -0.2 })
    ).toThrow(/between 0 and 1/);
  });

  it("refuses a rule coded as one of the reserved context variables", () => {
    const clashing = [
      { id: "r1", code: "WORKED_RATIO", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "1" },
    ];
    expect(() => computePayslipLines({ contract: contractWithMonthly(1000), rules: clashing })).toThrow(
      /reserved/
    );
  });
});
