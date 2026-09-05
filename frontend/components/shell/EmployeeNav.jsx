"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

const ITEMS = [
  { label: "My profile", href: "/me" },
  { label: "My attendance", href: "/me/attendance" },
  { label: "My time off", href: "/me/time-off" },
  { label: "My payslips", href: "/me/payslips" },
];

export default function EmployeeNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <nav className="w-56 shrink-0 border-r border-line flex flex-col h-screen sticky top-0">
      <div className="px-5 h-14 flex items-center border-b border-line">
        <span className="font-semibold tracking-tight text-[0.95rem]">PeoplePay360</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
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

      <div className="border-t border-line px-4 py-3.5">
        <p className="text-[0.82rem] font-medium truncate">{user?.email ?? "Signed in"}</p>
        <p className="text-[0.72rem] text-fade truncate mb-2">Employee</p>
        <button onClick={logout} className="text-[0.78rem] text-fade hover:text-stamp transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  );
}
