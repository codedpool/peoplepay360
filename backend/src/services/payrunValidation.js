const { prisma } = require("../lib/prisma");

// Every check here reads real rows and returns a structured finding — never a
// static placeholder string (Section 7 of plan.md: "Payrun validation must
// surface real warnings... computed from actual data checks"). `blocking:
// true` findings must be cleared before a Payrun can be marked paid; `false`
// ones are surfaced but don't stop the run.
//
// missing_bank_details is intentionally NOT implemented: Employee has no bank
// detail field in the schema yet (Track A's territory — schema.prisma is a
// shared file). Add the check here the moment that field lands; until then
// this list only makes claims the current schema can actually support.
//
// Employees selected for a Payrun whose contract didn't resolve during
// compute get no Payslip at all — Payslip.contractId is required, so "a
// payslip with no contract" isn't representable. computePayrun writes an
// AuditLog row naming them at compute time; validate reads it back here so
// the finding survives even when validate runs in a separate request from
// compute.
async function loadUnresolvedEmployeeIds(payrunId) {
  const entry = await prisma.auditLog.findFirst({
    where: { entityType: "Payrun", entityId: payrunId, action: "payrun.compute" },
    orderBy: { createdAt: "desc" },
  });
  return entry?.after?.unresolvedEmployeeIds ?? [];
}

async function validatePayrun(payrunId) {
  const payrun = await prisma.payrun.findUnique({
    where: { id: payrunId },
    include: { payslips: { include: { contract: true } } },
  });
  if (!payrun) {
    throw new Error(`Payrun ${payrunId} not found`);
  }

  const findings = [];

  const unresolvedEmployeeIds = await loadUnresolvedEmployeeIds(payrunId);
  for (const employeeId of unresolvedEmployeeIds) {
    findings.push({
      code: "no_applicable_contract",
      blocking: true,
      employeeId,
      message: `No contract resolved for employee ${employeeId} in this Payrun's period`,
    });
  }

  // Duplicate payslip: the same employee has a payslip in ANOTHER payrun
  // whose period overlaps this one. The @@unique([payrunId, employeeId])
  // constraint already prevents two payslips within the same Payrun — this
  // check is for the cross-Payrun case the DB constraint can't catch.
  const employeeIds = payrun.payslips.map((p) => p.employeeId);
  if (employeeIds.length > 0) {
    const overlapping = await prisma.payslip.findMany({
      where: {
        employeeId: { in: employeeIds },
        payrunId: { not: payrunId },
        payrun: {
          periodStart: { lte: payrun.periodEnd },
          periodEnd: { gte: payrun.periodStart },
        },
      },
      include: { payrun: true },
    });
    for (const dup of overlapping) {
      findings.push({
        code: "duplicate_payslip",
        blocking: true,
        employeeId: dup.employeeId,
        message: `Employee ${dup.employeeId} already has a payslip in Payrun "${dup.payrun.name}" for an overlapping period`,
      });
    }
  }

  // Negative net: deductions exceeded gross — usually a misordered or
  // misconfigured rule, never a legitimate payslip outcome.
  for (const payslip of payrun.payslips) {
    const netLine = await prisma.payslipLine.findFirst({
      where: { payslipId: payslip.id, salaryRule: { category: "NET" } },
    });
    if (netLine && Number(netLine.amount) < 0) {
      findings.push({
        code: "negative_net",
        blocking: true,
        employeeId: payslip.employeeId,
        message: `Payslip for employee ${payslip.employeeId} computed a negative net amount (${netLine.amount})`,
      });
    }
  }

  return findings;
}

module.exports = { validatePayrun };
