import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { computeWorkedDays } from "./workedDays.js";

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

describe("computeWorkedDays", () => {
  afterAll(async () => {
    for (const id of createdEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("counts distinct days with a completed check-in and check-out within the period", async () => {
    const employeeId = await makeEmployee();

    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date("2025-06-02T09:00:00Z"),
        checkOut: new Date("2025-06-02T17:00:00Z"),
        status: "PRESENT",
      },
    });
    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date("2025-06-03T09:00:00Z"),
        checkOut: new Date("2025-06-03T17:00:00Z"),
        status: "PRESENT",
      },
    });
    // Missing checkout — should not count as a worked day.
    await prisma.attendance.create({
      data: { employeeId, checkIn: new Date("2025-06-04T09:00:00Z"), status: "MISSING_CHECKOUT" },
    });
    // Outside the queried period — should not count.
    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date("2025-07-01T09:00:00Z"),
        checkOut: new Date("2025-07-01T17:00:00Z"),
        status: "PRESENT",
      },
    });

    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(2);
  });

  it("returns 0 for an employee with no attendance in the period", async () => {
    const employeeId = await makeEmployee();
    const days = await computeWorkedDays(employeeId, new Date("2025-06-01"), new Date("2025-06-30"));
    expect(days).toBe(0);
  });
});
