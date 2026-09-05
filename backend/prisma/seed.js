const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { deriveAttendanceFields } = require("../src/services/attendance");

const prisma = new PrismaClient();

async function main() {
  const schedule = await prisma.workingSchedule.create({
    data: {
      name: "Standard 9-5",
      type: "FULL_TIME",
      weeklyHours: 40,
      pattern: [
        { day: "MON", start: "09:00", end: "17:00", break: 60 },
        { day: "TUE", start: "09:00", end: "17:00", break: 60 },
        { day: "WED", start: "09:00", end: "17:00", break: 60 },
        { day: "THU", start: "09:00", end: "17:00", break: 60 },
        { day: "FRI", start: "09:00", end: "17:00", break: 60 },
      ],
    },
  });

  const structure = await prisma.salaryStructure.create({
    data: {
      name: "Standard Structure",
      active: true,
      rules: {
        create: [
          { name: "Basic", code: "BASIC", category: "BASIC", sequence: 1, computationMethod: "FIXED", formulaOrValue: "WAGE" },
          { name: "House Allowance", code: "HRA", category: "ALLOWANCE", sequence: 2, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * BASIC" },
          { name: "Gross", code: "GROSS", category: "GROSS", sequence: 3, computationMethod: "FORMULA", formulaOrValue: "BASIC + HRA" },
          { name: "Tax Deduction", code: "TAX", category: "DEDUCTION", sequence: 4, computationMethod: "PERCENTAGE", formulaOrValue: "0.10 * GROSS" },
          { name: "Net", code: "NET", category: "NET", sequence: 5, computationMethod: "FORMULA", formulaOrValue: "GROSS - TAX" },
        ],
      },
    },
  });

  const ENGINEERING = "Engineering";
  const HR_DEPT = "Human Resources";

  // Alice: two historical contracts — the scenario that proves period-based
  // contract resolution actually works, not just CRUD.
  const alice = await prisma.employee.create({
    data: { name: "Alice Johnson", department: ENGINEERING, jobPosition: "Software Engineer", scheduleId: schedule.id, status: "ACTIVE" },
  });
  await prisma.contract.create({
    data: { employeeId: alice.id, startDate: new Date("2024-01-01"), endDate: new Date("2024-12-31"), wage: 60000, salaryStructureId: structure.id, status: "EXPIRED" },
  });
  await prisma.contract.create({
    data: { employeeId: alice.id, startDate: new Date("2025-01-01"), endDate: null, wage: 72000, salaryStructureId: structure.id, status: "ACTIVE" },
  });

  const bob = await prisma.employee.create({
    data: { name: "Bob Martinez", department: ENGINEERING, jobPosition: "Engineering Manager", scheduleId: schedule.id, status: "ACTIVE" },
  });
  await prisma.contract.create({
    data: { employeeId: bob.id, startDate: new Date("2024-06-01"), endDate: null, wage: 95000, salaryStructureId: structure.id, status: "ACTIVE" },
  });

  const carla = await prisma.employee.create({
    data: { name: "Carla Nguyen", department: HR_DEPT, jobPosition: "HR Manager", scheduleId: schedule.id, status: "ACTIVE" },
  });
  await prisma.contract.create({
    data: { employeeId: carla.id, startDate: new Date("2023-03-01"), endDate: null, wage: 68000, salaryStructureId: structure.id, status: "ACTIVE" },
  });

  const dave = await prisma.employee.create({
    data: { name: "Dave Okafor", department: HR_DEPT, jobPosition: "Payroll Specialist", scheduleId: schedule.id, status: "ACTIVE" },
  });
  await prisma.contract.create({
    data: { employeeId: dave.id, startDate: new Date("2023-09-01"), endDate: null, wage: 62000, salaryStructureId: structure.id, status: "ACTIVE" },
  });

  // Attendance for the previous full calendar month. Payslips are prorated
  // against attendance now, so an empty attendances table computes every demo
  // payslip to zero — this is what gives a freshly-seeded payrun something to
  // actually pay. The four employees are deliberately varied so one payrun
  // shows the whole classification working:
  //
  //   Alice — every working day in full            -> paid a full month
  //   Bob   — three half-days and one open session -> paid slightly under
  //   Carla — one token 20-minute appearance       -> that day pays nothing
  //   Dave  — joined late, four days only          -> paid roughly a fifth
  //
  // Statuses and day fractions are derived through the same service the API
  // uses rather than written by hand, so seeded rows can't disagree with rows
  // the app creates.
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const workingDays = [];
  for (const d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6) workingDays.push(new Date(d));
  }

  // Local-time constructor on purpose: deriveStatus compares the check-in
  // against the schedule's start using the wall clock, so building these in
  // UTC would mark every seeded day LATE on any machine east of Greenwich.
  async function recordDay(employeeId, date, { in: inTime, out: outTime }) {
    const at = (time) => {
      if (!time) return null;
      const [h, m] = time.split(":").map(Number);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0);
    };
    const checkIn = at(inTime);
    const checkOut = at(outTime);

    await prisma.attendance.create({
      data: {
        employeeId,
        checkIn,
        checkOut,
        ...deriveAttendanceFields({ checkIn, checkOut, schedule }),
      },
    });
  }

  for (const [index, day] of workingDays.entries()) {
    const isLast = index === workingDays.length - 1;

    await recordDay(alice.id, day, { in: "09:00", out: "17:00" });

    // Bob: half-days on the 3rd, 8th and 13th working day, and he forgot to
    // check out on the last one — the MISSING_CHECKOUT exception HR reviews.
    if (isLast) {
      await recordDay(bob.id, day, { in: "09:00", out: null });
    } else if (index === 2 || index === 7 || index === 12) {
      await recordDay(bob.id, day, { in: "09:00", out: "13:00" });
    } else {
      await recordDay(bob.id, day, { in: "09:00", out: "17:00" });
    }

    // Carla: one 20-minute appearance that used to count as a full present day
    // and now correctly earns nothing.
    if (index === 5) {
      await recordDay(carla.id, day, { in: "09:00", out: "09:20" });
    } else {
      await recordDay(carla.id, day, { in: "09:00", out: "17:00" });
    }

    // Dave: only the first four working days of the month.
    if (index < 4) {
      await recordDay(dave.id, day, { in: "09:00", out: "17:00" });
    }
  }

  // Time Off Types: two allocation-backed leave types plus Leave Without Pay,
  // which doesn't draw against a balance (requiresAllocation: false) since
  // there's nothing to allocate — it's unpaid leave, approved directly.
  const casualLeave = await prisma.timeOffType.create({
    data: { name: "Casual Leave", unit: "DAYS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER" },
  });
  const sickLeave = await prisma.timeOffType.create({
    data: { name: "Sick Leave", unit: "DAYS", requiresAllocation: true, payrollIntegrated: false, approverRole: "HR_MANAGER" },
  });
  const leaveWithoutPay = await prisma.timeOffType.create({
    data: { name: "Leave Without Pay", unit: "DAYS", requiresAllocation: false, payrollIntegrated: true, approverRole: "HR_MANAGER" },
  });

  const YEAR_START = new Date("2025-01-01");
  const YEAR_END = new Date("2025-12-31");

  // Alice and Bob: fully active, approved allocations with some days already
  // taken — this is what the Employee self-service "Balances" view and the
  // HR/Admin Allocations list both read from (same endpoint, same data; there
  // is no separate store to fall out of sync).
  await prisma.timeOffAllocation.create({
    data: { employeeId: alice.id, timeOffTypeId: casualLeave.id, allocated: 12, taken: 3, remaining: 9, validFrom: YEAR_START, validTo: YEAR_END, status: "ACTIVE" },
  });
  await prisma.timeOffAllocation.create({
    data: { employeeId: alice.id, timeOffTypeId: sickLeave.id, allocated: 8, taken: 1, remaining: 7, validFrom: YEAR_START, validTo: YEAR_END, status: "ACTIVE" },
  });
  await prisma.timeOffAllocation.create({
    data: { employeeId: bob.id, timeOffTypeId: casualLeave.id, allocated: 12, taken: 0, remaining: 12, validFrom: YEAR_START, validTo: YEAR_END, status: "ACTIVE" },
  });
  await prisma.timeOffAllocation.create({
    data: { employeeId: bob.id, timeOffTypeId: sickLeave.id, allocated: 8, taken: 2, remaining: 6, validFrom: YEAR_START, validTo: YEAR_END, status: "ACTIVE" },
  });

  // Dave: one allocation still PENDING HR approval — demonstrates the
  // two-stage allocation lifecycle (grant -> approve) live in the seed data,
  // not just in a test.
  await prisma.timeOffAllocation.create({
    data: { employeeId: dave.id, timeOffTypeId: casualLeave.id, allocated: 12, taken: 0, remaining: 12, validFrom: YEAR_START, validTo: YEAR_END, status: "PENDING" },
  });

  // Alice: one PENDING request against her approved Casual Leave balance —
  // gives HR something real to approve/refuse on first login, and gives the
  // demo an "approve it and watch the balance move" moment.
  await prisma.timeOffRequest.create({
    data: { employeeId: alice.id, timeOffTypeId: casualLeave.id, startDate: new Date("2025-11-10"), endDate: new Date("2025-11-11"), duration: 2, status: "PENDING" },
  });

  // Demo password sourced from env, never hardcoded — printed once so it can be used to log in.
  const demoPassword = process.env.SEED_DEMO_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  const users = [
    { email: "alice@peoplepay360.dev", roles: ["EMPLOYEE"], employeeId: alice.id },
    { email: "bob@peoplepay360.dev", roles: ["EMPLOYEE"], employeeId: bob.id },
    { email: "carla.hrmanager@peoplepay360.dev", roles: ["HR_MANAGER"], employeeId: carla.id },
    // Demonstrates multi-role support: a payroll user who is also that employee's manager.
    { email: "dave.payrolluser@peoplepay360.dev", roles: ["HR_PAYROLL_USER", "HR_MANAGER"], employeeId: dave.id },
    { email: "payroll.manager@peoplepay360.dev", roles: ["HR_PAYROLL_MANAGER"], employeeId: null },
    { email: "admin@peoplepay360.dev", roles: ["ADMIN"], employeeId: null },
  ];

  for (const u of users) {
    await prisma.user.create({ data: { email: u.email, passwordHash, roles: u.roles, employeeId: u.employeeId } });
  }

  console.log("Seed complete.");
  console.log(`Demo password for all seeded users: ${demoPassword}`);
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
