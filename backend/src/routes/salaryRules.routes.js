const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { evaluateFormula } = require("../services/formulaEvaluator");

const router = express.Router({ mergeParams: true });

const RULE_CATEGORIES = ["BASIC", "ALLOWANCE", "GROSS", "DEDUCTION", "NET"];
const COMPUTATION_METHODS = ["FIXED", "PERCENTAGE", "FORMULA"];
const CODE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const createRuleSchema = z.object({
  name: z.string().min(1),
  code: z.string().regex(CODE_RE, "code must be a bare identifier (letters, digits, underscore, not starting with a digit)"),
  category: z.enum(RULE_CATEGORIES),
  sequence: z.coerce.number().int(),
  computationMethod: z.enum(COMPUTATION_METHODS),
  formulaOrValue: z.string().min(1),
});

const updateRuleSchema = createRuleSchema.partial();

// A structure's rules are read/written by whoever manages the structure —
// no separate mount path, this router is mounted at /api/salary-structures/:structureId/rules.
async function loadStructure(req, res) {
  const structure = await prisma.salaryStructure.findUnique({ where: { id: req.params.structureId } });
  if (!structure) {
    res.status(404).json({ error: "Salary structure not found" });
    return null;
  }
  return structure;
}

// Validated against a representative context (every category name plus WAGE,
// all set to 1) so an obviously malformed or self-referencing formula is
// rejected at write time — before it can break a payrun mid-compute. This is
// a syntax/reference sanity check, not a guarantee every possible sequencing
// is valid (a formula can still reference a code that comes later in the
// same structure; that surfaces as a real compute-time error, same as today).
function assertFormulaIsWellFormed(formulaOrValue) {
  const sampleContext = Object.fromEntries([...RULE_CATEGORIES, "WAGE"].map((k) => [k, 1]));
  try {
    evaluateFormula(formulaOrValue, sampleContext);
  } catch (err) {
    // An "unknown value" failure just means the formula references another
    // rule's code, which isn't in this generic sample context — that's a
    // legitimate formula, not a malformed one, so it's not rejected here.
    if (!/unknown value/i.test(err.message)) {
      throw new Error(`Invalid formula "${formulaOrValue}": ${err.message}`);
    }
  }
}

router.get(
  "/",
  requireAuth,
  requirePermission("salaryrule:read"),
  asyncHandler(async (req, res) => {
    const structure = await loadStructure(req, res);
    if (!structure) return;

    const rules = await prisma.salaryRule.findMany({
      where: { salaryStructureId: structure.id },
      orderBy: { sequence: "asc" },
    });
    res.json({ data: rules });
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("salaryrule:write"),
  validateBody(createRuleSchema),
  asyncHandler(async (req, res) => {
    const structure = await loadStructure(req, res);
    if (!structure) return;

    try {
      assertFormulaIsWellFormed(req.body.formulaOrValue);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const existingCode = await prisma.salaryRule.findFirst({
      where: { salaryStructureId: structure.id, code: req.body.code },
    });
    if (existingCode) {
      return res.status(409).json({ error: `A rule with code "${req.body.code}" already exists in this structure` });
    }

    const rule = await prisma.salaryRule.create({
      data: { ...req.body, salaryStructureId: structure.id },
    });
    res.status(201).json(rule);
  })
);

router.patch(
  "/:ruleId",
  requireAuth,
  requirePermission("salaryrule:write"),
  validateBody(updateRuleSchema),
  asyncHandler(async (req, res) => {
    const structure = await loadStructure(req, res);
    if (!structure) return;

    const existing = await prisma.salaryRule.findFirst({
      where: { id: req.params.ruleId, salaryStructureId: structure.id },
    });
    if (!existing) return res.status(404).json({ error: "Salary rule not found in this structure" });

    if (req.body.formulaOrValue) {
      try {
        assertFormulaIsWellFormed(req.body.formulaOrValue);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (req.body.code && req.body.code !== existing.code) {
      const codeTaken = await prisma.salaryRule.findFirst({
        where: { salaryStructureId: structure.id, code: req.body.code, id: { not: existing.id } },
      });
      if (codeTaken) {
        return res.status(409).json({ error: `A rule with code "${req.body.code}" already exists in this structure` });
      }
    }

    const rule = await prisma.salaryRule.update({ where: { id: existing.id }, data: req.body });
    res.json(rule);
  })
);

router.delete(
  "/:ruleId",
  requireAuth,
  requirePermission("salaryrule:write"),
  asyncHandler(async (req, res) => {
    const structure = await loadStructure(req, res);
    if (!structure) return;

    const existing = await prisma.salaryRule.findFirst({
      where: { id: req.params.ruleId, salaryStructureId: structure.id },
    });
    if (!existing) return res.status(404).json({ error: "Salary rule not found in this structure" });

    await prisma.salaryRule.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);

module.exports = router;
