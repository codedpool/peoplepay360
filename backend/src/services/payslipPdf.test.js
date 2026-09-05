import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { renderPayslipPdf } from "./payslipPdf.js";

const createdEmployeeIds = [];
const createdStructureIds = [];
const createdPayrunIds = [];

async function setupPayslip() {
  const structure = await prisma.salaryStructure.create({
    data: {
      name: `Structure ${crypto.randomUUID()}`,
      active: true,
      rules: {
        create: [
          { name: "Basic", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "Net", code: "NET", category: "NET", sequence: 2, computationMethod: "FORMULA", formulaOrValue: "BASIC" },
        ],
      },
    },
  });
  createdStructureIds.push(structure.id);

  // Deliberately include characters/whitespace that would break a naive
  // fixed-layout renderer, to prove sanitizeLine holds up.
  const employee = await prisma.employee.create({
    data: { name: "Test\nEmployee\tName", department: "R&D", jobPosition: "Engineer", status: "ACTIVE" },
  });
  createdEmployeeIds.push(employee.id);

  const contract = await prisma.contract.create({
    data: { employeeId: employee.id, startDate: new Date("2025-01-01"), wage: 50000, salaryStructureId: structure.id, status: "ACTIVE" },
  });

  const payrun = await prisma.payrun.create({
    data: { name: "Test Payrun PDF", salaryStructureId: structure.id, periodStart: new Date("2025-06-01"), periodEnd: new Date("2025-06-30"), status: "COMPUTED" },
  });
  createdPayrunIds.push(payrun.id);

  const rules = await prisma.salaryRule.findMany({ where: { salaryStructureId: structure.id } });
  const basicRule = rules.find((r) => r.code === "BASIC");
  const netRule = rules.find((r) => r.code === "NET");

  const payslip = await prisma.payslip.create({
    data: {
      payrunId: payrun.id,
      employeeId: employee.id,
      contractId: contract.id,
      status: "COMPUTED",
      workedDays: 20,
      lines: {
        create: [
          { salaryRuleId: basicRule.id, amount: 50000 },
          { salaryRuleId: netRule.id, amount: 50000 },
        ],
      },
    },
  });

  return payslip.id;
}

describe("renderPayslipPdf", () => {
  afterAll(async () => {
    for (const id of createdPayrunIds) await prisma.payrun.delete({ where: { id } }).catch(() => {});
    for (const id of createdStructureIds) await prisma.salaryStructure.delete({ where: { id } }).catch(() => {});
    for (const id of createdEmployeeIds) await prisma.employee.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("renders a valid PDF byte stream for a real payslip", async () => {
    const payslipId = await setupPayslip();
    const bytes = await renderPayslipPdf(payslipId);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    // %PDF- magic header — confirms this is a well-formed PDF, not garbage bytes.
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("throws for a payslip id that doesn't exist", async () => {
    await expect(renderPayslipPdf("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/not found/);
  });
});
