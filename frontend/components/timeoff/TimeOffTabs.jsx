import Link from "next/link";

const TABS = [
  { key: "requests", label: "Requests", href: "/time-off/requests" },
  { key: "allocations", label: "Allocations", href: "/time-off/allocations" },
  { key: "types", label: "Types", href: "/time-off/types" },
];

export default function TimeOffTabs({ active }) {
  return (
    <div className="flex border-b border-line mb-6 -mt-2">
      {TABS.map((tab) => (
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
