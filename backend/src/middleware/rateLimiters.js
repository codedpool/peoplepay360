const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redis } = require("../lib/redis");

function makeLimiter({ windowMs, max, prefix }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    }),
    message: { error: "Too many requests, please try again later" },
  });
}

// Tight limit on auth endpoints — the primary brute-force defense surface.
const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: "rl:auth:" });

module.exports = { authLimiter, makeLimiter };
