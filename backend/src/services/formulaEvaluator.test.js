import { describe, it, expect } from "vitest";
import { evaluateFormula } from "./formulaEvaluator.js";

describe("evaluateFormula", () => {
  it("evaluates arithmetic with correct precedence and parentheses", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateFormula("10 / 2 - 3", {})).toBe(2);
  });

  it("resolves identifiers against the supplied context", () => {
    expect(evaluateFormula("BASIC + HRA", { BASIC: 50000, HRA: 5000 })).toBe(55000);
    expect(evaluateFormula("0.10 * GROSS", { GROSS: 60000 })).toBe(6000);
    expect(evaluateFormula("GROSS - TAX", { GROSS: 60000, TAX: 6000 })).toBe(54000);
  });

  it("supports unary minus", () => {
    expect(evaluateFormula("-BASIC + GROSS", { BASIC: 10, GROSS: 30 })).toBe(20);
  });

  it("rejects a formula referencing an identifier not in context", () => {
    expect(() => evaluateFormula("UNKNOWN_CODE", { BASIC: 1 })).toThrow(/unknown value/);
  });

  it("rejects division by zero rather than returning Infinity/NaN", () => {
    expect(() => evaluateFormula("BASIC / 0", { BASIC: 100 })).toThrow(/divides by zero/);
  });

  it("rejects malformed input instead of silently coercing it", () => {
    expect(() => evaluateFormula("BASIC +", { BASIC: 1 })).toThrow();
    expect(() => evaluateFormula("(BASIC", { BASIC: 1 })).toThrow();
    expect(() => evaluateFormula("", {})).toThrow();
  });

  it("has no function-call or property-access syntax to exploit", () => {
    // Anything resembling a call or member access is either a parse error
    // (extra tokens after a valid prefix) or an "unknown value" lookup —
    // there is no code path that reaches JS's own eval, Function, or object
    // property resolution machinery.
    expect(() => evaluateFormula("constructor.constructor('return 1')()", {})).toThrow();
    expect(() => evaluateFormula("__proto__", {})).toThrow(/unknown value/);
  });
});
