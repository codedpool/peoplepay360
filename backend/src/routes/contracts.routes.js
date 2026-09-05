const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { invalidateDashboardCache } = require("../lib/dashboardCache");

const router = express.Router();

const dateSchema = z.coerce.date();

const createContractSchema = z.object({
  employeeId: z.string().uuid(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  wage: z.coerce.number().positive(),
  salaryStructureId: z.string().uuid().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
});

const updateContractSchema = createContractSchema.partial().omit({ employeeId: true });

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
    if (req.query.employeeId) where.employeeId = req.query.employeeId;
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
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
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
    const existing = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Contract not found" });

    try {
      const contract = await prisma.contract.update({ where: { id: req.params.id }, data: req.body });
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
