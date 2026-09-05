const { timeToMinutes } = require("./workingSchedule");

const LATE_GRACE_MINUTES = 10;
const OVERTIME_GRACE_MINUTES = 15;

// worked_hours and status are derived, never accepted as direct input (Section 7
// of plan.md) — this is the one place that math/classification happens.
function computeWorkedHours(checkIn, checkOut) {
  if (!checkOut) return null;
  const minutes = (checkOut.getTime() - checkIn.getTime()) / 60000;
  return Math.round((Math.max(minutes, 0) / 60) * 100) / 100;
}

function scheduledStartMinutes(schedule, checkIn) {
  if (!schedule) return null;
  const dayCode = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][checkIn.getDay()];
  const entry = schedule.pattern.find((p) => p.day === dayCode);
  return entry ? timeToMinutes(entry.start) : null;
}

// Scheduled daily minutes derived the same way deriveStatus() derives its
// OVERTIME threshold below — kept as one shared calculation so the numeric
// overtimeHours figure and the OVERTIME status label can never disagree.
function scheduledDailyMinutes(schedule) {
  if (!schedule) return null;
  return (Number(schedule.weeklyHours) / 5) * 60;
}

// Mockup's Attendance form shows Overtime as its own numeric field alongside
// Worked Hours, not just the OVERTIME status label — derived here from worked
// time beyond the schedule's daily allocation (post grace period), never
// accepted as client input. No schedule, or no checkout yet: 0, not a guess.
function computeOvertimeHours(checkIn, checkOut, schedule) {
  if (!checkOut) return 0;
  const dailyMinutes = scheduledDailyMinutes(schedule);
  if (dailyMinutes === null) return 0;

  const workedMinutes = (checkOut.getTime() - checkIn.getTime()) / 60000;
  const overtimeMinutes = workedMinutes - (dailyMinutes + OVERTIME_GRACE_MINUTES);
  if (overtimeMinutes <= 0) return 0;

  return Math.round((overtimeMinutes / 60) * 100) / 100;
}

// Status is compared against the employee's assigned schedule for that weekday,
// not a hardcoded shift — an employee with no matching pattern entry is treated
// as off-schedule (Present/Overtime only, never Late) rather than guessed at.
function deriveStatus({ checkIn, checkOut, schedule }) {
  if (!checkOut) return "MISSING_CHECKOUT";

  const workedMinutes = (checkOut.getTime() - checkIn.getTime()) / 60000;
  const dailyMinutes = scheduledDailyMinutes(schedule);
  const scheduledStart = scheduledStartMinutes(schedule, checkIn);

  if (scheduledStart !== null) {
    const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
    if (checkInMinutes > scheduledStart + LATE_GRACE_MINUTES) {
      return "LATE";
    }
  }

  if (dailyMinutes !== null && workedMinutes > dailyMinutes + OVERTIME_GRACE_MINUTES) {
    return "OVERTIME";
  }

  return "PRESENT";
}

module.exports = { computeWorkedHours, computeOvertimeHours, deriveStatus };
