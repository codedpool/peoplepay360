const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const { env } = require("./lib/env");
const { prisma } = require("./lib/prisma");
const { redis } = require("./lib/redis");
const authRoutes = require("./routes/auth.routes");

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

app.listen(env.port, () => {
  console.log(`peoplepay360 backend listening on port ${env.port}`);
});
