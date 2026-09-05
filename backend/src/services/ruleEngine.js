const { evaluateFormula } = require("./formulaEvaluator");

// Golden Rule #2: rules execute in `sequence` order and each rule's computed
// amount is written into a running context that later rules read from — Net
// isn't a stored formula, it's whatever the context holds once the ordered
// walk completes. This is a small rule-evaluation pipeline, not a flat sum.
//
// computePayslipLines(employee, contract, structure, period) -> PayslipLine[]
// Pure and stateless: no shared mutable state is read or written outside the
// arguments/return value, so it can run inside a BullMQ worker (Phase 5)
// without any cross-employee interference inside a batch.
function computePayslipLines({ contract, rules }) {
  if (!contract) {
    throw new Error("computePayslipLines requires a resolved contract");
  }

  const orderedRules = [...rules].sort((a, b) => a.sequence - b.sequence);
  const context = { WAGE: Number(contract.wage) };
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

module.exports = { computePayslipLines };
