require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
  loginLockoutThreshold: Number(process.env.LOGIN_LOCKOUT_THRESHOLD ?? 5),
  loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15),
  // Single-tenant system — there's no Company model anywhere in the schema.
  // The dashboard mockup's Company filter has nothing real to filter by, so
  // this is just the display name; the "filter" is a no-op with one option.
  companyName: process.env.COMPANY_NAME ?? "OXP Pvt Ltd",
};

module.exports = { env };
