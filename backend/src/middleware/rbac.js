// Permission matrix backing Section 4 of plan.md. Routes in later phases call
// requirePermission("resource:action") rather than checking req.user.role directly,
// so the grants live in one place instead of scattered per-route `if` checks.
const BASE_PERMISSIONS = {
  EMPLOYEE: [
    "employee:read:own",
    "attendance:read:own",
    "attendance:write:own",
    "timeoff:read:own",
    "timeoff:write:own",
  ],
  HR_MANAGER: [
    "employee:read",
    "employee:write",
    "contract:read",
    "contract:write",
    "schedule:read",
    "schedule:write",
    "attendance:read",
    "attendance:write",
    "attendance:correct",
    "timeoff:read",
    "timeoff:write",
    "timeoff:approve",
  ],
  HR_PAYROLL_USER: [
    "payrun:read",
    "payrun:write",
    "payslip:read",
    "payslip:write",
    "salarystructure:read",
    "salaryrule:read",
    "dashboard:read",
  ],
  HR_PAYROLL_MANAGER: [
    "employee:read",
    "contract:read",
    "payrun:read",
    "payrun:write",
    "payslip:read",
    "payslip:write",
    "salarystructure:read",
    "salarystructure:write",
    "salaryrule:read",
    "salaryrule:write",
    "dashboard:read",
  ],
  ADMIN: ["*"],
};

// HR Payroll User = "HR Manager permissions + payroll access" per Section 4.
const PERMISSIONS = {
  ...BASE_PERMISSIONS,
  HR_PAYROLL_USER: [
    ...new Set([...BASE_PERMISSIONS.HR_MANAGER, ...BASE_PERMISSIONS.HR_PAYROLL_USER]),
  ],
};

// A user can hold multiple roles (mockup: "assign one or more roles") — grant
// the permission if ANY of their roles carries it.
function hasPermission(roles, permission) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.some((role) => {
    const granted = PERMISSIONS[role];
    return granted && (granted.includes("*") || granted.includes(permission));
  });
}

function isElevated(roles) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.some((role) => role !== "EMPLOYEE");
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!hasPermission(req.user.roles, permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { PERMISSIONS, hasPermission, isElevated, requirePermission };
