// Role-level checks (rbac.js) only confirm what kind of user is asking. Anything
// scoped to a specific employee also needs this: does THIS user own THIS record.
// Usage: if (!assertOwnsOrElevated(req, res, employee.id)) return;
function assertOwnsOrElevated(req, res, resourceEmployeeId) {
  if (req.user.role !== "EMPLOYEE") {
    return true;
  }
  if (req.user.employeeId && req.user.employeeId === resourceEmployeeId) {
    return true;
  }
  res.status(403).json({ error: "You may only access your own records" });
  return false;
}

module.exports = { assertOwnsOrElevated };
