import { describe, it, expect } from "vitest";
import {
  computeOvertimeHours,
  computeDayFraction,
  deriveStatus,
  deriveAttendanceFields,
} from "./attendance.js";

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

// 20h/week over 5 days = a 4h working day. Included because every threshold is
// meant to scale to the schedule rather than assume everyone works 8h.
const PART_TIME_SCHEDULE = {
  weeklyHours: 20,
  pattern: [
    { day: "MON", start: "09:00", end: "13:00", break: 0 },
    { day: "TUE", start: "09:00", end: "13:00", break: 0 },
    { day: "WED", start: "09:00", end: "13:00", break: 0 },
    { day: "THU", start: "09:00", end: "13:00", break: 0 },
    { day: "FRI", start: "09:00", end: "13:00", break: 0 },
  ],
};

// deriveStatus reads checkIn.getHours() in local time, so tests construct
// times via the local Date constructor (not a "Z" UTC literal) to keep the
// wall-clock hour stable regardless of the machine's timezone.
// 2025-06-02 is a Monday.
function monday(fromHour, fromMinute, toHour, toMinute) {
  return {
    checkIn: new Date(2025, 5, 2, fromHour, fromMinute, 0),
    checkOut: new Date(2025, 5, 2, toHour, toMinute, 0),
  };
}

describe("computeOvertimeHours", () => {
  it("is 0 for a shift within the scheduled daily allocation", () => {
    // Monday 09:00-17:00 = 8h, exactly the 40h/5-day daily allocation.
    const { checkIn, checkOut } = monday(9, 0, 17, 0);
    expect(computeOvertimeHours(checkIn, checkOut, FULL_TIME_SCHEDULE)).toBe(0);
  });

  it("reports hours worked beyond the scheduled day, matching the OVERTIME status threshold", () => {
    // Monday 09:00-20:00 = 11h, well past 8h + grace.
    const { checkIn, checkOut } = monday(9, 0, 20, 0);

    const overtime = computeOvertimeHours(checkIn, checkOut, FULL_TIME_SCHEDULE);
    expect(overtime).toBeGreaterThan(0);
    expect(deriveStatus({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe("OVERTIME");
  });

  it("is 0 with no checkout, rather than guessed", () => {
    const { checkIn } = monday(9, 0, 20, 0);
    expect(computeOvertimeHours(checkIn, null, FULL_TIME_SCHEDULE)).toBe(0);
  });

  it("falls back to an 8h day when the employee has no schedule", () => {
    const { checkIn, checkOut } = monday(9, 0, 20, 0); // 11h
    // 11h - (8h + 15m grace) = 2.75h.
    expect(computeOvertimeHours(checkIn, checkOut, null)).toBe(2.75);
  });

  it("measures overtime against a part-timer's own shorter day", () => {
    const { checkIn, checkOut } = monday(9, 0, 15, 0); // 6h against a 4h day
    expect(computeOvertimeHours(checkIn, checkOut, PART_TIME_SCHEDULE)).toBe(1.75);
  });
});

describe("computeDayFraction", () => {
  it("earns a full day once the scheduled hours are worked", () => {
    const { checkIn, checkOut } = monday(9, 0, 17, 0);
    expect(computeDayFraction({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe(1);
  });

  it("earns half a day at exactly half the scheduled hours", () => {
    const { checkIn, checkOut } = monday(9, 0, 13, 0);
    expect(computeDayFraction({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe(0.5);
  });

  // The bug this whole change exists to fix: a token appearance used to be
  // recorded as PRESENT and paid as a whole day.
  it("earns nothing for a one-minute appearance", () => {
    const { checkIn, checkOut } = monday(9, 0, 9, 1);
    expect(computeDayFraction({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe(0);
  });

  it("earns nothing while the session is still open", () => {
    const { checkIn } = monday(9, 0, 17, 0);
    expect(computeDayFraction({ checkIn, checkOut: null, schedule: FULL_TIME_SCHEDULE })).toBe(0);
  });

  it("never exceeds a full day, however long the shift runs", () => {
    const { checkIn, checkOut } = monday(6, 0, 23, 0);
    expect(computeDayFraction({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe(1);
  });

  it("scales to a part-timer's day: 4h is full for them, half for a full-timer", () => {
    const { checkIn, checkOut } = monday(9, 0, 13, 0);
    expect(computeDayFraction({ checkIn, checkOut, schedule: PART_TIME_SCHEDULE })).toBe(1);
    expect(computeDayFraction({ checkIn, checkOut, schedule: FULL_TIME_SCHEDULE })).toBe(0.5);
  });

  it("falls back to an 8h day when the employee has no schedule", () => {
    expect(computeDayFraction({ ...monday(9, 0, 17, 0), schedule: null })).toBe(1);
    expect(computeDayFraction({ ...monday(9, 0, 13, 0), schedule: null })).toBe(0.5);
    expect(computeDayFraction({ ...monday(9, 0, 10, 0), schedule: null })).toBe(0);
  });
});

describe("deriveStatus", () => {
  it("is PRESENT while the session is still open", () => {
    const { checkIn } = monday(9, 0, 17, 0);
    expect(deriveStatus({ checkIn, checkOut: null, schedule: FULL_TIME_SCHEDULE })).toBe("PRESENT");
  });

  // The short-day verdict waits for a real check-out: an employee who is still
  // clocked in reads PRESENT no matter how little time has passed, and only
  // becomes ABSENT once they check out below the half-day bar.
  it("turns an open PRESENT day into ABSENT once it is closed under the half-day bar", () => {
    const { checkIn } = monday(9, 0, 17, 0);
    expect(deriveStatus({ checkIn, checkOut: null, schedule: FULL_TIME_SCHEDULE })).toBe("PRESENT");

    const earlyCheckOut = new Date(2025, 5, 2, 11, 0, 0); // 2h of an 8h day
    expect(deriveStatus({ checkIn, checkOut: earlyCheckOut, schedule: FULL_TIME_SCHEDULE })).toBe(
      "ABSENT"
    );
  });

  it("is ABSENT below the half-day bar", () => {
    expect(deriveStatus({ ...monday(9, 0, 9, 1), schedule: FULL_TIME_SCHEDULE })).toBe("ABSENT");
    expect(deriveStatus({ ...monday(9, 0, 12, 59), schedule: FULL_TIME_SCHEDULE })).toBe("ABSENT");
  });

  it("is HALF_DAY from the half-day bar up to a full day", () => {
    expect(deriveStatus({ ...monday(9, 0, 13, 0), schedule: FULL_TIME_SCHEDULE })).toBe("HALF_DAY");
    expect(deriveStatus({ ...monday(9, 0, 16, 59), schedule: FULL_TIME_SCHEDULE })).toBe("HALF_DAY");
  });

  it("is PRESENT for a full day started on time", () => {
    expect(deriveStatus({ ...monday(9, 0, 17, 0), schedule: FULL_TIME_SCHEDULE })).toBe("PRESENT");
  });

  it("is PRESENT for a full day started late, not a separate LATE status", () => {
    // In at 09:30 (well past the scheduled 09:00 start), out at 17:30 — a full 8h, no overtime.
    expect(deriveStatus({ ...monday(9, 30, 17, 30), schedule: FULL_TIME_SCHEDULE })).toBe("PRESENT");
  });

  // A short day is an absence regardless of when it started.
  it("prefers the short-day classification over a late start", () => {
    expect(deriveStatus({ ...monday(11, 0, 12, 0), schedule: FULL_TIME_SCHEDULE })).toBe("ABSENT");
    expect(deriveStatus({ ...monday(11, 0, 15, 30), schedule: FULL_TIME_SCHEDULE })).toBe("HALF_DAY");
  });

  it("grades an employee with no schedule against the default day instead of always PRESENT", () => {
    expect(deriveStatus({ ...monday(9, 0, 9, 1), schedule: null })).toBe("ABSENT");
    expect(deriveStatus({ ...monday(9, 0, 13, 0), schedule: null })).toBe("HALF_DAY");
    expect(deriveStatus({ ...monday(9, 0, 17, 0), schedule: null })).toBe("PRESENT");
  });
});

describe("deriveAttendanceFields", () => {
  it("keeps status and dayFraction in agreement", () => {
    const half = deriveAttendanceFields({ ...monday(9, 0, 13, 0), schedule: FULL_TIME_SCHEDULE });
    expect(half).toMatchObject({ status: "HALF_DAY", dayFraction: 0.5, workedHours: 4, overtimeHours: 0 });

    const short = deriveAttendanceFields({ ...monday(9, 0, 9, 1), schedule: FULL_TIME_SCHEDULE });
    expect(short).toMatchObject({ status: "ABSENT", dayFraction: 0 });

    const open = deriveAttendanceFields({
      checkIn: new Date(2025, 5, 2, 9, 0, 0),
      checkOut: null,
      schedule: FULL_TIME_SCHEDULE,
    });
    expect(open).toMatchObject({ status: "PRESENT", dayFraction: 0, workedHours: null });
  });
});
