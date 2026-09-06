const pinoHttp = require("pino-http");

// pino-http's default request serializer logs req.headers verbatim, which
// means the bearer access token and the refresh-token cookie were going into
// stdout in plaintext on every single authenticated request. Same story for
// Set-Cookie on the response side. These paths are redacted regardless of
// what's actually running the process (console, a file, a log shipper) —
// redaction has to happen before the line is written, not be a property of
// wherever it ends up.
//
// The req.body.* / newPassword paths are defensive: nothing currently wires
// request bodies into the access log, but if that's ever added (e.g. for
// debugging), a password or wage figure in a create/update payload must not
// suddenly start flowing into logs by default.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.newPassword",
  "req.body.passwordHash",
  "req.body.wage",
];

const httpLogger = pinoHttp({
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
});

module.exports = { httpLogger, REDACT_PATHS };
