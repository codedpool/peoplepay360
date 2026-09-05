import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const createdEmployeeIds = [];
const createdTimeOffTypeIds = [];

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

// Mirrors the transaction body in timeOffRequests.routes.js `/approve` — kept
// as a standalone function here so the race can be tested without spinning up
// the HTTP layer.
async function approve(requestId, actorUserId) {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.timeOffRequest.findUnique({
        where: { id: requestId },
        include: { timeOffType: true },
      });
      if (!request || request.status !== "PENDING") {
        throw Object.assign(new Error("not pending"), { statusCode: 409 });
      }

      const allocation = await tx.timeOffAllocation.findFirst({
        where: {
          employeeId: request.employeeId,
          timeOffTypeId: request.timeOffTypeId,
          status: "ACTIVE",
          validFrom: { lte: request.startDate },
          validTo: { gte: request.endDate },
        },
      });
      if (!allocation) throw Object.assign(new Error("no allocation"), { statusCode: 409 });

      const remaining = Number(allocation.remaining);
      const duration = Number(request.duration);
      if (remaining < duration) {
        throw Object.assign(new Error("insufficient balance"), { statusCode: 409 });
      }

      await tx.timeOffAllocation.update({
        where: { id: allocation.id },
        data: { taken: { increment: duration }, remaining: { decrement: duration } },
      });

      return tx.timeOffRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

describe("time off approval concurrency", () => {
  afterAll(async () => {
    for (const id of createdEmployeeIds) {
      await prisma.employee.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdTimeOffTypeIds) {
      await prisma.timeOffType.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("does not double-deduct or go negative when two approvals race the same allocation", async () => {
    const employeeId = await makeEmployee();
    const timeOffType = await prisma.timeOffType.create({
      data: { name: `PTO ${crypto.randomUUID()}`, unit: "DAYS", requiresAllocation: true },
    });
    createdTimeOffTypeIds.push(timeOffType.id);
    const allocation = await prisma.timeOffAllocation.create({
      data: {
        employeeId,
        timeOffTypeId: timeOffType.id,
        allocated: 5,
        taken: 0,
        remaining: 5,
        validFrom: new Date("2025-01-01"),
        validTo: new Date("2025-12-31"),
        status: "ACTIVE",
      },
    });

    // Two separate requests, each for 3 days, against a 5-day balance — only one
    // can legally be approved. Fire both approvals concurrently.
    const [requestA, requestB] = await Promise.all([
      prisma.timeOffRequest.create({
        data: {
          employeeId,
          timeOffTypeId: timeOffType.id,
          startDate: new Date("2025-03-01"),
          endDate: new Date("2025-03-03"),
          duration: 3,
          status: "PENDING",
        },
      }),
      prisma.timeOffRequest.create({
        data: {
          employeeId,
          timeOffTypeId: timeOffType.id,
          startDate: new Date("2025-04-01"),
          endDate: new Date("2025-04-03"),
          duration: 3,
          status: "PENDING",
        },
      }),
    ]);

    const results = await Promise.allSettled([
      approve(requestA.id, "test-actor"),
      approve(requestB.id, "test-actor"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one of the two racing approvals may succeed — the other must be
    // rejected (either by the balance check or by serialization failure), never
    // both succeeding and never both failing.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const finalAllocation = await prisma.timeOffAllocation.findUnique({ where: { id: allocation.id } });
    expect(Number(finalAllocation.remaining)).toBe(2);
    expect(Number(finalAllocation.taken)).toBe(3);
    expect(Number(finalAllocation.remaining)).toBeGreaterThanOrEqual(0);
  });
});
