"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { ROLE_LABELS } from "../../lib/permissions";

// One nav for every role, rather than a separate EmployeeNav rendering a
// parallel set of /me/* routes. Each destination is a single page that shows
// the viewer's own records and, to whoever is permitted, the organization-wide
// section as well — so "Attendance" means the same URL for an employee and for
// HR, and there's only one page to keep working.
//
// `anyOf` gates on the union of the own-scoped and org-wide permissions: an
// Employee holds attendance:read:own and an HR Manager holds attendance:read,
// and both need the item.
const NAV_GROUPS = [
  {
    items: [
      { label: "My profile", href: "/me", requiresEmployee: true },
      { label: "Attendance", href: "/attendance", anyOf: ["attendance:read:own", "attendance:read"] },
      { label: "Time off", href: "/time-off/requests", anyOf: ["timeoff:read:own", "timeoff:read"] },
      { label: "Payslips", href: "/payslips", anyOf: ["payslip:read"], orEmployee: true },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Employees", href: "/employees", anyOf: ["employee:read"] },
      { label: "Contracts", href: "/contracts", anyOf: ["contract:read"] },
      { label: "Working schedules", href: "/schedules", anyOf: ["schedule:read"] },
      { label: "Time off allocations", href: "/time-off/allocations", anyOf: ["timeoff:read"] },
      { label: "Time off types", href: "/time-off/types", anyOf: ["timeoff:read"] },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Payruns", href: "/payruns", anyOf: ["payrun:read"] },
      { label: "Salary structures", href: "/salary-structures", anyOf: ["salarystructure:read"] },
    ],
  },
  {
    items: [{ label: "Users", href: "/users", anyOf: ["user:manage"], badge: "passwordResets" }],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, canAny, can, logout } = useAuth();
  const [pendingResets, setPendingResets] = useState(0);

  const canManageUsers = can("user:manage");

  // Password reset tickets are raised from the login screen, so the only way
  // an admin learns one is waiting is by being told here.
  useEffect(() => {
    if (!canManageUsers) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/password-reset-requests?status=PENDING&pageSize=1");
        if (!cancelled) setPendingResets(res.pagination?.total ?? 0);
      } catch {
        // A badge is not worth surfacing an error over — the Users page shows
        // the real queue and its own load failure if there is one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageUsers, pathname]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.requiresEmployee) return Boolean(user?.employeeId);
      if (item.orEmployee && user?.employeeId) return true;
      return canAny(item.anyOf ?? []);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="w-56 shrink-0 border-r border-line flex flex-col h-screen sticky top-0">
      <div className="px-5 h-14 flex items-center border-b border-line">
        <span className="font-semibold tracking-tight text-[0.95rem]">PeoplePay360</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {groups.map((group, i) => (
          <div key={i} className="mb-5 px-3">
            {group.label && (
              <p className="px-2 mb-1.5 text-[0.68rem] uppercase tracking-wide text-fade">{group.label}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const badgeCount = item.badge === "passwordResets" ? pendingResets : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 text-[0.85rem] border-l-2 -ml-px pl-[calc(0.5rem-1px)] transition-colors ${
                        active
                          ? "border-ledger text-ledger font-medium bg-ledger-light"
                          : "border-transparent text-ink/80 hover:text-ink hover:bg-panel"
                      }`}
                    >
                      <span>{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="num text-[0.68rem] px-1.5 py-0.5 border border-seal text-seal bg-seal-light rounded-sm leading-none">
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-4 py-3.5">
        <p className="text-[0.82rem] font-medium truncate">{user?.email ?? "Signed in"}</p>
        <p className="text-[0.72rem] text-fade truncate mb-2">
          {user?.roles?.map((r) => ROLE_LABELS[r] ?? r).join(", ")}
        </p>
        <div className="flex items-center gap-3">
          <Link href="/change-password" className="text-[0.78rem] text-fade hover:text-ink transition-colors">
            Change password
          </Link>
          <button onClick={logout} className="text-[0.78rem] text-fade hover:text-stamp transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
