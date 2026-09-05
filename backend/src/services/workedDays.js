const { prisma } = require("../lib/prisma");

// Payslip.workedDays has no other source in the schema (no timesheet/approved-
// days model) — defined here as the count of distinct calendar days within
// the period on which the employee has a completed attendance record (a
// check-in AND a check-out). A day with only a check-in (MISSING_CHECKOUT)
// doesn't count as worked; it's an open exception, not confirmed attendance.
async function computeWorkedDays(employeeId, periodStart, periodEnd) {
  const records = await prisma.attendance.findMany({
    where: {
      employeeId,
      checkIn: { gte: periodStart, lte: periodEnd },
      checkOut: { not: null },
    },
    select: { checkIn: true },
  });

  const distinctDays = new Set(
    records.map((r) => r.checkIn.toISOString().slice(0, 10)) // YYYY-MM-DD
  );

  return distinctDays.size;
}

module.exports = { computeWorkedDays };
