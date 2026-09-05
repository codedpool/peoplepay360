const { prisma } = require("../lib/prisma");

// Golden Rule #1: exactly one ACTIVE contract per employee can apply to a given
// period — the one whose range fully contains it. The DB exclusion constraint
// makes overlapping ACTIVE contracts structurally impossible, so finding more
// than one here would mean a bug upstream of the constraint, not a normal case.
async function resolveContractForPeriod(employeeId, periodStart, periodEnd) {
  const contracts = await prisma.contract.findMany({
    where: {
      employeeId,
      status: "ACTIVE",
      startDate: { lte: periodStart },
      OR: [{ endDate: null }, { endDate: { gte: periodEnd } }],
    },
  });

  if (contracts.length > 1) {
    throw new Error(
      `Resolved ${contracts.length} active contracts for employee ${employeeId} in period ` +
        `${periodStart.toISOString()}–${periodEnd.toISOString()}; the DB exclusion constraint ` +
        "should make this impossible"
    );
  }

  return contracts[0] ?? null;
}

module.exports = { resolveContractForPeriod };
