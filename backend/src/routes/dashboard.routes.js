const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validateQuery } = require("../middleware/validate");
const { asyncHandler } = require("../lib/asyncHandler");
const { cached } = require("../lib/dashboardCache");
const { parsePagination, paginatedResponse } = require("../lib/pagination");
const { env } = require("../lib/env");
const dashboard = require("../services/dashboard");

const router = express.Router();

const EMPLOYEE_TYPE_VALUES = ["FULL_TIME", "PART_TIME", "SHIFT"];

function startOfCurrentMonthUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function endOfCurrentMonthUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
}

// Single-tenant system — there's no Company model anywhere in the schema
// (see env.companyName). `company` is accepted so the mockup's filter has
// somewhere real to go: matching the one real company returns real data,
// anything else honestly returns nothing, rather than the filter silently
// doing nothing.
const filterSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  department: z.string().min(1).optional(),
  employeeType: z.enum(EMPLOYEE_TYPE_VALUES).optional(),
  company: z.string().min(1).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

const departmentOverviewQuerySchema = z.object({
  employeeType: z.enum(EMPLOYEE_TYPE_VALUES).optional(),
  company: z.string().min(1).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

const trendQuerySchema = filterSchema.extend({ months: z.string().optional() });

function resolveFilters(query) {
  return {
    periodStart: query.periodStart ?? startOfCurrentMonthUTC(),
    periodEnd: query.periodEnd ?? endOfCurrentMonthUTC(),
    department: query.department,
    employeeType: query.employeeType,
    companyMismatch: !!query.company && query.company.trim().toLowerCase() !== env.companyName.toLowerCase(),
  };
}

function cacheKey(name, filters) {
  const { companyMismatch, ...rest } = filters;
  return `${name}:${JSON.stringify(rest)}`;
}

router.use(requireAuth, requirePermission("dashboard:read"));

router.get(
  "/company",
  asyncHandler(async (req, res) => {
    res.json({ name: env.companyName });
  })
);

router.get(
  "/kpis",
  validateQuery(filterSchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    if (filters.companyMismatch) {
      return res.json({
        totalNetSalaryPaid: 0,
        netSalaryChangePercent: null,
        payslipsGenerated: 0,
        payslipsPaid: 0,
        payslipsPending: 0,
        avgSalaryPerEmployee: 0,
        approvedTimeOffDays: 0,
        attendanceHealthPercent: null,
        attendanceRecordsReviewed: 0,
      });
    }
    const data = await cached(cacheKey("kpis", filters), () => dashboard.getKpis(filters));
    res.json(data);
  })
);

router.get(
  "/salary-cost-by-department",
  validateQuery(filterSchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    if (filters.companyMismatch) return res.json({ data: [] });
    const data = await cached(cacheKey("salary-cost-by-department", filters), () =>
      dashboard.getSalaryCostByDepartment(filters)
    );
    res.json({ data });
  })
);

router.get(
  "/salary-trend",
  validateQuery(trendQuerySchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    if (filters.companyMismatch) return res.json({ data: [] });
    const data = await cached(cacheKey("salary-trend", { ...filters, months }), () =>
      dashboard.getSalaryTrend({ ...filters, months })
    );
    res.json({ data });
  })
);

router.get(
  "/payslip-status",
  validateQuery(filterSchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    if (filters.companyMismatch) {
      return res.json({ statusCounts: { DRAFT: 0, COMPUTED: 0, VALIDATED: 0, PAID: 0, SENT: 0 }, alerts: [] });
    }
    const data = await cached(cacheKey("payslip-status", filters), () => dashboard.getPayslipStatus(filters));
    res.json(data);
  })
);

router.get(
  "/attendance-overview",
  validateQuery(filterSchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    if (filters.companyMismatch) {
      return res.json({
        statusCounts: { PRESENT: 0, LATE: 0, ABSENT: 0, OVERTIME: 0, MISSING_CHECKOUT: 0 },
        manualCorrections: 0,
        missingCheckouts: 0,
        coveragePercent: null,
        totalRecords: 0,
      });
    }
    const data = await cached(cacheKey("attendance-overview", filters), () => dashboard.getAttendanceOverview(filters));
    res.json(data);
  })
);

router.get(
  "/time-off-overview",
  validateQuery(filterSchema),
  asyncHandler(async (req, res) => {
    const filters = resolveFilters(req.query);
    const { page, pageSize, skip, take } = parsePagination(req.query);
    if (filters.companyMismatch) return res.json(paginatedResponse([], 0, page, pageSize));
    const all = await cached(cacheKey("time-off-overview", filters), () => dashboard.getTimeOffOverview(filters));
    res.json(paginatedResponse(all.slice(skip, skip + take), all.length, page, pageSize));
  })
);

router.get(
  "/department-overview",
  validateQuery(departmentOverviewQuerySchema),
  asyncHandler(async (req, res) => {
    const { employeeType, company } = req.query;
    const companyMismatch = !!company && company.trim().toLowerCase() !== env.companyName.toLowerCase();
    const { page, pageSize, skip, take } = parsePagination(req.query);
    if (companyMismatch) return res.json(paginatedResponse([], 0, page, pageSize));
    const all = await cached(cacheKey("department-overview", { employeeType }), () =>
      dashboard.getDepartmentOverview({ employeeType })
    );
    res.json(paginatedResponse(all.slice(skip, skip + take), all.length, page, pageSize));
  })
);

module.exports = router;
