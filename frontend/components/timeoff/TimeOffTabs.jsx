"use client";

import Link from "next/link";
import { useAuth } from "../../lib/auth-context";

// Requests is the page everybody shares — an employee sees their own balances
// and history there, an approver additionally sees the queue. Allocations and
// Types are administration and stay behind timeoff:read, so for an Employee
// this renders a single tab and is hidden entirely rather than showing a lone
// tab that navigates nowhere.
const TABS = [
  { key: "requests", label: "Requests", href: "/time-off/requests", permission: null },
  { key: "allocations", label: "Allocations", href: "/time-off/allocations", permission: "timeoff:read" },
  { key: "types", label: "Types", href: "/time-off/types", permission: "timeoff:read" },
];

export default function TimeOffTabs({ active }) {
  const { can } = useAuth();
  const tabs = TABS.filter((tab) => !tab.permission || can(tab.permission));

  if (tabs.length < 2) return null;

  return (
    <div className="flex border-b border-line mb-6 -mt-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-3.5 py-2 text-[0.85rem] border-b-2 -mb-px transition-colors ${
            active === tab.key ? "border-ledger text-ledger font-medium" : "border-transparent text-fade hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
