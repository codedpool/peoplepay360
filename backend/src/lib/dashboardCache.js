const { redis } = require("./redis");

const PREFIX = "dashboard:";
const DEFAULT_TTL_SECONDS = 60;

async function cached(key, compute, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const fullKey = `${PREFIX}${key}`;
  const hit = await redis.get(fullKey);
  if (hit) return JSON.parse(hit);

  const value = await compute();
  await redis.set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

// Every dashboard number is derived from Payrun/Payslip data, so any action
// that changes it (compute, validate, mark-paid, send-payslips) invalidates
// the whole namespace rather than trying to track which specific filtered
// cache keys are now stale — simple and correct beats precise and fragile
// for a dashboard refreshed on a ~1min cadence anyway.
async function invalidateDashboardCache() {
  const keys = await redis.keys(`${PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

module.exports = { cached, invalidateDashboardCache };
