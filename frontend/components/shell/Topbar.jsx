"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import { ROLE_LABELS } from "../../lib/permissions";

function initialsFor(email) {
  const name = email?.split("@")[0] ?? "";
  const parts = name.split(/[._-]/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export default function Topbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const primaryRole = user?.roles?.[0];

  return (
    <header className="h-16 shrink-0 border-b border-line bg-panel px-6 flex items-center gap-4 sticky top-0 z-10">
      <div
        className="flex-1 max-w-md flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2
          focus-within:ring-2 focus-within:ring-ledger/20 focus-within:border-ledger focus-within:bg-panel transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fade shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search employees, contracts, payslips…"
          className="flex-1 min-w-0 bg-transparent text-[0.85rem] text-ink placeholder:text-fade/70 focus:outline-none"
        />
      </div>

      {/* ml-auto pins the account block to the right edge — without it the
          block sits directly against the search box in the middle of the bar. */}
      <div className="relative ml-auto shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-paper transition-colors"
        >
          <span className="w-9 h-9 rounded-full bg-ledger text-white text-[0.78rem] font-semibold flex items-center justify-center shrink-0">
            {initialsFor(user?.email)}
          </span>
          <span className="text-left hidden sm:block">
            <span className="block text-[0.82rem] font-medium text-ink leading-tight whitespace-nowrap">
              {user?.email}
            </span>
            <span className="block text-[0.7rem] text-fade leading-tight">
              {primaryRole ? ROLE_LABELS[primaryRole] ?? primaryRole : ""}
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fade shrink-0">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-panel border border-line rounded-xl shadow-lg shadow-ink/10 py-1.5 z-20">
            <Link
              href="/change-password"
              className="block px-4 py-2 text-[0.85rem] text-ink hover:bg-paper transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Change password
            </Link>
            <button
              onClick={logout}
              className="w-full text-left px-4 py-2 text-[0.85rem] text-stamp hover:bg-stamp-light transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
