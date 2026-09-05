// Mirrors backend/src/middleware/rbac.js exactly. This copy only decides what
// the UI renders (nav items, buttons) — the API enforces the real boundary on
// every request regardless of what this says, so drift here is a UX bug, not
// a security hole.
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
  ],
  ADMIN: ["*"],
};

const PERMISSIONS = {
  ...BASE_PERMISSIONS,
  HR_PAYROLL_USER: [
    ...new Set([...BASE_PERMISSIONS.HR_MANAGER, ...BASE_PERMISSIONS.HR_PAYROLL_USER]),
  ],
};

export function hasPermission(roles, permission) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.some((role) => {
    const granted = PERMISSIONS[role];
    return granted && (granted.includes("*") || granted.includes(permission));
  });
}

export function isElevated(roles) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.some((role) => role !== "EMPLOYEE");
}

export function homeRouteFor(user) {
  return user && isElevated(user.roles) ? "/employees" : "/me";
}

export const ROLE_LABELS = {
  EMPLOYEE: "Employee",
  HR_MANAGER: "HR Manager",
  HR_PAYROLL_USER: "HR Payroll User",
  HR_PAYROLL_MANAGER: "HR Payroll Manager",
  ADMIN: "Admin",
};
