"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import Nav from "../../components/shell/Nav";
import EmployeeNav from "../../components/shell/EmployeeNav";

export default function AppLayout({ children }) {
  const { user, status, elevated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-fade text-sm">Loading…</div>;
  }
  if (!user) return null;

  if (!elevated && !user.employeeId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="max-w-sm text-center">
          <p className="font-semibold mb-2">No employee record linked</p>
          <p className="text-[0.85rem] text-fade mb-6">
            This account isn&apos;t linked to an Employee record, so there&apos;s nothing to show here. Ask an
            Admin to link one from User Management.
          </p>
          <button onClick={logout} className="btn-secondary">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex bg-paper">
      {elevated ? <Nav /> : <EmployeeNav />}
      <main className="flex-1 min-w-0 px-9 py-8">{children}</main>
    </div>
  );
}
