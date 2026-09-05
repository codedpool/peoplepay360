const { prisma } = require("../lib/prisma");
const { validatePayrun } = require("./payrunValidation");

// Every aggregate here reads real rows — same discipline as payrunValidation:
// no static/placeholder numbers, ever (Section 7 of plan.md).

function buildEmployeeWhere({ department, employeeType } = {}) {
  return {
    ...(department ? { department } : {}),
    ...(employeeType ? { schedule: { type: employeeType } } : {}),
  };
}

// periodEnd is a @db.Date value — midnight at the *start* of the last day.
// Timestamp fields (Attendance.checkIn) need the boundary pushed to the end
// of that day, or the whole last day silently drops out (same class of bug
// fixed in workedDays.js).
function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function previousPeriod(periodStart, periodEnd) {
  const spanDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(periodStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - spanDays + 1);
  return { periodStart: prevStart, periodEnd: prevEnd };
}

function netAmount(payslip) {
  const line = payslip.lines.find((l) => l.salaryRule.category === "NET");
  return line ? Number(line.amount) : 0;
}

async function sumNetForPeriod({ periodStart, periodEnd, department, employeeType, statuses }) {
  const payslips = await prisma.payslip.findMany({
    where: {
      employee: buildEmployeeWhere({ department, employeeType }),
      payrun: { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: { lines: { include: { salaryRule: true } } },
  });
  return payslips.reduce((sum, p) => sum + netAmount(p), 0);
}

// --- KPI row ---------------------------------------------------------------

async function getKpis({ periodStart, periodEnd, department, employeeType }) {
  const employeeWhere = buildEmployeeWhere({ department, employeeType });
  const overlapsPeriod = { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } };

  const payslips = await prisma.payslip.findMany({
    where: { employee: employeeWhere, payrun: overlapsPeriod },
    include: { lines: { include: { salaryRule: true } } },
  });

  const paidStatuses = new Set(["PAID", "SENT"]);
  const paidPayslips = payslips.filter((p) => paidStatuses.has(p.status));
  const totalNetSalaryPaid = paidPayslips.reduce((sum, p) => sum + netAmount(p), 0);
  const avgSalaryPerEmployee = paidPayslips.length > 0 ? totalNetSalaryPaid / paidPayslips.length : 0;

  const prev = previousPeriod(periodStart, periodEnd);
  const prevTotalNetSalaryPaid = await sumNetForPeriod({
    periodStart: prev.periodStart,
    periodEnd: prev.periodEnd,
    department,
    employeeType,
    statuses: ["PAID", "SENT"],
  });
  const netSalaryChangePercent =
    prevTotalNetSalaryPaid > 0
      ? Math.round(((totalNetSalaryPaid - prevTotalNetSalaryPaid) / prevTotalNetSalaryPaid) * 1000) / 10
      : null;

  const approvedTimeOff = await prisma.timeOffRequest.aggregate({
    where: {
      employee: employeeWhere,
      status: "APPROVED",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    _sum: { duration: true },
  });

  const attendanceRecords = await prisma.attendance.findMany({
    where: { employee: employeeWhere, checkIn: { gte: periodStart, lte: endOfDay(periodEnd) } },
    select: { status: true },
  });
  const presentLike = attendanceRecords.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length;
  const attendanceHealthPercent =
    attendanceRecords.length > 0 ? Math.round((presentLike / attendanceRecords.length) * 100) : null;

  return {
    totalNetSalaryPaid,
    netSalaryChangePercent,
    payslipsGenerated: payslips.length,
    payslipsPaid: paidPayslips.length,
    payslipsPending: payslips.length - paidPayslips.length,
    avgSalaryPerEmployee,
    approvedTimeOffDays: Number(approvedTimeOff._sum.duration ?? 0),
    attendanceHealthPercent,
    attendanceRecordsReviewed: attendanceRecords.length,
  };
}

// --- Salary Cost by Department ---------------------------------------------

async function getSalaryCostByDepartment({ periodStart, periodEnd, employeeType }) {
  const payslips = await prisma.payslip.findMany({
    where: {
      employee: buildEmployeeWhere({ employeeType }),
      payrun: { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
      status: { in: ["PAID", "SENT"] },
    },
    include: { employee: true, lines: { include: { salaryRule: true } } },
  });

  const byDepartment = {};
  for (const p of payslips) {
    byDepartment[p.employee.department] = (byDepartment[p.employee.department] ?? 0) + netAmount(p);
  }
  return Object.entries(byDepartment)
    .map(([department, totalNet]) => ({ department, totalNet }))
    .sort((a, b) => b.totalNet - a.totalNet);
}

// --- Monthly Net Salary Trend ------------------------------------------------

function startOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

async function getSalaryTrend({ months = 6, department, employeeType, anchor = new Date() }) {
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthAnchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    const monthStart = startOfMonthUTC(monthAnchor);
    const monthEnd = endOfMonthUTC(monthAnchor);
    const totalNet = await sumNetForPeriod({
      periodStart: monthStart,
      periodEnd: monthEnd,
      department,
      employeeType,
      statuses: ["PAID", "SENT"],
    });
    results.push({ month: monthStart.toISOString().slice(0, 7), totalNet });
  }
  return results;
}

// --- Payslip Status & Payroll Alerts ----------------------------------------

async function getPayslipStatus({ periodStart, periodEnd, department, employeeType }) {
  const employeeWhere = buildEmployeeWhere({ department, employeeType });
  const overlapsPeriod = { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } };

  const payslips = await prisma.payslip.findMany({
    where: { employee: employeeWhere, payrun: overlapsPeriod },
    select: { status: true },
  });
  const statusCounts = { DRAFT: 0, COMPUTED: 0, VALIDATED: 0, PAID: 0, SENT: 0 };
  for (const p of payslips) statusCounts[p.status] += 1;

  const missingBankAccount = await prisma.employee.count({
    where: { ...employeeWhere, status: "ACTIVE", bankAccountOnFile: false },
  });

  const payrunsInPeriod = await prisma.payrun.findMany({ where: overlapsPeriod, select: { id: true, status: true } });
  let duplicatePayslipCount = 0;
  for (const payrun of payrunsInPeriod) {
    const findings = await validatePayrun(payrun.id);
    duplicatePayslipCount += findings.filter((f) => f.code === "duplicate_payslip").length;
  }
  const draftsNotValidated = payrunsInPeriod.filter((p) => p.status === "DRAFT" || p.status === "COMPUTED").length;

  const contractsExpiring = await prisma.contract.count({
    where: { status: "ACTIVE", endDate: { gte: periodStart, lte: periodEnd } },
  });

  const alerts = [
    missingBankAccount > 0 && {
      code: "missing_bank_account",
      count: missingBankAccount,
      message: `${missingBankAccount} employee${missingBankAccount === 1 ? "" : "s"} missing bank account`,
    },
    duplicatePayslipCount > 0 && {
      code: "duplicate_payslip",
      count: duplicatePayslipCount,
      message: `${duplicatePayslipCount} duplicate payslip warning${duplicatePayslipCount === 1 ? "" : "s"}`,
    },
    draftsNotValidated > 0 && {
      code: "drafts_not_validated",
      count: draftsNotValidated,
      message: `${draftsNotValidated} draft payrun${draftsNotValidated === 1 ? "" : "s"} still not validated`,
    },
    contractsExpiring > 0 && {
      code: "contracts_expiring",
      count: contractsExpiring,
      message: `${contractsExpiring} contract${contractsExpiring === 1 ? "" : "s"} expiring this period`,
    },
  ].filter(Boolean);

  return { statusCounts, alerts };
}

// --- Attendance Overview -----------------------------------------------------

async function getAttendanceOverview({ periodStart, periodEnd, department, employeeType }) {
  const records = await prisma.attendance.findMany({
    where: {
      employee: buildEmployeeWhere({ department, employeeType }),
      checkIn: { gte: periodStart, lte: endOfDay(periodEnd) },
    },
    select: { status: true, isManualCorrection: true },
  });

  const statusCounts = { PRESENT: 0, LATE: 0, ABSENT: 0, OVERTIME: 0, MISSING_CHECKOUT: 0 };
  let manualCorrections = 0;
  for (const r of records) {
    statusCounts[r.status] += 1;
    if (r.isManualCorrection) manualCorrections += 1;
  }
  const presentLike = statusCounts.PRESENT + statusCounts.OVERTIME;
  const coveragePercent = records.length > 0 ? Math.round((presentLike / records.length) * 100) : null;

  return {
    statusCounts,
    manualCorrections,
    missingCheckouts: statusCounts.MISSING_CHECKOUT,
    coveragePercent,
    totalRecords: records.length,
  };
}

// --- Time Off Overview --------------------------------------------------------

async function getTimeOffOverview({ periodStart, periodEnd, department, employeeType }) {
  const employeeWhere = buildEmployeeWhere({ department, employeeType });
  const types = await prisma.timeOffType.findMany({ orderBy: { name: "asc" } });

  const results = [];
  for (const type of types) {
    const [approved, pending, remaining] = await Promise.all([
      prisma.timeOffRequest.aggregate({
        where: {
          employee: employeeWhere,
          timeOffTypeId: type.id,
          status: "APPROVED",
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        _sum: { duration: true },
      }),
      prisma.timeOffRequest.aggregate({
        where: {
          employee: employeeWhere,
          timeOffTypeId: type.id,
          status: "PENDING",
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        _sum: { duration: true },
      }),
      type.requiresAllocation
        ? prisma.timeOffAllocation.aggregate({
            where: { employee: employeeWhere, timeOffTypeId: type.id, status: "ACTIVE" },
            _sum: { remaining: true },
          })
        : Promise.resolve(null),
    ]);

    results.push({
      typeId: type.id,
      name: type.name,
      unit: type.unit,
      approvedDays: Number(approved._sum.duration ?? 0),
      pendingDays: Number(pending._sum.duration ?? 0),
      remainingBalance: type.requiresAllocation ? Number(remaining._sum.remaining ?? 0) : null,
    });
  }
  return results;
}

// --- Department Overview -------------------------------------------------------

async function getDepartmentOverview({ employeeType }) {
  const employeeWhere = { status: "ACTIVE", ...(employeeType ? { schedule: { type: employeeType } } : {}) };

  const employees = await prisma.employee.findMany({ where: employeeWhere, select: { department: true } });
  const headcountByDepartment = {};
  for (const e of employees) headcountByDepartment[e.department] = (headcountByDepartment[e.department] ?? 0) + 1;

  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE", employee: employeeWhere },
    include: { employee: { select: { department: true } } },
  });
  const salaryByDepartment = {};
  for (const c of contracts) {
    salaryByDepartment[c.employee.department] = (salaryByDepartment[c.employee.department] ?? 0) + Number(c.wage);
  }

  const departments = new Set([...Object.keys(headcountByDepartment), ...Object.keys(salaryByDepartment)]);
  return [...departments]
    .map((department) => ({
      department,
      headcount: headcountByDepartment[department] ?? 0,
      monthlySalary: salaryByDepartment[department] ?? 0,
    }))
    .sort((a, b) => b.monthlySalary - a.monthlySalary);
}

module.exports = {
  getKpis,
  getSalaryCostByDepartment,
  getSalaryTrend,
  getPayslipStatus,
  getAttendanceOverview,
  getTimeOffOverview,
  getDepartmentOverview,
};
