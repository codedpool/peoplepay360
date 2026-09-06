import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { computePayrun } from "./payrunCompute.js";

const createdEmployeeIds = [];
const createdStructureIds = [];
const createdPayrunIds = [];

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

async function makeStandardStructure() {
  const structure = await prisma.salaryStructure.create({
    data: {
      name: `Structure ${crypto.randomUUID()}`,
      active: true,
      rules: {
        create: [
          { name: "Basic", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "Gross", code: "GROSS", category: "GROSS", sequence: 2, computationMethod: "FORMULA", formulaOrValue: "BASIC" },
          { name: "Tax", code: "TAX", category: "DEDUCTION", sequence: 3, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * GROSS" },
          { name: "Net", code: "NET", category: "NET", sequence: 4, computationMethod: "FORMULA", formulaOrValue: "GROSS - TAX" },
        ],
      },
    },
  });
  createdStructureIds.push(structure.id);
  return structure;
}

// Every weekday in June 2025 — the 21 days an employee with no assigned
// schedule is expected to work in that period. Payslips are prorated against
// attendance now, so a payrun test that wants a full month's pay has to
// actually put in a full month.
const JUNE_2025_WEEKDAYS = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30];

async function seedFullDays(employeeId, dayNumbers) {
  for (const day of dayNumbers) {
    const date = `2025-06-${String(day).padStart(2, "0")}`;
    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date(`${date}T09:00:00Z`),
        checkOut: new Date(`${date}T17:00:00Z`),
        status: "PRESENT",
        dayFraction: 1,
      },
    });
  }
}

describe("computePayrun", () => {
  afterAll(async () => {
    for (const id of createdPayrunIds) {
      await prisma.payrun.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdStructureIds) {
      await prisma.salaryStructure.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("creates a Payslip with computed lines for an employee with a resolvable contract", async () => {
    const structure = await makeStandardStructure();
    const employeeId = await makeEmployee();
    await prisma.contract.create({
      data: {
        employeeId,
        startDate: new Date("2025-01-01"),
        endDate: null,
        ctc: 600000,
        salaryStructureId: structure.id,
        status: "ACTIVE",
      },
    });
    await seedFullDays(employeeId, JUNE_2025_WEEKDAYS);

    const payrun = await prisma.payrun.create({
      data: {
        name: "Test Payrun",
        salaryStructureId: structure.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        status: "DRAFT",
      },
    });
    createdPayrunIds.push(payrun.id);

    const result = await computePayrun(payrun.id, [employeeId]);
    expect(result.computedCount).toBe(1);
    expect(result.unresolvedEmployeeIds).toEqual([]);

    const payslip = await prisma.payslip.findUnique({
      where: { payrunId_employeeId: { payrunId: payrun.id, employeeId } },
      include: { lines: { include: { salaryRule: true } } },
    });
    expect(payslip.status).toBe("COMPUTED");
    expect(payslip.contractId).not.toBeNull();

    expect(Number(payslip.workedDays)).toBe(21);

    const netLine = payslip.lines.find((l) => l.salaryRule.code === "NET");
    expect(Number(netLine.amount)).toBe(45000); // full month: ctc 600000/12 = 50000 gross - 10% tax

    const updatedPayrun = await prisma.payrun.findUnique({ where: { id: payrun.id } });
    expect(updatedPayrun.status).toBe("COMPUTED");
  });

  // The headline fix: a payslip is priced at the days actually attended, not
  // at a whole month regardless.
  it("prorates the payslip down to the days actually worked", async () => {
    const structure = await makeStandardStructure();
    const employeeId = await makeEmployee();
    await prisma.contract.create({
      data: {
        employeeId,
        startDate: new Date("2025-01-01"),
        ctc: 504000,
        salaryStructureId: structure.id,
        status: "ACTIVE",
      },
    });
    // 3 of the period's 21 scheduled working days.
    await seedFullDays(employeeId, [2, 3, 4]);

    const payrun = await prisma.payrun.create({
      data: {
        name: "Test Payrun Prorated",
        salaryStructureId: structure.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        status: "DRAFT",
      },
    });
    createdPayrunIds.push(payrun.id);

    await computePayrun(payrun.id, [employeeId]);

    const payslip = await prisma.payslip.findUnique({
      where: { payrunId_employeeId: { payrunId: payrun.id, employeeId } },
      include: { lines: { include: { salaryRule: true } } },
    });
    expect(Number(payslip.workedDays)).toBe(3);

    const byCode = Object.fromEntries(
      payslip.lines.map((l) => [l.salaryRule.code, Number(l.amount)])
    );
    // ctc 504000/12 = 42000 monthly * 3/21 = 6000 gross, less 10% tax.
    expect(byCode.GROSS).toBe(6000);
    expect(byCode.NET).toBe(5400);
  });

  it("pays nothing for a period the employee never attended", async () => {
    const structure = await makeStandardStructure();
    const employeeId = await makeEmployee();
    await prisma.contract.create({
      data: {
        employeeId,
        startDate: new Date("2025-01-01"),
        ctc: 600000,
        salaryStructureId: structure.id,
        status: "ACTIVE",
      },
    });

    const payrun = await prisma.payrun.create({
      data: {
        name: "Test Payrun No Attendance",
        salaryStructureId: structure.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        status: "DRAFT",
      },
    });
    createdPayrunIds.push(payrun.id);

    await computePayrun(payrun.id, [employeeId]);

    const payslip = await prisma.payslip.findUnique({
      where: { payrunId_employeeId: { payrunId: payrun.id, employeeId } },
      include: { lines: { include: { salaryRule: true } } },
    });
    expect(Number(payslip.workedDays)).toBe(0);
    expect(payslip.lines.every((l) => Number(l.amount) === 0)).toBe(true);
  });

  it("does not create a Payslip for an employee with no resolvable contract, and reports them as unresolved", async () => {
    const structure = await makeStandardStructure();
    const employeeId = await makeEmployee(); // no contract at all

    const payrun = await prisma.payrun.create({
      data: {
        name: "Test Payrun No Contract",
        salaryStructureId: structure.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        status: "DRAFT",
      },
    });
    createdPayrunIds.push(payrun.id);

    const result = await computePayrun(payrun.id, [employeeId]);
    expect(result.computedCount).toBe(0);
    expect(result.unresolvedEmployeeIds).toEqual([employeeId]);

    const payslip = await prisma.payslip.findUnique({
      where: { payrunId_employeeId: { payrunId: payrun.id, employeeId } },
    });
    expect(payslip).toBeNull();
  });

  it("reports progress via onProgress as each employee is processed", async () => {
    const structure = await makeStandardStructure();
    const employeeA = await makeEmployee();
    const employeeB = await makeEmployee();
    await prisma.contract.create({
      data: { employeeId: employeeA, startDate: new Date("2025-01-01"), ctc: 480000, salaryStructureId: structure.id, status: "ACTIVE" },
    });
    await prisma.contract.create({
      data: { employeeId: employeeB, startDate: new Date("2025-01-01"), ctc: 720000, salaryStructureId: structure.id, status: "ACTIVE" },
    });

    const payrun = await prisma.payrun.create({
      data: {
        name: "Test Payrun Progress",
        salaryStructureId: structure.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-30"),
        status: "DRAFT",
      },
    });
    createdPayrunIds.push(payrun.id);

    const progressCalls = [];
    await computePayrun(payrun.id, [employeeA, employeeB], {
      onProgress: (done, total) => progressCalls.push({ done, total }),
    });

    expect(progressCalls).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });
});
