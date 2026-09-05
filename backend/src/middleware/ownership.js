const { isElevated } = require("./rbac");

// Role-level checks (rbac.js) only confirm what kind of user is asking. Anything
// scoped to a specific employee also needs this: does THIS user own THIS record.
// A user holding any role beyond plain EMPLOYEE bypasses the ownership check.
// Usage: if (!assertOwnsOrElevated(req, res, employee.id)) return;
function assertOwnsOrElevated(req, res, resourceEmployeeId) {
  if (isElevated(req.user.roles)) {
    return true;
  }
  if (req.user.employeeId && req.user.employeeId === resourceEmployeeId) {
    return true;
  }
  res.status(403).json({ error: "You may only access your own records" });
  return false;
}

module.exports = { assertOwnsOrElevated };
