// zod object schemas strip unknown keys by default (unless .passthrough() is used),
// which is what closes the mass-assignment gap: a client can't smuggle a `role` or
// `wage` change into a payload the schema doesn't explicitly list.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
