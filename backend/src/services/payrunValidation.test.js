import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { validatePayrun } from "./payrunValidation.js";

const createdEmployeeIds = [];
const createdStructureIds = [];
const createdPayrunIds = [];

async function makeEmployee() {
  const employee = await prisma.employee.create({
    data: { name: `Test Employee ${crypto.randomUUID()}`, department: "Test", jobPosition: "Test Role", status: "ACTIVE" },
  });
  createdEmployeeIds.push(employee.id);
  return employee.id;
}

async function makeStructureWithRule() {
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

async function makePayrun(structureId, periodStart, periodEnd) {
  const payrun = await prisma.payrun.create({
    data: { name: `Payrun ${crypto.randomUUID()}`, salaryStructureId: structureId, periodStart, periodEnd, status: "COMPUTED" },
  });
  createdPayrunIds.push(payrun.id);
  return payrun;
}

describe("validatePayrun", () => {
  afterAll(async () => {
    for (const id of createdPayrunIds) await prisma.payrun.delete({ where: { id } }).catch(() => {});
    for (const id of createdStructureIds) await prisma.salaryStructure.delete({ where: { id } }).catch(() => {});
    for (const id of createdEmployeeIds) await prisma.employee.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("flags a negative net amount as a blocking finding", async () => {
    const structure = await makeStructureWithRule();
    const employeeId = await makeEmployee();
    const contract = await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), wage: 1000, salaryStructureId: structure.id, status: "ACTIVE" },
    });
    const payrun = await makePayrun(structure.id, new Date("2025-06-01"), new Date("2025-06-30"));
    const netRule = await prisma.salaryRule.findFirst({ where: { salaryStructureId: structure.id, code: "NET" } });

    await prisma.payslip.create({
      data: {
        payrunId: payrun.id,
        employeeId,
        contractId: contract.id,
        status: "COMPUTED",
        workedDays: 20,
        lines: { create: [{ salaryRuleId: netRule.id, amount: -500 }] },
      },
    });

    const findings = await validatePayrun(payrun.id);
    const negativeNet = findings.find((f) => f.code === "negative_net");
    expect(negativeNet).toBeDefined();
    expect(negativeNet.blocking).toBe(true);
    expect(negativeNet.employeeId).toBe(employeeId);
  });

  it("flags a duplicate payslip when the same employee has an overlapping-period payslip in another payrun", async () => {
    const structure = await makeStructureWithRule();
    const employeeId = await makeEmployee();
    const contract = await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), wage: 1000, salaryStructureId: structure.id, status: "ACTIVE" },
    });
    const netRule = await prisma.salaryRule.findFirst({ where: { salaryStructureId: structure.id, code: "NET" } });

    const payrunA = await makePayrun(structure.id, new Date("2025-06-01"), new Date("2025-06-30"));
    const payrunB = await makePayrun(structure.id, new Date("2025-06-15"), new Date("2025-07-15")); // overlaps A

    await prisma.payslip.create({
      data: { payrunId: payrunA.id, employeeId, contractId: contract.id, status: "COMPUTED", workedDays: 20, lines: { create: [{ salaryRuleId: netRule.id, amount: 900 }] } },
    });
    await prisma.payslip.create({
      data: { payrunId: payrunB.id, employeeId, contractId: contract.id, status: "COMPUTED", workedDays: 20, lines: { create: [{ salaryRuleId: netRule.id, amount: 900 }] } },
    });

    const findings = await validatePayrun(payrunB.id);
    const duplicate = findings.find((f) => f.code === "duplicate_payslip");
    expect(duplicate).toBeDefined();
    expect(duplicate.blocking).toBe(true);
  });

  it("flags a non-blocking structure mismatch when the contract's structure differs from the payrun's", async () => {
    const contractStructure = await makeStructureWithRule();
    const payrunStructure = await makeStructureWithRule();
    const employeeId = await makeEmployee();
    const contract = await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), wage: 1000, salaryStructureId: contractStructure.id, status: "ACTIVE" },
    });
    const payrun = await makePayrun(payrunStructure.id, new Date("2025-08-01"), new Date("2025-08-31"));
    const netRule = await prisma.salaryRule.findFirst({ where: { salaryStructureId: payrunStructure.id, code: "NET" } });

    await prisma.payslip.create({
      data: { payrunId: payrun.id, employeeId, contractId: contract.id, status: "COMPUTED", workedDays: 20, lines: { create: [{ salaryRuleId: netRule.id, amount: 900 }] } },
    });

    const findings = await validatePayrun(payrun.id);
    const mismatch = findings.find((f) => f.code === "structure_mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch.blocking).toBe(false);
    expect(mismatch.employeeId).toBe(employeeId);
  });

  it("returns no findings for a clean payrun", async () => {
    const structure = await makeStructureWithRule();
    const employeeId = await makeEmployee();
    const contract = await prisma.contract.create({
      data: { employeeId, startDate: new Date("2025-01-01"), wage: 1000, salaryStructureId: structure.id, status: "ACTIVE" },
    });
    const netRule = await prisma.salaryRule.findFirst({ where: { salaryStructureId: structure.id, code: "NET" } });
    const payrun = await makePayrun(structure.id, new Date("2025-09-01"), new Date("2025-09-30"));

    await prisma.payslip.create({
      data: { payrunId: payrun.id, employeeId, contractId: contract.id, status: "COMPUTED", workedDays: 20, lines: { create: [{ salaryRuleId: netRule.id, amount: 900 }] } },
    });

    const findings = await validatePayrun(payrun.id);
    expect(findings).toEqual([]);
  });
});
