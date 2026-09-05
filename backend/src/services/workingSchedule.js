// Weekly hours must be computed from the pattern, never accepted as direct
// client input (Section 5/7 of plan.md) — this is the one place that math happens.
function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function computeWeeklyHours(pattern) {
  const totalMinutes = pattern.reduce((sum, entry) => {
    const worked = timeToMinutes(entry.end) - timeToMinutes(entry.start) - (entry.break || 0);
    return sum + Math.max(worked, 0);
  }, 0);
  return Math.round((totalMinutes / 60) * 100) / 100;
}

module.exports = { computeWeeklyHours, timeToMinutes };
