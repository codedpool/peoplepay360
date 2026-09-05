const OVERTIME_GRACE_MINUTES = 15;

// Fallback used when an employee has no WorkingSchedule assigned. Every
// classification below is expressed against the *scheduled* day rather than a
// hardcoded 8h so a 20h/week part-timer finishing their 4h day is a full day,
// not half of someone else's — this constant only fills the gap when there's
// no schedule to ask.
const DEFAULT_FULL_DAY_HOURS = 8;

// worked_hours, day_fraction and status are derived, never accepted as direct
// input (Section 7 of plan.md) — this is the one place that math/classification
// happens.
function computeWorkedHours(checkIn, checkOut) {
  if (!checkOut) return null;
  const minutes = (checkOut.getTime() - checkIn.getTime()) / 60000;
  return Math.round((Math.max(minutes, 0) / 60) * 100) / 100;
}

// The single definition of "a full working day, in minutes". Both the numeric
// overtimeHours figure and every status/day-fraction boundary read from this,
// so the OVERTIME label and the overtime number can never disagree, and the
// full/half/absent bands are always cut from the same cloth.
function fullDayMinutes(schedule) {
  const weeklyHours = schedule ? Number(schedule.weeklyHours) : null;
  if (weeklyHours && weeklyHours > 0) {
    return (weeklyHours / 5) * 60;
  }
  return DEFAULT_FULL_DAY_HOURS * 60;
}

function workedMinutesOf(checkIn, checkOut) {
  return Math.max((checkOut.getTime() - checkIn.getTime()) / 60000, 0);
}

// Mockup's Attendance form shows Overtime as its own numeric field alongside
// Worked Hours, not just the OVERTIME status label — derived here from worked
// time beyond the schedule's daily allocation (post grace period), never
// accepted as client input. No checkout yet: 0, not a guess.
function computeOvertimeHours(checkIn, checkOut, schedule) {
  if (!checkOut) return 0;

  const overtimeMinutes =
    workedMinutesOf(checkIn, checkOut) - (fullDayMinutes(schedule) + OVERTIME_GRACE_MINUTES);
  if (overtimeMinutes <= 0) return 0;

  return Math.round((overtimeMinutes / 60) * 100) / 100;
}

// How much of a working day this record earns, which is what payroll prorates
// against. A day is only whole once the scheduled hours are actually worked;
// at least half of them earns half a day; below that the day earns nothing.
// An open session (no check-out) earns nothing until it's closed — otherwise
// clocking in and walking away would pay better than clocking in and out.
function computeDayFraction({ checkIn, checkOut, schedule }) {
  if (!checkOut) return 0;

  const worked = workedMinutesOf(checkIn, checkOut);
  const fullDay = fullDayMinutes(schedule);

  if (worked >= fullDay) return 1;
  if (worked >= fullDay / 2) return 0.5;
  return 0;
}

// Status is graded purely on how much of the scheduled day was actually
// worked — a late arrival that still clears the full day is PRESENT, not a
// separate LATE status. The short-day bands are checked first: a day that
// didn't clear the half-day bar is an absence regardless of when it started.
function deriveStatus({ checkIn, checkOut, schedule }) {
  // Still clocked in: the day is in progress, so it reads as PRESENT rather
  // than MISSING_CHECKOUT. Nothing is wrong yet — the employee is at work and
  // simply hasn't left. The short-day verdict below is deliberately deferred
  // until there's an actual check-out to measure, at which point a day that
  // never cleared the half-day bar becomes ABSENT.
  if (!checkOut) return "PRESENT";

  const worked = workedMinutesOf(checkIn, checkOut);
  const fullDay = fullDayMinutes(schedule);

  if (worked < fullDay / 2) return "ABSENT";
  if (worked < fullDay) return "HALF_DAY";

  if (worked > fullDay + OVERTIME_GRACE_MINUTES) {
    return "OVERTIME";
  }

  return "PRESENT";
}

// Everything derived from one check-in/check-out pair, so callers can't
// persist a status that disagrees with the day fraction sitting next to it.
function deriveAttendanceFields({ checkIn, checkOut, schedule }) {
  return {
    workedHours: computeWorkedHours(checkIn, checkOut),
    overtimeHours: computeOvertimeHours(checkIn, checkOut, schedule),
    dayFraction: computeDayFraction({ checkIn, checkOut, schedule }),
    status: deriveStatus({ checkIn, checkOut, schedule }),
  };
}

module.exports = {
  computeWorkedHours,
  computeOvertimeHours,
  computeDayFraction,
  deriveStatus,
  deriveAttendanceFields,
  fullDayMinutes,
  DEFAULT_FULL_DAY_HOURS,
};
