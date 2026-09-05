import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import {
  getKpis,
  getSalaryCostByDepartment,
  getTimeOffOverview,
  getDepartmentOverview,
} from "./dashboard.js";

const createdEmployeeIds = [];
const createdStructureIds = [];
const createdPayrunIds = [];
const createdTimeOffTypeIds = [];

async function makeEmployee(department = "Test") {
  const employee = await prisma.employee.create({
    data: { name: `Test Employee ${crypto.randomUUID()}`, department, jobPosition: "Test Role", status: "ACTIVE" },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
}

async function makeStructureWithNetRule() {
  const structure = await prisma.salaryStructure.create({
    data: {
      name: `Structure ${crypto.randomUUID()}`,
      active: true,
      rules: { create: [{ name: "Net", code: "NET", category: "NET", sequence: 1, computationMethod: "FIXED", formulaOrValue: "0" }] },
    },
  });
  createdStructureIds.push(structure.id);
  return structure;
}

async function makePaidPayslip({ employee, structure, periodStart, periodEnd, amount, status = "PAID", contractId }) {
  const contract = contractId
    ? { id: contractId }
    : await prisma.contract.create({
        data: { employeeId: employee.id, startDate: new Date("2020-01-01"), wage: 1000, salaryStructureId: structure.id, status: "ACTIVE" },
      });
  const payrun = await prisma.payrun.create({
    data: { name: `Payrun ${crypto.randomUUID()}`, salaryStructureId: structure.id, periodStart, periodEnd, status },
  });
  createdPayrunIds.push(payrun.id);
  const netRule = await prisma.salaryRule.findFirst({ where: { salaryStructureId: structure.id, code: "NET" } });
  await prisma.payslip.create({
    data: {
      payrunId: payrun.id,
      employeeId: employee.id,
      contractId: contract.id,
      status,
      workedDays: 20,
      lines: { create: [{ salaryRuleId: netRule.id, amount }] },
    },
  });
  return payrun;
}

describe("dashboard aggregates", () => {
  afterAll(async () => {
    for (const id of createdPayrunIds) await prisma.payrun.delete({ where: { id } }).catch(() => {});
    for (const id of createdStructureIds) await prisma.salaryStructure.delete({ where: { id } }).catch(() => {});
    for (const id of createdTimeOffTypeIds) await prisma.timeOffType.delete({ where: { id } }).catch(() => {});
    for (const id of createdEmployeeIds) await prisma.employee.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("getKpis only counts PAID/SENT payslips toward totalNetSalaryPaid, not DRAFT/COMPUTED", async () => {
    const structure = await makeStructureWithNetRule();
    const employee = await makeEmployee();
    const periodStart = new Date("2031-01-01");
    const periodEnd = new Date("2031-01-31");
    const contract = await prisma.contract.create({
      data: { employeeId: employee.id, startDate: new Date("2020-01-01"), wage: 1000, salaryStructureId: structure.id, status: "ACTIVE" },
    });

    await makePaidPayslip({ employee, structure, periodStart, periodEnd, amount: 900, status: "PAID", contractId: contract.id });
    await makePaidPayslip({ employee, structure, periodStart, periodEnd, amount: 500, status: "COMPUTED", contractId: contract.id });

    const kpis = await getKpis({ periodStart, periodEnd });
    expect(kpis.totalNetSalaryPaid).toBe(900);
    expect(kpis.payslipsGenerated).toBe(2);
    expect(kpis.payslipsPaid).toBe(1);
    expect(kpis.payslipsPending).toBe(1);
  });

  it("getKpis includes a payslip whose payrun period ends on the query's last day (inclusive boundary)", async () => {
    const structure = await makeStructureWithNetRule();
    const employee = await makeEmployee();
    // The payrun's own period is Jan 1-31 — this just confirms the KPI query's
    // own periodStart/periodEnd overlap check treats Jan 31 as inside the range.
    await makePaidPayslip({
      employee,
      structure,
      periodStart: new Date("2032-01-01"),
      periodEnd: new Date("2032-01-31"),
      amount: 700,
      status: "PAID",
    });

    const kpis = await getKpis({ periodStart: new Date("2032-01-01"), periodEnd: new Date("2032-01-31") });
    expect(kpis.totalNetSalaryPaid).toBe(700);
  });

  it("getSalaryCostByDepartment groups PAID/SENT net amounts by the employee's department", async () => {
    const structure = await makeStructureWithNetRule();
    const engineer = await makeEmployee("Engineering-Test");
    const hr = await makeEmployee("HR-Test");
    const periodStart = new Date("2033-01-01");
    const periodEnd = new Date("2033-01-31");

    await makePaidPayslip({ employee: engineer, structure, periodStart, periodEnd, amount: 1000, status: "PAID" });
    await makePaidPayslip({ employee: hr, structure, periodStart, periodEnd, amount: 400, status: "SENT" });

    const result = await getSalaryCostByDepartment({ periodStart, periodEnd });
    const byDept = Object.fromEntries(result.map((r) => [r.department, r.totalNet]));
    expect(byDept["Engineering-Test"]).toBe(1000);
    expect(byDept["HR-Test"]).toBe(400);
  });

  it("getTimeOffOverview separates approved from pending days and only sums remaining balance for types that require allocation", async () => {
    const employee = await makeEmployee();
    const requiresAllocType = await prisma.timeOffType.create({
      data: { name: `CL ${crypto.randomUUID()}`, unit: "DAYS", requiresAllocation: true },
    });
    createdTimeOffTypeIds.push(requiresAllocType.id);
    const noAllocType = await prisma.timeOffType.create({
      data: { name: `LWP ${crypto.randomUUID()}`, unit: "DAYS", requiresAllocation: false },
    });
    createdTimeOffTypeIds.push(noAllocType.id);

    await prisma.timeOffAllocation.create({
      data: {
        employeeId: employee.id,
        timeOffTypeId: requiresAllocType.id,
        allocated: 12,
        taken: 3,
        remaining: 9,
        validFrom: new Date("2034-01-01"),
        validTo: new Date("2034-12-31"),
        status: "ACTIVE",
      },
    });
    await prisma.timeOffRequest.create({
      data: {
        employeeId: employee.id,
        timeOffTypeId: requiresAllocType.id,
        startDate: new Date("2034-02-01"),
        endDate: new Date("2034-02-03"),
        duration: 3,
        status: "APPROVED",
      },
    });
    await prisma.timeOffRequest.create({
      data: {
        employeeId: employee.id,
        timeOffTypeId: noAllocType.id,
        startDate: new Date("2034-02-10"),
        endDate: new Date("2034-02-11"),
        duration: 2,
        status: "PENDING",
      },
    });

    const overview = await getTimeOffOverview({ periodStart: new Date("2034-01-01"), periodEnd: new Date("2034-12-31") });
    const withAlloc = overview.find((o) => o.typeId === requiresAllocType.id);
    const withoutAlloc = overview.find((o) => o.typeId === noAllocType.id);

    expect(withAlloc.approvedDays).toBe(3);
    expect(withAlloc.pendingDays).toBe(0);
    expect(withAlloc.remainingBalance).toBe(9);

    expect(withoutAlloc.approvedDays).toBe(0);
    expect(withoutAlloc.pendingDays).toBe(2);
    expect(withoutAlloc.remainingBalance).toBeNull();
  });

  it("getDepartmentOverview sums only ACTIVE contracts' wages for ACTIVE employees", async () => {
    const structure = await makeStructureWithNetRule();
    const employee = await makeEmployee("Sales-Test");
    await prisma.contract.create({
      data: { employeeId: employee.id, startDate: new Date("2020-01-01"), endDate: new Date("2020-12-31"), wage: 5000, salaryStructureId: structure.id, status: "EXPIRED" },
    });
    await prisma.contract.create({
      data: { employeeId: employee.id, startDate: new Date("2035-01-01"), wage: 3000, salaryStructureId: structure.id, status: "ACTIVE" },
    });

    const overview = await getDepartmentOverview({});
    const salesRow = overview.find((d) => d.department === "Sales-Test");
    expect(salesRow.headcount).toBe(1);
    expect(salesRow.monthlySalary).toBe(3000);
  });
});
