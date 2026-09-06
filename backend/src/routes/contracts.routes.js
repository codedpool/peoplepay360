const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { invalidateDashboardCache } = require("../lib/dashboardCache");
const { isOrderedRange, orderedRangeRefinement } = require("../lib/dateRange");
const { toId, validateIdParam } = require("../lib/ids");

const router = express.Router();

// A non-numeric :id is a resource that cannot exist -> 404, not a 500 out
// of Prisma. See lib/ids.js.
router.param("id", validateIdParam);

const dateSchema = z.coerce.date();
const DATE_ORDER_MESSAGE = "A contract's end date cannot be before its start date";

const contractFields = z.object({
  employeeId: z.coerce.number().int().positive(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  ctc: z.coerce.number().positive(),
  salaryStructureId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
});

const createContractSchema = contractFields.refine(
  ...orderedRangeRefinement("startDate", "endDate", DATE_ORDER_MESSAGE)
);

// .partial() has to be taken off the bare object — a refined schema is a
// ZodEffects wrapper with no .partial(). The PATCH shape can only order the
// dates the request actually carried anyway, so the merged pair is re-checked
// against the stored row in the handler below.
const updateContractSchema = contractFields
  .partial()
  .omit({ employeeId: true })
  .refine(...orderedRangeRefinement("startDate", "endDate", DATE_ORDER_MESSAGE));

// Postgres reports the overlap constraint as a plain exclusion-violation error,
// not one of Prisma's specifically-coded errors — translate it to a clean 409
// instead of letting a raw DB error message reach the client.
function isExclusionViolation(err) {
  return typeof err?.message === "string" && err.message.includes("exclusion constraint");
}

router.get(
  "/",
  requireAuth,
  requirePermission("contract:read"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};
    if (toId(req.query.employeeId)) where.employeeId = toId(req.query.employeeId);
    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.contract.findMany({ where, skip, take, orderBy: { startDate: "desc" } }),
      prisma.contract.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  requirePermission("contract:read"),
  asyncHandler(async (req, res) => {
    const contract = await prisma.contract.findUnique({ where: { id: toId(req.params.id) } });
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    res.json(contract);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("contract:write"),
  validateBody(createContractSchema),
  asyncHandler(async (req, res) => {
    try {
      const contract = await prisma.contract.create({ data: req.body });
      await invalidateDashboardCache();
      res.status(201).json(contract);
    } catch (err) {
      if (isExclusionViolation(err)) {
        return res
          .status(409)
          .json({ error: "This employee already has an active contract covering an overlapping period" });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("contract:write"),
  validateBody(updateContractSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.contract.findUnique({ where: { id: toId(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Contract not found" });

    // Moving only one end of the range still has to leave the range ordered —
    // pushing startDate past a stored endDate is the same bug as sending both
    // out of order, and the schema can't see the stored half.
    const startDate = req.body.startDate ?? existing.startDate;
    const endDate = req.body.endDate !== undefined ? req.body.endDate : existing.endDate;
    if (!isOrderedRange(startDate, endDate)) {
      return res.status(400).json({ error: DATE_ORDER_MESSAGE });
    }

    try {
      const contract = await prisma.contract.update({ where: { id: toId(req.params.id) }, data: req.body });
      await invalidateDashboardCache();
      res.json(contract);
    } catch (err) {
      if (isExclusionViolation(err)) {
        return res
          .status(409)
          .json({ error: "This employee already has an active contract covering an overlapping period" });
      }
      throw err;
    }
  })
);

module.exports = router;
