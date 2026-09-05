const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");
const { env } = require("./lib/env");
const { prisma } = require("./lib/prisma");
const { redis } = require("./lib/redis");
const { openapiSpec } = require("./docs/openapi");
const authRoutes = require("./routes/auth.routes");
const employeeRoutes = require("./routes/employees.routes");
const contractRoutes = require("./routes/contracts.routes");
const scheduleRoutes = require("./routes/schedules.routes");
const timeOffTypeRoutes = require("./routes/timeOffTypes.routes");
const timeOffAllocationRoutes = require("./routes/timeOffAllocations.routes");
const timeOffRequestRoutes = require("./routes/timeOffRequests.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const userRoutes = require("./routes/users.routes");
const salaryStructureRoutes = require("./routes/salaryStructures.routes");
const salaryRuleRoutes = require("./routes/salaryRules.routes");
const payrunRoutes = require("./routes/payruns.routes");
const payslipRoutes = require("./routes/payslips.routes");
const dashboardRoutes = require("./routes/dashboard.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(pinoHttp());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "degraded" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/timeoff-types", timeOffTypeRoutes);
app.use("/api/timeoff-allocations", timeOffAllocationRoutes);
app.use("/api/timeoff-requests", timeOffRequestRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/salary-structures", salaryStructureRoutes);
app.use("/api/salary-structures/:structureId/rules", salaryRuleRoutes);
app.use("/api/payruns", payrunRoutes);
app.use("/api/payslips", payslipRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Swagger UI at /api-docs — the global helmet() CSP above blocks its inline
// script (script-src 'self', no 'unsafe-inline'). helmet has no per-path
// "unset" for an already-applied header, so it's removed explicitly here,
// scoped to this one path; every real /api/* route above keeps the strict
// default CSP untouched.
app.use(
  "/api-docs",
  (_req, res, next) => {
    res.removeHeader("Content-Security-Policy");
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec)
);

// Centralized error handler — catches anything asyncHandler forwards via next(err)
// so an unexpected failure returns a clean 500 instead of crashing the process.
app.use((err, req, res, _next) => {
  req.log?.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`peoplepay360 backend listening on port ${env.port}`);
});
