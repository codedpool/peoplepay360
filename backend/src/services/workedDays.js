const { prisma } = require("../lib/prisma");

// Which weekdays count as working days when an employee has no WorkingSchedule
// assigned. Matches the DEFAULT_FULL_DAY_HOURS fallback in attendance.js —
// a standard Mon–Fri week.
const DEFAULT_WORKING_DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// periodEnd is a @db.Date value — midnight at the *start* of the last calendar
// day. checkIn is a full timestamp, so comparing it against that midnight
// instant with `lte` would exclude every attendance record on the period's last
// day except one checked in before 00:00. Push the boundary to the end of that
// day so the whole last day is actually included.
function inclusiveEndOf(periodEnd) {
  const end = new Date(periodEnd);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

// Day-equivalents actually earned in the period, not a count of rows. Each
// attendance record carries the day_fraction derived at write time (1 full,
// 0.5 half, 0 for a short day or an unclosed session); those are summed per
// calendar day and each day is capped at 1, so an employee who checks in and
// out twice across one day earns that day once rather than twice.
//
// This replaces the old "count distinct days with a completed record", which
// paid a full day for a one-minute appearance.
async function computeWorkedDays(employeeId, periodStart, periodEnd) {
  const records = await prisma.attendance.findMany({
    where: {
      employeeId,
      checkIn: { gte: periodStart, lte: inclusiveEndOf(periodEnd) },
      checkOut: { not: null },
    },
    select: { checkIn: true, dayFraction: true },
  });

  const perDay = new Map();
  for (const record of records) {
    const day = record.checkIn.toISOString().slice(0, 10); // YYYY-MM-DD
    perDay.set(day, (perDay.get(day) ?? 0) + Number(record.dayFraction));
  }

  let total = 0;
  for (const fraction of perDay.values()) {
    total += Math.min(fraction, 1);
  }

  // Decimal(5,2) on Payslip.workedDays — half-days mean this is no longer an
  // integer, so round to the same 2dp the column stores rather than letting
  // float drift decide.
  return Math.round(total * 100) / 100;
}

// How many working days the period was *supposed* to contain, which is the
// denominator payroll prorates against. Read from the employee's schedule
// pattern where they have one (so a 3-day-a-week contractor isn't measured
// against a 5-day month), Mon–Fri otherwise.
function countScheduledWorkingDays(schedule, periodStart, periodEnd) {
  const workingCodes = new Set(
    schedule?.pattern?.length
      ? schedule.pattern.map((entry) => entry.day)
      : DEFAULT_WORKING_DAY_CODES
  );

  // Both period bounds are @db.Date (UTC midnight), so the whole walk stays in
  // UTC — using local getDay() here would shift the weekday for anyone east or
  // west of UTC and silently miscount the month.
  const cursor = new Date(Date.UTC(
    periodStart.getUTCFullYear(),
    periodStart.getUTCMonth(),
    periodStart.getUTCDate()
  ));
  const last = Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate());

  let count = 0;
  while (cursor.getTime() <= last) {
    if (workingCodes.has(DAY_CODES[cursor.getUTCDay()])) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

// The proration factor a payslip is computed at: day-equivalents worked over
// working days scheduled. Capped at 1 — extra days beyond the scheduled month
// are overtime, which the rule structure prices separately, and must never
// inflate the base wage past 100%. A period with no scheduled working days at
// all (a bad period, or a schedule with an empty pattern) yields 0 rather than
// dividing by zero.
function computeWorkedRatio(workedDays, scheduledDays) {
  if (!scheduledDays || scheduledDays <= 0) return 0;
  return Math.min(workedDays / scheduledDays, 1);
}

module.exports = {
  computeWorkedDays,
  countScheduledWorkingDays,
  computeWorkedRatio,
  DEFAULT_WORKING_DAY_CODES,
};
