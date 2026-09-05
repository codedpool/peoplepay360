const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission, isElevated } = require("../middleware/rbac");
const { assertOwnsOrElevated } = require("../middleware/ownership");
const { validateBody } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { invalidateDashboardCache } = require("../lib/dashboardCache");
const { toId, validateIdParam } = require("../lib/ids");

const router = express.Router();

// A non-numeric :id is a resource that cannot exist -> 404, not a 500 out
// of Prisma. See lib/ids.js.
router.param("id", validateIdParam);

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  department: z.string().min(1),
  jobPosition: z.string().min(1),
  managerId: z.coerce.number().int().positive().nullable().optional(),
  scheduleId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // No actual bank details are stored anywhere (out of scope) — this is only
  // the signal the Payroll Dashboard's "missing bank account" alert reads.
  bankAccountOnFile: z.boolean().optional(),
});

const updateEmployeeSchema = createEmployeeSchema.partial();

// Only HR-tier roles may list all employees — "Employee" only ever sees their own record.
router.get(
  "/",
  requireAuth,
  requirePermission("employee:read"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.department) where.department = req.query.department;
    if (req.query.status) where.status = req.query.status;

    const [data, total] = await Promise.all([
      prisma.employee.findMany({ where, skip, take, orderBy: { name: "asc" } }),
      prisma.employee.count({ where }),
    ]);

    res.json(paginatedResponse(data, total, page, pageSize));
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);

    if (!isElevated(req.user.roles)) {
      if (!assertOwnsOrElevated(req, res, id)) return;
    } else if (!hasPermission(req.user.roles, "employee:read")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    res.json(employee);
  })
);

router.post(
  "/",
  requireAuth,
  requirePermission("employee:write"),
  validateBody(createEmployeeSchema),
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.create({ data: req.body });
    await invalidateDashboardCache();
    res.status(201).json(employee);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("employee:write"),
  validateBody(updateEmployeeSchema),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Employee not found" });

    const employee = await prisma.employee.update({ where: { id }, data: req.body });
    await invalidateDashboardCache();
    res.json(employee);
  })
);

module.exports = router;
