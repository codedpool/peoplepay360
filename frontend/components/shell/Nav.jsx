"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { ROLE_LABELS } from "../../lib/permissions";

const NAV_GROUPS = [
  {
    items: [
      { label: "Employees", href: "/employees", permission: "employee:read" },
      { label: "Contracts", href: "/contracts", permission: "contract:read" },
      { label: "Working schedules", href: "/schedules", permission: "schedule:read" },
      { label: "Attendance", href: "/attendance", permission: "attendance:read" },
    ],
  },
  {
    label: "Time off",
    items: [
      { label: "Requests", href: "/time-off/requests", permission: "timeoff:read" },
      { label: "Allocations", href: "/time-off/allocations", permission: "timeoff:read" },
      { label: "Types", href: "/time-off/types", permission: "timeoff:read" },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Payruns", href: "/payruns", permission: "payrun:read" },
      { label: "Payslips", href: "/payslips", permission: "payslip:read" },
      { label: "Salary structures", href: "/salary-structures", permission: "salarystructure:read" },
    ],
  },
  {
    items: [{ label: "Users", href: "/users", permission: "user:manage" }],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission)),
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
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block px-2 py-1.5 text-[0.85rem] border-l-2 -ml-px pl-[calc(0.5rem-1px)] transition-colors ${
                        active
                          ? "border-ledger text-ledger font-medium bg-ledger-light"
                          : "border-transparent text-ink/80 hover:text-ink hover:bg-panel"
                      }`}
                    >
                      {item.label}
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
        <button onClick={logout} className="text-[0.78rem] text-fade hover:text-stamp transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  );
}
