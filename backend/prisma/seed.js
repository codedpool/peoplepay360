const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { deriveAttendanceFields } = require("../src/services/attendance");
const { computePayslipLines } = require("../src/services/ruleEngine");
const {
  computeWorkedDays,
  countScheduledWorkingDays,
  computeWorkedRatio,
} = require("../src/services/workedDays");

const prisma = new PrismaClient();

// Deterministic PRNG. A demo that reseeds should look the same every time —
// with Math.random the headcount chart and every table would reshuffle between
// runs, and a bug seen once could not be reproduced.
let seedState = 20260906;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function randInt(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of pairs) {
    if ((r -= w) <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

const FIRST = [
  "Aarav", "Ananya", "Rohan", "Priya", "Vikram", "Sneha", "Arjun", "Kavya", "Rahul", "Meera",
  "Karan", "Divya", "Aditya", "Ishita", "Siddharth", "Neha", "Manish", "Pooja", "Nikhil", "Anjali",
  "Varun", "Riya", "Amit", "Shreya", "Rajesh", "Tanvi", "Sanjay", "Aditi", "Harsh", "Nandini",
  "Kunal", "Swati", "Gaurav", "Lakshmi", "Deepak", "Ritika", "Abhishek", "Sakshi", "Vivek", "Payal",
];
const LAST = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Singh", "Gupta", "Mehta", "Joshi",
  "Kulkarni", "Desai", "Chopra", "Malhotra", "Rao", "Bose", "Banerjee", "Kapoor", "Shah", "Pillai",
];

// Department -> the job titles that actually exist in it, so an "HR Generalist"
// never turns up inside Engineering.
const DEPARTMENTS = [
  { name: "Engineering", positions: ["Software Engineer", "Senior Software Engineer", "QA Engineer", "Engineering Manager", "DevOps Engineer"], weight: 34 },
  { name: "Human Resources", positions: ["HR Generalist", "HR Manager", "Recruiter", "Payroll Specialist"], weight: 12 },
  { name: "Finance", positions: ["Accountant", "Financial Analyst", "Finance Manager"], weight: 12 },
  { name: "Sales", positions: ["Sales Executive", "Account Manager", "Sales Manager"], weight: 20 },
  { name: "Operations", positions: ["Operations Executive", "Operations Manager", "Logistics Coordinator"], weight: 14 },
  { name: "Marketing", positions: ["Marketing Executive", "Content Strategist", "Marketing Manager"], weight: 8 },
];

// Wage bands per position keep the salary-cost-by-department chart believable
// instead of every employee earning a random number.
//
// These are MONTHLY figures, because Contract.wage is a monthly wage — the
// form labels it "Wage / month" and the rule engine pays it out once per
// payrun month. Seeding annual figures here (as this once did) paid every
// employee their whole year's salary every month and inflated payroll ~12x.
function wageFor(position) {
  if (/Manager|Lead/.test(position)) return randInt(80000, 120000);
  if (/Senior/.test(position)) return randInt(65000, 92000);
  if (/Analyst|Specialist|Strategist|Engineer|Accountant/.test(position)) return randInt(45000, 70000);
  return randInt(28000, 50000);
}

function addDays(d, n) {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function isWeekend(d) {
  const g = d.getUTCDay();
  return g === 0 || g === 6;
}

// Everything dated in this seed is anchored to the day it runs, never to a
// fixed calendar date. A hardcoded 2026 window drifts out from under the app:
// attendance and payroll end up in different months, and the dashboard's
// current period reads as empty even though the database is full.
const TODAY = new Date();
const THIS_MONTH = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1));

// offset 0 = the month the seed runs in, -1 = last month, and so on.
function monthStart(offset) {
  return new Date(Date.UTC(THIS_MONTH.getUTCFullYear(), THIS_MONTH.getUTCMonth() + offset, 1));
}
function monthEnd(offset) {
  return new Date(Date.UTC(THIS_MONTH.getUTCFullYear(), THIS_MONTH.getUTCMonth() + offset + 1, 0));
}
function monthName(offset) {
  return monthStart(offset).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
// How many payroll months of history the demo carries. Attendance is seeded
// across exactly this same window so every period has both.
const HISTORY_MONTHS = 3;

async function main() {
  console.log("Clearing existing data…");
  // Child-to-parent order: every FK is removed before the row it points at, so
  // nothing relies on cascade behaviour that may differ per relation.
  await prisma.payslipLine.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrun.deleteMany();
  await prisma.timeOffRequest.deleteMany();
  await prisma.timeOffAllocation.deleteMany();
  await prisma.timeOffType.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.salaryRule.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.passwordResetRequest.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.workingSchedule.deleteMany();

  // ---------------------------------------------------------------- schedules
  // Every ScheduleType is represented, so the Employee Type filter has real
  // data behind each of its options.
  console.log("Seeding working schedules…");
  const fullTime = await prisma.workingSchedule.create({
    data: {
      name: "Standard 9-5", type: "FULL_TIME", weeklyHours: 40,
      pattern: ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, start: "09:00", end: "17:00", break: 60 })),
    },
  });
  const partTime = await prisma.workingSchedule.create({
    data: {
      name: "Part Time 9-1", type: "PART_TIME", weeklyHours: 20,
      pattern: ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, start: "09:00", end: "13:00", break: 0 })),
    },
  });
  const nightShift = await prisma.workingSchedule.create({
    data: {
      name: "Night Shift 22-6", type: "SHIFT", weeklyHours: 40,
      pattern: ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, start: "22:00", end: "06:00", break: 60 })),
    },
  });
  const scheduleList = [fullTime, partTime, nightShift];

  // ------------------------------------------------------- salary structures
  console.log("Seeding salary structures…");
  // Sequence matters: each rule may only reference codes defined before it
  // (Golden Rule #2). BASIC -> allowances -> GROSS -> deductions -> NET.
  const standard = await prisma.salaryStructure.create({
    data: {
      name: "Standard Structure", active: true,
      rules: {
        create: [
          { name: "Basic", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "House Rent Allowance", code: "HRA", category: "ALLOWANCE", sequence: 2, computationMethod: "PERCENTAGE", formulaOrValue: "0.20 * BASIC" },
          { name: "Transport Allowance", code: "TA", category: "ALLOWANCE", sequence: 3, computationMethod: "FIXED", formulaOrValue: "19200" },
          { name: "Gross", code: "GROSS", category: "GROSS", sequence: 4, computationMethod: "FORMULA", formulaOrValue: "BASIC + HRA + TA" },
          { name: "Provident Fund", code: "PF", category: "DEDUCTION", sequence: 5, computationMethod: "PERCENTAGE", formulaOrValue: "0.12 * BASIC" },
          { name: "Professional Tax", code: "PT", category: "DEDUCTION", sequence: 6, computationMethod: "FIXED", formulaOrValue: "2400" },
          { name: "Income Tax", code: "TDS", category: "DEDUCTION", sequence: 7, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * GROSS" },
          { name: "Net", code: "NET", category: "NET", sequence: 8, computationMethod: "FORMULA", formulaOrValue: "GROSS - PF - PT - TDS" },
        ],
      },
    },
    include: { rules: true },
  });
  const executive = await prisma.salaryStructure.create({
    data: {
      name: "Executive Structure", active: true,
      rules: {
        create: [
          { name: "Basic", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "House Rent Allowance", code: "HRA", category: "ALLOWANCE", sequence: 2, computationMethod: "PERCENTAGE", formulaOrValue: "0.30 * BASIC" },
          { name: "Performance Bonus", code: "BONUS", category: "ALLOWANCE", sequence: 3, computationMethod: "PERCENTAGE", formulaOrValue: "0.15 * BASIC" },
          { name: "Gross", code: "GROSS", category: "GROSS", sequence: 4, computationMethod: "FORMULA", formulaOrValue: "BASIC + HRA + BONUS" },
          { name: "Provident Fund", code: "PF", category: "DEDUCTION", sequence: 5, computationMethod: "PERCENTAGE", formulaOrValue: "0.12 * BASIC" },
          { name: "Income Tax", code: "TDS", category: "DEDUCTION", sequence: 6, computationMethod: "PERCENTAGE", formulaOrValue: "0.20 * GROSS" },
          { name: "Net", code: "NET", category: "NET", sequence: 7, computationMethod: "FORMULA", formulaOrValue: "GROSS - PF - TDS" },
        ],
      },
    },
    include: { rules: true },
  });
  // An inactive structure exists so the "active" filter has something to exclude.
  await prisma.salaryStructure.create({
    data: {
      name: "Intern Stipend (retired)", active: false,
      rules: {
        create: [
          { name: "Stipend", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "Net", code: "NET", category: "NET", sequence: 2, computationMethod: "FORMULA", formulaOrValue: "BASIC" },
        ],
      },
    },
  });

  // ---------------------------------------------------------------- employees
  console.log("Seeding 100 employees…");
  const usedNames = new Set();
  const employees = [];
  for (let i = 0; i < 100; i++) {
    let name;
    do {
      name = `${pick(FIRST)} ${pick(LAST)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const dept = weighted(DEPARTMENTS.map((d) => [d, d.weight]));
    const position = pick(dept.positions);
    // A handful of PART_TIME/SHIFT people so those filters are not empty.
    const schedule = weighted([[fullTime, 78], [partTime, 12], [nightShift, 10]]);
    // ~8% inactive, covering the other EmployeeStatus value.
    const status = weighted([["ACTIVE", 92], ["INACTIVE", 8]]);

    employees.push(
      await prisma.employee.create({
        data: {
          name, department: dept.name, jobPosition: position,
          scheduleId: schedule.id, status,
          // Deliberately not universal: the payrun validation check for
          // missing bank details needs employees that genuinely fail it.
          bankAccountOnFile: rand() > 0.12,
        },
      })
    );
  }

  // Managers: one per department, reporting lines assigned within the department.
  console.log("Assigning reporting lines…");
  for (const dept of DEPARTMENTS) {
    const inDept = employees.filter((e) => e.department === dept.name);
    if (inDept.length < 2) continue;
    const manager = inDept.find((e) => /Manager/.test(e.jobPosition)) ?? inDept[0];
    for (const e of inDept) {
      if (e.id === manager.id) continue;
      await prisma.employee.update({ where: { id: e.id }, data: { managerId: manager.id } });
    }
  }

  // ---------------------------------------------------------------- contracts
  console.log("Seeding contracts…");
  // Golden Rule #1: at most one ACTIVE contract per employee, non-overlapping.
  // The DB enforces it with an exclusion constraint, so any overlap here would
  // abort the seed rather than pass silently.
  const contracts = [];
  for (const e of employees) {
    const isExec = /Manager/.test(e.jobPosition);
    const structure = isExec ? executive : standard;
    const wage = wageFor(e.jobPosition);

    // ~30% have a prior EXPIRED contract — the history that makes period-based
    // contract resolution demonstrable rather than theoretical.
    if (rand() < 0.3) {
      await prisma.contract.create({
        data: {
          employeeId: e.id,
          startDate: monthStart(-42 + randInt(0, 5)),
          endDate: monthEnd(-22),
          wage: Math.round(wage * 0.88),
          salaryStructureId: structure.id,
          status: "EXPIRED",
        },
      });
    }

    if (e.status === "INACTIVE") {
      // A departed employee's contract is EXPIRED, not ACTIVE.
      contracts.push(
        await prisma.contract.create({
          data: {
            employeeId: e.id, startDate: monthStart(-20),
            endDate: monthEnd(-randInt(4, 9)),
            wage, salaryStructureId: structure.id, status: "EXPIRED",
          },
        })
      );
      continue;
    }

    // A few live contracts run out in the next couple of months, which is what
    // the dashboard's "contracts expiring" alert and the payrun warnings read.
    const expiresSoon = rand() < 0.05;
    contracts.push(
      await prisma.contract.create({
        data: {
          employeeId: e.id,
          startDate: monthStart(-20),
          endDate: expiresSoon ? monthEnd(randInt(0, 1)) : null,
          wage, salaryStructureId: structure.id, status: "ACTIVE",
        },
      })
    );
  }
  // DRAFT and CANCELLED contracts so every ContractStatus is represented.
  // Both are non-ACTIVE, so the exclusion constraint permits them alongside
  // the employee's live contract.
  for (const e of employees.slice(0, 6)) {
    await prisma.contract.create({
      data: {
        employeeId: e.id, startDate: monthStart(4), endDate: null,
        wage: wageFor(e.jobPosition), salaryStructureId: standard.id, status: "DRAFT",
      },
    });
  }
  for (const e of employees.slice(6, 11)) {
    await prisma.contract.create({
      data: {
        employeeId: e.id, startDate: monthStart(-26), endDate: monthEnd(-24),
        wage: wageFor(e.jobPosition), salaryStructureId: standard.id, status: "CANCELLED",
      },
    });
  }

  // ------------------------------------------------------------------ time off
  console.log("Seeding time off types, allocations and requests…");
  const casual = await prisma.timeOffType.create({
    data: { name: "Casual Leave", unit: "DAYS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER", displayColor: "#3b82f6" },
  });
  const sick = await prisma.timeOffType.create({
    data: { name: "Sick Leave", unit: "DAYS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER", displayColor: "#ef4444" },
  });
  const earned = await prisma.timeOffType.create({
    data: { name: "Earned Leave", unit: "DAYS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER", displayColor: "#22c55e" },
  });
  // HOURS unit, so that TimeOffUnit's other value is exercised.
  const comp = await prisma.timeOffType.create({
    data: { name: "Compensatory Off", unit: "HOURS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER", displayColor: "#a855f7" },
  });
  // Unpaid leave draws no balance and does hit payroll.
  const lwp = await prisma.timeOffType.create({
    data: { name: "Leave Without Pay", unit: "DAYS", requiresAllocation: false, payrollIntegrated: true, approverRole: "HR_MANAGER", displayColor: "#6b7280" },
  });
  const allocTypes = [casual, sick, earned, comp];

  const YEAR_START = new Date(Date.UTC(TODAY.getUTCFullYear(), 0, 1));
  const YEAR_END = new Date(Date.UTC(TODAY.getUTCFullYear(), 11, 31));
  const activeEmployees = employees.filter((e) => e.status === "ACTIVE");

  const allocations = [];
  for (const e of activeEmployees) {
    for (const type of allocTypes) {
      // Not everyone gets every type — Comp Off is earned, not granted.
      if (type.id === comp.id && rand() < 0.6) continue;
      const allocated = type.unit === "HOURS" ? randInt(8, 24) : type.id === earned.id ? randInt(15, 24) : randInt(8, 12);
      const taken = randInt(0, Math.floor(allocated / 2));
      // Most allocations are ACTIVE; a few sit PENDING approval, and a couple
      // are REFUSED/EXPIRED so every AllocationStatus appears somewhere.
      const status = weighted([["ACTIVE", 86], ["PENDING", 9], ["REFUSED", 3], ["EXPIRED", 2]]);
      allocations.push(
        await prisma.timeOffAllocation.create({
          data: {
            employeeId: e.id, timeOffTypeId: type.id,
            allocated, taken: status === "ACTIVE" ? taken : 0,
            remaining: status === "ACTIVE" ? allocated - taken : allocated,
            validFrom: YEAR_START, validTo: YEAR_END, status,
          },
        })
      );
    }
  }

  // Requests across every TimeOffRequestStatus, including a few APPROVED ones
  // flagged for cancellation so HR's queue is not empty on first login.
  let cancellationRequests = 0;
  for (const e of activeEmployees) {
    const howMany = randInt(0, 3);
    for (let i = 0; i < howMany; i++) {
      const useLwp = rand() < 0.15;
      const type = useLwp ? lwp : pick(allocTypes);
      const activeAlloc = allocations.find(
        (a) => a.employeeId === e.id && a.timeOffTypeId === type.id && a.status === "ACTIVE"
      );
      if (!useLwp && !activeAlloc) continue;
      // A real submission is now rejected outright once it exceeds the
      // allocation's remaining balance (see timeOffRequests.routes.js) — the
      // seed must respect the same rule, or every reseed reproduces exactly
      // the "approved/pending request nobody could have actually filed" data
      // integrity issue that rule exists to prevent.
      if (!useLwp && Number(activeAlloc.remaining) <= 0) continue;

      // Spread across the year so far, ending near today rather than at a
      // fixed month.
      const start = new Date(Date.UTC(TODAY.getUTCFullYear(), randInt(0, TODAY.getUTCMonth()), randInt(1, 26)));
      const span = randInt(0, 3);
      const end = addDays(start, span);
      const rawDuration = type.unit === "HOURS" ? (span + 1) * 8 : span + 1;
      // Capped to what the allocation actually has, same as the API's own
      // duration-ceiling and balance checks would enforce on a real submission.
      const duration = useLwp ? rawDuration : Math.min(rawDuration, Number(activeAlloc.remaining));
      const status = weighted([["APPROVED", 50], ["PENDING", 30], ["REFUSED", 10], ["CANCELLED", 10]]);

      // Only an APPROVED request holds an allocation link — that is what a
      // later cancellation restores the balance against.
      const approvedAgainst = status === "APPROVED" && !useLwp ? activeAlloc : null;
      // A few approved leaves carry an employee's pending "please cancel this"
      // ask, which is the queue HR works from.
      const wantsCancel = status === "APPROVED" && rand() < 0.12;
      if (wantsCancel) cancellationRequests++;

      await prisma.timeOffRequest.create({
        data: {
          employeeId: e.id, timeOffTypeId: type.id,
          startDate: start, endDate: end, duration,
          status,
          allocationId: approvedAgainst ? approvedAgainst.id : null,
          cancellationRequested: wantsCancel,
          cancellationReason: wantsCancel ? "Plans changed — I no longer need these days off." : null,
          cancellationRequestedAt: wantsCancel ? addDays(TODAY, -randInt(1, 10)) : null,
        },
      });
    }
  }

  // -------------------------------------------------------------- attendance
  console.log("Seeding attendance…");
  // Two full working weeks of history. Statuses are derived by the real
  // service, never hardcoded — so the seeded data obeys exactly the same
  // full/half/absent bands the app applies to a live check-in.
  const attendanceRows = [];
  const scheduleById = Object.fromEntries(scheduleList.map((s) => [s.id, s]));
  // Covers every payroll month below plus the current month to date, so a
  // payslip's worked days come from real attendance and the dashboard shows
  // attendance and payroll for the same period.
  const firstDay = monthStart(-HISTORY_MONTHS);
  const lastDay = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate()));
  for (let current = firstDay; current <= lastDay; current = addDays(current, 1)) {
    if (isWeekend(current)) continue;
    for (const e of activeEmployees) {
      if (rand() < 0.06) continue; // no record at all — on leave or holiday

      const schedule = scheduleById[e.scheduleId];
      const startHour = schedule.type === "SHIFT" ? 22 : 9;
      const scheduledHours = Number(schedule.weeklyHours) / 5;

      // Most days are ordinary; the rest deliberately land in each band so
      // every AttendanceStatus shows up in the table.
      const flavour = weighted([
        ["normal", 68], ["late", 12], ["overtime", 9], ["half", 6], ["short", 3], ["open", 2],
      ]);

      // Built in LOCAL time, not UTC. deriveStatus() compares checkIn against
      // the schedule using local getHours(), so a UTC-constructed 09:00 reads
      // as 14:30 on a UTC+5:30 machine and every single row comes back LATE.
      const checkIn = new Date(
        current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(),
        startHour, randInt(0, 8), 0, 0
      );
      if (flavour === "late") checkIn.setMinutes(checkIn.getMinutes() + randInt(25, 70));

      let checkOut = null;
      if (flavour !== "open") {
        const worked =
          flavour === "overtime" ? scheduledHours + 1 + rand() * 2
          : flavour === "half" ? scheduledHours * 0.6
          : flavour === "short" ? scheduledHours * 0.3
          : scheduledHours + rand() * 0.2;
        checkOut = new Date(checkIn.getTime() + worked * 3600 * 1000);
      }

      const derived = deriveAttendanceFields({ checkIn, checkOut, schedule });
      attendanceRows.push({
        employeeId: e.id, checkIn, checkOut,
        workedHours: derived.workedHours, overtimeHours: derived.overtimeHours,
        dayFraction: derived.dayFraction, status: derived.status,
      });
    }
  }
  // createMany in chunks — ~1,200 rows one-by-one is needlessly slow.
  for (let i = 0; i < attendanceRows.length; i += 500) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(i, i + 500) });
  }

  // ------------------------------------------------------------------ payroll
  console.log("Seeding payruns and payslips…");
  // Three historical months, each fully computed through the real rule engine
  // so every payslip's lines agree with what a recompute would produce.
  // The three months before the current one, oldest first: fully sent, paid,
  // and computed-but-not-yet-paid, so the payrun list shows a realistic
  // lifecycle ending at a month that still needs work.
  const periods = [
    { name: `${monthName(-3)} Payroll`, start: monthStart(-3), end: monthEnd(-3), status: "SENT" },
    { name: `${monthName(-2)} Payroll`, start: monthStart(-2), end: monthEnd(-2), status: "PAID" },
    { name: `${monthName(-1)} Payroll`, start: monthStart(-1), end: monthEnd(-1), status: "COMPUTED" },
  ];

  const structuresById = { [standard.id]: standard, [executive.id]: executive };
  const employeeById = Object.fromEntries(employees.map((e) => [e.id, e]));
  for (const p of periods) {
    const payrun = await prisma.payrun.create({
      data: { name: p.name, salaryStructureId: standard.id, periodStart: p.start, periodEnd: p.end, status: p.status },
    });

    for (const contract of contracts) {
      if (contract.status !== "ACTIVE") continue;
      const structure = structuresById[contract.salaryStructureId];
      if (!structure) continue;

      // Worked days and the proration factor are read back out of the
      // attendance seeded above using the same services the payrun compute
      // job runs, rather than being invented here — so a seeded payslip is
      // byte-for-byte what recomputing that payrun would produce.
      const employee = employeeById[contract.employeeId];
      const schedule = employee ? scheduleById[employee.scheduleId] : null;
      const workedDays = await computeWorkedDays(contract.employeeId, p.start, p.end);
      const periodDays = countScheduledWorkingDays(schedule, p.start, p.end);
      const workedRatio = computeWorkedRatio(workedDays, periodDays);

      const lines = computePayslipLines({
        contract,
        rules: structure.rules,
        workedRatio,
        workedDays,
        periodDays,
      });
      // Payslip status tracks its parent payrun: a SENT payrun's payslips are
      // SENT, which is what the payslip list's status column reflects.
      const payslipStatus = p.status === "SENT" ? "SENT" : p.status === "PAID" ? "PAID" : "COMPUTED";

      await prisma.payslip.create({
        data: {
          payrunId: payrun.id, employeeId: contract.employeeId, contractId: contract.id,
          status: payslipStatus, workedDays,
          lines: { create: lines.map((l) => ({ salaryRuleId: l.salaryRuleId, amount: l.amount })) },
        },
      });
    }
  }
  // A DRAFT payrun with no payslips yet — the starting point of the demo's
  // Compute -> Validate -> Mark Paid -> Send walkthrough.
  await prisma.payrun.create({
    data: {
      name: `${monthName(0)} Payroll`, salaryStructureId: standard.id,
      periodStart: monthStart(0), periodEnd: monthEnd(0), status: "DRAFT",
    },
  });

  // --------------------------------------------------------------------- users
  console.log("Seeding users…");
  const demoPassword = process.env.SEED_DEMO_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  // Named accounts first, so the demo logins are stable and memorable.
  const hrManager = activeEmployees.find((e) => e.jobPosition === "HR Manager") ?? activeEmployees[0];
  const payrollSpecialist = activeEmployees.find((e) => e.jobPosition === "Payroll Specialist") ?? activeEmployees[1];
  const engineer = activeEmployees.find((e) => e.jobPosition === "Software Engineer") ?? activeEmployees[2];

  const named = [
    { email: "admin@peoplepay360.dev", roles: ["ADMIN"], employeeId: null },
    { email: "payroll.manager@peoplepay360.dev", roles: ["HR_PAYROLL_MANAGER"], employeeId: null },
    { email: "hr.manager@peoplepay360.dev", roles: ["HR_MANAGER"], employeeId: hrManager.id },
    // Multi-role: a payroll user who also approves leave for their team.
    { email: "payroll.user@peoplepay360.dev", roles: ["HR_PAYROLL_USER", "HR_MANAGER"], employeeId: payrollSpecialist.id },
    { email: "employee@peoplepay360.dev", roles: ["EMPLOYEE"], employeeId: engineer.id },
  ];
  const takenEmployeeIds = new Set(named.map((u) => u.employeeId).filter(Boolean));
  for (const u of named) {
    await prisma.user.create({ data: { email: u.email, passwordHash, roles: u.roles, employeeId: u.employeeId } });
  }

  // Logins for the rest of the workforce, so "every employee can sign in" is
  // demonstrably true rather than true only for the five demo accounts.
  const usedEmails = new Set(named.map((u) => u.email));
  for (const e of activeEmployees) {
    if (takenEmployeeIds.has(e.id)) continue;
    const base = e.name.toLowerCase().replace(/[^a-z]+/g, ".");
    let email = `${base}@peoplepay360.dev`;
    let n = 2;
    while (usedEmails.has(email)) email = `${base}${n++}@peoplepay360.dev`;
    usedEmails.add(email);
    await prisma.user.create({
      data: {
        email, passwordHash, roles: ["EMPLOYEE"], employeeId: e.id,
        // A slice of the workforce still has to set their own password on
        // first login, exercising the forced-change flow.
        mustChangePassword: rand() < 0.1,
      },
    });
  }

  // ------------------------------------------------- password reset requests
  // Covers every PasswordResetRequestStatus so the HR queue shows all three.
  const resetCandidates = activeEmployees.slice(0, 6);
  const resetStatuses = ["PENDING", "PENDING", "PENDING", "COMPLETED", "COMPLETED", "REJECTED"];
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@peoplepay360.dev" } });
  for (let i = 0; i < resetCandidates.length; i++) {
    const u = await prisma.user.findFirst({ where: { employeeId: resetCandidates[i].id } });
    if (!u) continue;
    const status = resetStatuses[i];
    await prisma.passwordResetRequest.create({
      data: {
        email: u.email, userId: u.id,
        note: status === "PENDING" ? "Locked out after changing my phone." : "Handled over the phone.",
        status,
        resolvedById: status === "PENDING" ? null : adminUser.id,
        resolvedAt: status === "PENDING" ? null : addDays(TODAY, -randInt(1, 6)),
      },
    });
  }

  const counts = {
    employees: await prisma.employee.count(),
    users: await prisma.user.count(),
    contracts: await prisma.contract.count(),
    attendance: await prisma.attendance.count(),
    timeOffTypes: await prisma.timeOffType.count(),
    allocations: await prisma.timeOffAllocation.count(),
    requests: await prisma.timeOffRequest.count(),
    salaryStructures: await prisma.salaryStructure.count(),
    salaryRules: await prisma.salaryRule.count(),
    payruns: await prisma.payrun.count(),
    payslips: await prisma.payslip.count(),
    payslipLines: await prisma.payslipLine.count(),
    passwordResetRequests: await prisma.passwordResetRequest.count(),
  };
  console.log("\nSeed complete.");
  console.table(counts);
  console.log(`Pending leave-cancellation requests awaiting HR: ${cancellationRequests}`);
  console.log(`\nDemo password for all seeded users: ${demoPassword}`);
  console.log("Logins: admin@ / payroll.manager@ / hr.manager@ / payroll.user@ / employee@peoplepay360.dev");
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.log("Set SEED_DEMO_PASSWORD in your env to pin this across reseeds.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
