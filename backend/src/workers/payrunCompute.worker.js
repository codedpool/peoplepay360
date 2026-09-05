const { Worker } = require("bullmq");
const { connection } = require("../lib/queue");
const { prisma } = require("../lib/prisma");
const { computePayrun } = require("../services/payrunCompute");
const { invalidateDashboardCache } = require("../lib/dashboardCache");

// Runs as its own process (`npm run worker`), separate from the API. The
// enqueue route returns immediately with a job id; this is what actually
// does the (potentially slow, batch-sized) work, reporting progress back
// through BullMQ's job.updateProgress so a status endpoint can poll it
// without blocking on one long HTTP call (Section 6 of plan.md).
const payrunComputeWorker = new Worker(
  "payrun-compute",
  async (job) => {
    const { payrunId, employeeIds, actorUserId } = job.data;

    const result = await computePayrun(payrunId, employeeIds, {
      onProgress: async (done, total) => {
        await job.updateProgress({ done, total });
      },
    });

    // Payslip data just changed — every dashboard number derives from it.
    await invalidateDashboardCache();

    await prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action: "payrun.compute",
        entityType: "Payrun",
        entityId: payrunId,
        before: { status: "DRAFT" },
        after: {
          status: "COMPUTED",
          employeeCount: result.employeeCount,
          computedCount: result.computedCount,
          unresolvedEmployeeIds: result.unresolvedEmployeeIds,
        },
      },
    });

    return result;
  },
  { connection }
);

payrunComputeWorker.on("failed", (job, err) => {
  console.error(`payrun-compute job ${job?.id} failed:`, err);
});

module.exports = { payrunComputeWorker };
