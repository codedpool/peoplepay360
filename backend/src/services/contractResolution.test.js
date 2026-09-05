import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { resolveContractForPeriod } from "./contractResolution.js";

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

describe("resolveContractForPeriod", () => {
  afterAll(async () => {
    for (const id of createdEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("resolves the contract whose range contains the period, and returns null outside any range", async () => {
    const employeeId = await makeEmployee();

    await prisma.contract.create({
      data: {
        employeeId,
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
        wage: 50000,
        status: "EXPIRED",
      },
    });
    await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), endDate: null, wage: 60000, status: "ACTIVE" },
    });

    const resolved = await resolveContractForPeriod(employeeId, new Date("2025-03-01"), new Date("2025-03-31"));
    expect(resolved).not.toBeNull();
    expect(Number(resolved.wage)).toBe(60000);

    const noMatch = await resolveContractForPeriod(employeeId, new Date("2023-01-01"), new Date("2023-01-31"));
    expect(noMatch).toBeNull();
  });

  it("rejects an overlapping ACTIVE contract at the database level", async () => {
    const employeeId = await makeEmployee();

    await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), endDate: null, wage: 60000, status: "ACTIVE" },
    });

    await expect(
      prisma.contract.create({
        data: { employeeId, startDate: new Date("2025-06-01"), endDate: null, wage: 70000, status: "ACTIVE" },
      })
    ).rejects.toThrow();
  });
});
