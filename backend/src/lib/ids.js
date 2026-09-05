// Ids are Int primary keys (autoincrement), but they arrive from the wire as
// strings — in `req.params` (always), in `req.query`, and in JWT claims that
// were serialised to JSON. Prisma rejects a string where an Int is expected,
// so every id crossing that boundary goes through here rather than each route
// hand-rolling its own parseInt and inventing its own behaviour on garbage.
//
// Returns null for anything that isn't a positive whole number, which lets a
// route answer 404 for `/api/employees/abc` instead of throwing a 500 out of
// the query layer.
function toId(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  if (!/^[0-9]+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// For optional/nullable foreign keys: preserves an explicit null (used to
// clear a relation) while still rejecting malformed values.
function toOptionalId(value) {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  return toId(value);
}

// Rejects a malformed :id once, at the edge, instead of letting `null` reach
// Prisma and surface as a 500 from the query layer. Mounted per-router via
// router.param, so `/api/employees/abc` answers 404 the same way a well-formed
// id that matches nothing does — a bad id is a resource that doesn't exist,
// not a server fault. `jobId` is deliberately not covered: BullMQ job ids are
// strings.
function validateIdParam(req, res, next, value) {
  if (toId(value) === null) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}

module.exports = { toId, toOptionalId, validateIdParam };
