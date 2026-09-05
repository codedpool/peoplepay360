"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { usePendingPasswordResets } from "../../lib/usePendingPasswordResets";

function Icon({ path, ...props }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      {path}
    </svg>
  );
}

const ICONS = {
  overview: (
    <Icon
      path={
        <>
          <path d="M4 12 12 4l8 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 10.5V20h12v-9.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
    />
  ),
  profile: (
    <Icon
      path={
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c1.2-3.5 4-5.3 7-5.3s5.8 1.8 7 5.3" strokeLinecap="round" />
        </>
      }
    />
  ),
  employees: (
    <Icon
      path={
        <>
          <circle cx="9" cy="8" r="2.8" />
          <path d="M3 19c.9-2.9 3.1-4.4 6-4.4s5.1 1.5 6 4.4" strokeLinecap="round" />
          <path d="M15.5 8.2a2.6 2.6 0 1 1 3.4 2.5" strokeLinecap="round" />
          <path d="M15.8 14.8c2.3.3 3.9 1.7 4.7 4.2" strokeLinecap="round" />
        </>
      }
    />
  ),
  contracts: (
    <Icon
      path={
        <>
          <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14 3.5V8h4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 12.5h6M9 15.8h6M9 9.2h2" strokeLinecap="round" />
        </>
      }
    />
  ),
  schedules: (
    <Icon
      path={
        <>
          <rect x="3.5" y="5" width="17" height="15" rx="2.3" />
          <path d="M3.5 9.5h17M8 3v3.2M16 3v3.2" strokeLinecap="round" />
          <path d="M12 12.6v2.6l1.8 1" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
    />
  ),
  attendance: (
    <Icon
      path={
        <>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.6V12l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
    />
  ),
  timeoff: (
    <Icon
      path={
        <>
          <rect x="3.5" y="5" width="17" height="15" rx="2.3" />
          <path d="M3.5 9.5h17M8 3v3.2M16 3v3.2" strokeLinecap="round" />
          <path d="M8.3 13.3l2 2 4.4-4.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
    />
  ),
  payslips: (
    <Icon
      path={
        <>
          <path d="M7 3.5h10v17l-2.3-1.5-2.2 1.5-2.2-1.5-2.2 1.5-1.1-1.5V3.5Z" strokeLinejoin="round" />
          <path d="M9.3 8h5.4M9.3 11.3h5.4M9.3 14.6h3" strokeLinecap="round" />
        </>
      }
    />
  ),
  payruns: (
    <Icon
      path={
        <>
          <rect x="2.8" y="6.5" width="18.4" height="11.5" rx="2" />
          <circle cx="12" cy="12.2" r="2.4" />
          <path d="M6 6.5V5.8A1.3 1.3 0 0 1 7.3 4.5h9.4A1.3 1.3 0 0 1 18 5.8v.7" strokeLinecap="round" />
        </>
      }
    />
  ),
  salaryStructures: (
    <Icon
      path={
        <>
          <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" strokeLinejoin="round" />
          <path d="M3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
    />
  ),
  users: (
    <Icon
      path={
        <>
          <circle cx="9.2" cy="8" r="2.8" />
          <path d="M3.5 19c.9-2.9 3-4.4 5.7-4.4s4.8 1.5 5.7 4.4" strokeLinecap="round" />
          <path d="M16 4.3a2.9 2.9 0 0 1 0 5.6M18.5 14.8c1.6.7 2.6 2.1 3 4.2" strokeLinecap="round" />
        </>
      }
    />
  ),
};

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
      { label: "Overview", href: "/dashboard", icon: "overview", anyOf: ["dashboard:read"] },
      { label: "My profile", href: "/me", icon: "profile", requiresEmployee: true },
      { label: "Attendance", href: "/attendance", icon: "attendance", anyOf: ["attendance:read:own", "attendance:read"] },
      { label: "Time off", href: "/time-off/requests", icon: "timeoff", anyOf: ["timeoff:read:own", "timeoff:read"] },
      { label: "Payslips", href: "/payslips", icon: "payslips", anyOf: ["payslip:read"], orEmployee: true },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Employees", href: "/employees", icon: "employees", anyOf: ["employee:read"] },
      { label: "Contracts", href: "/contracts", icon: "contracts", anyOf: ["contract:read"] },
      { label: "Working schedules", href: "/schedules", icon: "schedules", anyOf: ["schedule:read"] },
      { label: "Time off allocations", href: "/time-off/allocations", icon: "timeoff", anyOf: ["timeoff:read"] },
      { label: "Time off types", href: "/time-off/types", icon: "timeoff", anyOf: ["timeoff:read"] },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Payruns", href: "/payruns", icon: "payruns", anyOf: ["payrun:read"] },
      { label: "Salary structures", href: "/salary-structures", icon: "salaryStructures", anyOf: ["salarystructure:read"] },
    ],
  },
  {
    label: "System",
    items: [{ label: "Users", href: "/users", icon: "users", anyOf: ["user:manage"], badge: "passwordResets" }],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, canAny } = useAuth();
  const pendingResets = usePendingPasswordResets();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.requiresEmployee) return Boolean(user?.employeeId);
      if (item.orEmployee && user?.employeeId) return true;
      return canAny(item.anyOf ?? []);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="w-64 shrink-0 bg-panel border-r border-line flex flex-col h-screen sticky top-0">
      <div className="px-6 h-16 flex items-center gap-2.5 shrink-0">
        <div className="grid grid-cols-2 gap-[3px] w-7 h-7 shrink-0">
          <div className="rounded-[3px] bg-ledger" />
          <div className="rounded-[3px] bg-ledger/40" />
          <div className="rounded-[3px] bg-ledger/40" />
          <div className="rounded-[3px] bg-ledger" />
        </div>
        <div>
          <p className="text-[0.95rem] font-extrabold tracking-tight text-ink leading-tight">PeoplePay360</p>
          <p className="text-[0.65rem] text-fade leading-tight">HR &amp; Payroll</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {groups.map((group, i) => (
          <div key={i} className="mb-5">
            {group.label && (
              <p className="px-3 mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-fade/70">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const badgeCount = item.badge === "passwordResets" ? pendingResets : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 text-[0.85rem] rounded-lg transition-colors ${
                        active ? "bg-ledger-light text-ledger font-semibold" : "text-fade hover:text-ink hover:bg-paper"
                      }`}
                    >
                      <span className={active ? "text-ledger" : "text-fade"}>{ICONS[item.icon]}</span>
                      <span className="flex-1">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="num text-[0.65rem] min-w-[1.1rem] text-center px-1 py-0.5 text-white bg-stamp rounded-full leading-none">
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

      <div className="px-4 pb-4">
        <div className="rounded-xl bg-ledger-light px-4 py-3.5 flex items-center gap-2.5">
          <span className="text-ledger shrink-0">
            <Icon
              path={
                <path
                  d="M12 21c-4-2.5-7-5.8-7-9.5A5 5 0 0 1 12 6a5 5 0 0 1 7 5.5c0 3.7-3 7-7 9.5Z"
                  strokeLinejoin="round"
                />
              }
            />
          </span>
          <p className="text-[0.75rem] text-ledger-dark leading-snug">
            Great teams are built by great people.
          </p>
        </div>
      </div>
    </nav>
  );
}
