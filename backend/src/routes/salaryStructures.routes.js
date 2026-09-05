const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");

const router = express.Router();

const createStructureSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
});

const updateStructureSchema = createStructureSchema.partial();

// List view needs rule count, active status, and a live count of employees
// currently assigned via their active contract — counted here rather than
// stored, since it must always reflect current contract assignments.
router.get(
  "/",
  requireAuth,
  requirePermission("salarystructure:read"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.active !== undefined) where.active = req.query.active === "true";

    const [structures, total] = await Promise.all([
      prisma.salaryStructure.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { rules: true } },
        },
      }),
      prisma.salaryStructure.count({ where }),
    ]);

    const structureIds = structures.map((s) => s.id);
    const employeeCounts = await prisma.contract.groupBy({
      by: ["salaryStructureId"],
      where: { salaryStructureId: { in: structureIds }, status: "ACTIVE" },
      _count: { _all: true },
    });
    const employeeCountByStructure = Object.fromEntries(
      employeeCounts.map((row) => [row.salaryStructureId, row._count._all])
    );

    const data = structures.map(({ _count, ...s }) => ({
      ...s,
      ruleCount: _count.rules,
      activeEmployeeCount: employeeCountByStructure[s.id] ?? 0,
    }));

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  requirePermission("salarystructure:read"),
  asyncHandler(async (req, res) => {
    const structure = await prisma.salaryStructure.findUnique({
      where: { id: req.params.id },
      include: { rules: { orderBy: { sequence: "asc" } } },
    });
    if (!structure) return res.status(404).json({ error: "Salary structure not found" });
    res.json(structure);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("salarystructure:write"),
  validateBody(createStructureSchema),
  asyncHandler(async (req, res) => {
    const structure = await prisma.salaryStructure.create({ data: req.body });
    res.status(201).json(structure);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("salarystructure:write"),
  validateBody(updateStructureSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.salaryStructure.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Salary structure not found" });

    const structure = await prisma.salaryStructure.update({ where: { id: req.params.id }, data: req.body });
    res.json(structure);
  })
);

module.exports = router;
