const { prisma } = require("../lib/prisma");
const { resolveContractForPeriod } = require("./contractResolution");
const { computePayslipLines } = require("./ruleEngine");
const { computeWorkedDays } = require("./workedDays");

// Runs inside the BullMQ worker, never inline in a request handler (Section 6
// of plan.md). For each selected employee: resolve the period contract, and
// only if one resolves, compute worked days and walk the rule engine to
// create the Payslip + PayslipLine rows. An employee with no resolvable
// contract gets no Payslip at all — Payslip.contractId is a required field,
// so there is no "payslip with a missing contract" state to represent. That
// employee is instead recorded as an unresolved-contract finding the caller
// can report (and validatePayrun's no_applicable_contract check reflects the
// same gap from the Payrun side once payslips exist).
async function computePayrun(payrunId, employeeIds, { onProgress } = {}) {
  const payrun = await prisma.payrun.findUnique({ where: { id: payrunId } });
  if (!payrun) {
    throw new Error(`Payrun ${payrunId} not found`);
  }

  const rules = await prisma.salaryRule.findMany({
    where: { salaryStructureId: payrun.salaryStructureId },
  });

  const total = employeeIds.length;
  let done = 0;
  const unresolvedEmployeeIds = [];

  for (const employeeId of employeeIds) {
    const contract = await resolveContractForPeriod(employeeId, payrun.periodStart, payrun.periodEnd);

    if (!contract) {
      unresolvedEmployeeIds.push(employeeId);
    } else {
      const lines = computePayslipLines({ contract, rules });
      const workedDays = await computeWorkedDays(employeeId, payrun.periodStart, payrun.periodEnd);

      await prisma.payslip.upsert({
        where: { payrunId_employeeId: { payrunId, employeeId } },
        create: {
          payrunId,
          employeeId,
          contractId: contract.id,
          status: "COMPUTED",
          workedDays,
          lines: { create: lines.map((l) => ({ salaryRuleId: l.salaryRuleId, amount: l.amount })) },
        },
        update: {
          contractId: contract.id,
          status: "COMPUTED",
          workedDays,
          lines: {
            deleteMany: {},
            create: lines.map((l) => ({ salaryRuleId: l.salaryRuleId, amount: l.amount })),
          },
        },
      });
    }

    done += 1;
    if (onProgress) await onProgress(done, total);
  }

  await prisma.payrun.update({ where: { id: payrunId }, data: { status: "COMPUTED" } });

  return { payrunId, employeeCount: total, computedCount: total - unresolvedEmployeeIds.length, unresolvedEmployeeIds };
}

module.exports = { computePayrun };
