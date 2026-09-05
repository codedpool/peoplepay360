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

// Status is compared against the employee's assigned schedule for that weekday,
// not a hardcoded shift — an employee with no matching pattern entry is treated
// as off-schedule (Present/Overtime only, never Late) rather than guessed at.
function deriveStatus({ checkIn, checkOut, schedule }) {
  if (!checkOut) return "MISSING_CHECKOUT";

  const workedMinutes = (checkOut.getTime() - checkIn.getTime()) / 60000;
  const scheduledWeeklyHours = schedule ? Number(schedule.weeklyHours) : null;
  const scheduledStart = scheduledStartMinutes(schedule, checkIn);

  if (scheduledStart !== null) {
    const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
    if (checkInMinutes > scheduledStart + LATE_GRACE_MINUTES) {
      return "LATE";
    }
  }

  if (scheduledWeeklyHours !== null) {
    const scheduledDailyMinutes = (scheduledWeeklyHours / 5) * 60;
    if (workedMinutes > scheduledDailyMinutes + OVERTIME_GRACE_MINUTES) {
      return "OVERTIME";
    }
  }

  return "PRESENT";
}

module.exports = { computeWorkedHours, deriveStatus };
