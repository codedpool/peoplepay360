import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { computeWorkedDays, countScheduledWorkingDays, computeWorkedRatio } from "./workedDays.js";

const createdEmployeeIds = [];

async function makeEmployee() {
  const employee = await prisma.employee.create({
    data: {
      name: `Test Employee ${crypto.randomUUID()}`,
      department: "Test",
      jobPosition: "Test Role",
      status: "ACTIVE",
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee.id;
}

// Mirrors what the attendance routes persist: status and dayFraction are
// always derived together, so the fixtures set both rather than leaving
// dayFraction at its column default.
function attendance(employeeId, day, { status, dayFraction, checkOut = true }) {
  return prisma.attendance.create({
    data: {
      employeeId,
      checkIn: new Date(`${day}T09:00:00Z`),
      checkOut: checkOut ? new Date(`${day}T17:00:00Z`) : null,
      status,
      dayFraction,
    },
  });
}

describe("computeWorkedDays", () => {
  afterAll(async () => {
    for (const id of createdEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("sums day-equivalents rather than counting days that have a record", async () => {
    const employeeId = await makeEmployee();

    await attendance(employeeId, "2025-06-02", { status: "PRESENT", dayFraction: 1 });
    await attendance(employeeId, "2025-06-03", { status: "HALF_DAY", dayFraction: 0.5 });
    // Turned up, didn't clear the half-day bar — earns nothing, even though a
    // completed record exists for the day.
    await attendance(employeeId, "2025-06-05", { status: "ABSENT", dayFraction: 0 });
    // Missing checkout — not confirmed attendance.
    await attendance(employeeId, "2025-06-04", {
      status: "MISSING_CHECKOUT",
      dayFraction: 0,
      checkOut: false,
    });
    // Outside the queried period.
    await attendance(employeeId, "2025-07-01", { status: "PRESENT", dayFraction: 1 });

    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(1.5);
  });

  it("returns 0 for an employee with no attendance in the period", async () => {
    const employeeId = await makeEmployee();
    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(0);
  });

  // periodEnd (@db.Date) is midnight at the *start* of the last day — a
  // daytime check-in on that same calendar day must still count.
  it("counts a completed day that falls on the period's last calendar day", async () => {
    const employeeId = await makeEmployee();
    await attendance(employeeId, "2025-06-30", { status: "PRESENT", dayFraction: 1 });

    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(1);
  });

  // Two half-day sessions across one calendar day are one worked day, and two
  // full sessions in a day still can't be worth two.
  it("caps a single calendar day at one day-equivalent", async () => {
    const employeeId = await makeEmployee();
    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date("2025-06-02T09:00:00Z"),
        checkOut: new Date("2025-06-02T13:00:00Z"),
        status: "HALF_DAY",
        dayFraction: 0.5,
      },
    });
    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date("2025-06-02T14:00:00Z"),
        checkOut: new Date("2025-06-02T22:00:00Z"),
        status: "PRESENT",
        dayFraction: 1,
      },
    });

    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(1);
  });
});

describe("countScheduledWorkingDays", () => {
  it("counts Mon–Fri when the employee has no schedule", () => {
    // June 2025: 30 days, starts on a Sunday, 21 weekdays.
    expect(countScheduledWorkingDays(null, new Date("2025-06-01"), new Date("2025-06-30"))).toBe(21);
  });

  it("counts only the days a schedule's pattern actually covers", () => {
    const threeDayWeek = {
      pattern: [
        { day: "MON", start: "09:00", end: "17:00" },
        { day: "WED", start: "09:00", end: "17:00" },
        { day: "FRI", start: "09:00", end: "17:00" },
      ],
    };
    // June 2025 has 5 Mondays, 4 Wednesdays and 4 Fridays.
    expect(
      countScheduledWorkingDays(threeDayWeek, new Date("2025-06-01"), new Date("2025-06-30"))
    ).toBe(13);
  });

  it("includes both ends of the period", () => {
    // Monday 2025-06-02 through Friday 2025-06-06.
    expect(countScheduledWorkingDays(null, new Date("2025-06-02"), new Date("2025-06-06"))).toBe(5);
    // A single working day.
    expect(countScheduledWorkingDays(null, new Date("2025-06-02"), new Date("2025-06-02"))).toBe(1);
  });
});

describe("computeWorkedRatio", () => {
  it("is the share of the scheduled month actually worked", () => {
    expect(computeWorkedRatio(11, 22)).toBe(0.5);
    expect(computeWorkedRatio(22, 22)).toBe(1);
    expect(computeWorkedRatio(0, 22)).toBe(0);
  });

  // Extra days are overtime, which the rule structure prices separately. They
  // must never inflate the base wage past a full month.
  it("caps at a full month", () => {
    expect(computeWorkedRatio(25, 22)).toBe(1);
  });

  it("is 0 rather than NaN when the period contains no scheduled days", () => {
    expect(computeWorkedRatio(3, 0)).toBe(0);
  });
});
