import { describe, it, expect } from "vitest";
import { computeOvertimeHours, deriveStatus } from "./attendance.js";

const FULL_TIME_SCHEDULE = {
  weeklyHours: 40,
  pattern: [
    { day: "MON", start: "09:00", end: "17:00", break: 60 },
    { day: "TUE", start: "09:00", end: "17:00", break: 60 },
    { day: "WED", start: "09:00", end: "17:00", break: 60 },
    { day: "THU", start: "09:00", end: "17:00", break: 60 },
    { day: "FRI", start: "09:00", end: "17:00", break: 60 },
  ],
};

// deriveStatus reads checkIn.getHours() in local time, so tests construct
// times via the local Date constructor (not a "Z" UTC literal) to keep the
// wall-clock hour stable regardless of the machine's timezone.
describe("computeOvertimeHours", () => {
  it("is 0 for a shift within the scheduled daily allocation", () => {
    // Monday 09:00-17:00 = 8h, exactly the 40h/5-day daily allocation.
    const checkIn = new Date(2025, 5, 2, 9, 0, 0);
    const checkOut = new Date(2025, 5, 2, 17, 0, 0);
    expect(computeOvertimeHours(checkIn, checkOut, FULL_TIME_SCHEDULE)).toBe(0);
  });

  it("reports hours worked beyond the scheduled day, matching the OVERTIME status threshold", () => {
    // Monday 09:00-20:00 = 11h, well past 8h + grace.
    const checkIn = new Date(2025, 5, 2, 9, 0, 0);
    const checkOut = new Date(2025, 5, 2, 20, 0, 0);

    const overtime = computeOvertimeHours(checkIn, checkOut, FULL_TIME_SCHEDULE);
    expect(overtime).toBeGreaterThan(0);
    expect(deriveStatus({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe("OVERTIME");
  });

  it("is 0 with no schedule or no checkout, rather than guessed", () => {
    const checkIn = new Date(2025, 5, 2, 9, 0, 0);
    const checkOut = new Date(2025, 5, 2, 20, 0, 0);
    expect(computeOvertimeHours(checkIn, checkOut, null)).toBe(0);
    expect(computeOvertimeHours(checkIn, null, FULL_TIME_SCHEDULE)).toBe(0);
  });
});
