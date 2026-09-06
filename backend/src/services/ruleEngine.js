const { evaluateFormula } = require("./formulaEvaluator");

// Variable names the payroll context seeds before any rule runs. A salary rule
// may *read* these but must not be coded as one, or it would overwrite the
// input its own siblings are reading from mid-walk.
const RESERVED_CODES = new Set(["WAGE", "FULL_WAGE", "ANNUAL_CTC", "WORKED_RATIO", "WORKED_DAYS", "PERIOD_DAYS"]);

// Golden Rule #2: rules execute in `sequence` order and each rule's computed
// amount is written into a running context that later rules read from — Net
// isn't a stored formula, it's whatever the context holds once the ordered
// walk completes. This is a small rule-evaluation pipeline, not a flat sum.
//
// computePayslipLines(employee, contract, structure, period) -> PayslipLine[]
// Pure and stateless: no shared mutable state is read or written outside the
// arguments/return value, so it can run inside a BullMQ worker (Phase 5)
// without any cross-employee interference inside a batch.
//
// Contract.ctc is an ANNUAL Cost to Company figure — what HR actually
// negotiates, not a monthly take-home someone has to pre-derive by hand
// before it can go in the system. WAGE is that annual figure divided into a
// monthly one and *already scaled* by the period's worked ratio, so an
// employee present two days out of twenty-two is paid two days' worth of a
// twelfth of their CTC. Every rule in the structure derives from WAGE (BASIC
// is a share of it, allowances a share of BASIC, a balancing allowance makes
// up the rest, deductions a share of GROSS, NET the running result), so a
// single scaled seed prorates the entire payslip and every line still sums
// to the NET printed on it — no rule has to know proration exists, and none
// of them touch CTC directly.
//
// workedRatio defaults to 1 so a caller that hasn't measured attendance gets
// the old full-month behaviour rather than a silently zeroed payslip.
function computePayslipLines({ contract, rules, workedRatio = 1, workedDays = null, periodDays = null }) {
  if (!contract) {
    throw new Error("computePayslipLines requires a resolved contract");
  }
  if (!Number.isFinite(workedRatio) || workedRatio < 0 || workedRatio > 1) {
    throw new Error(`workedRatio must be a number between 0 and 1, got ${workedRatio}`);
  }

  const orderedRules = [...rules].sort((a, b) => a.sequence - b.sequence);
  const monthlyCtc = Number(contract.ctc) / 12;
  const context = {
    WAGE: monthlyCtc * workedRatio,
    // The unprorated monthly figure, for a structure that needs the full
    // month's derived pay regardless of attendance (a fixed stipend, a
    // per-month insurance premium). Rules opt into it explicitly; WAGE stays
    // the prorated default.
    FULL_WAGE: monthlyCtc,
    // The raw annual figure, for the rare rule that genuinely needs it (an
    // annual bonus provision, a gratuity accrual) rather than a monthly share.
    ANNUAL_CTC: Number(contract.ctc),
    WORKED_RATIO: workedRatio,
    WORKED_DAYS: workedDays ?? 0,
    PERIOD_DAYS: periodDays ?? 0,
  };
  const lines = [];

  for (const rule of orderedRules) {
    const amount = computeRuleAmount(rule, context);

    if (!Number.isFinite(amount)) {
      throw new Error(`Rule "${rule.code}" (sequence ${rule.sequence}) did not produce a finite amount`);
    }

    // A rule's own code becomes the variable name later rules in the same
    // structure can reference — this is what makes NET = GROSS - TAX work as
    // a formula rather than a hardcoded calculation.
    if (Object.prototype.hasOwnProperty.call(context, rule.code)) {
      // Same collision check either way, but the two causes need different
      // fixes: rename your duplicate, versus rename off a reserved name.
      if (RESERVED_CODES.has(rule.code)) {
        throw new Error(
          `Rule code "${rule.code}" is reserved by the payroll context — pick a different code`
        );
      }
      throw new Error(`Duplicate rule code "${rule.code}" in structure — codes must be unique per structure`);
    }
    context[rule.code] = amount;

    lines.push({ salaryRuleId: rule.id, code: rule.code, category: rule.category, amount });
  }

  return lines;
}

function computeRuleAmount(rule, context) {
  switch (rule.computationMethod) {
    case "FIXED":
      return evaluateFormula(rule.formulaOrValue, context);
    case "PERCENTAGE": {
      // formulaOrValue for PERCENTAGE is "<rate> * <CODE>" (e.g. "0.10 * BASIC"),
      // evaluated through the same restricted grammar as FORMULA — percentage
      // isn't a separate code path, just a documented convention for the string.
      return evaluateFormula(rule.formulaOrValue, context);
    }
    case "FORMULA":
      return evaluateFormula(rule.formulaOrValue, context);
    default:
      throw new Error(`Unknown computation method "${rule.computationMethod}" on rule "${rule.code}"`);
  }
}

module.exports = { computePayslipLines, RESERVED_CODES };
