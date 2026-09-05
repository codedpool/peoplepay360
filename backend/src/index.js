const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const { env } = require("./lib/env");
const { prisma } = require("./lib/prisma");
const { redis } = require("./lib/redis");
const authRoutes = require("./routes/auth.routes");
const employeeRoutes = require("./routes/employees.routes");
const contractRoutes = require("./routes/contracts.routes");
const scheduleRoutes = require("./routes/schedules.routes");
const timeOffTypeRoutes = require("./routes/timeOffTypes.routes");
const timeOffAllocationRoutes = require("./routes/timeOffAllocations.routes");
const timeOffRequestRoutes = require("./routes/timeOffRequests.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const userRoutes = require("./routes/users.routes");

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

// Centralized error handler — catches anything asyncHandler forwards via next(err)
// so an unexpected failure returns a clean 500 instead of crashing the process.
app.use((err, req, res, _next) => {
  req.log?.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`peoplepay360 backend listening on port ${env.port}`);
});
