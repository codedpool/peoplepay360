"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import Nav from "../../components/shell/Nav";

export default function AppLayout({ children }) {
  const { user, status, elevated, mustChangePassword, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // The API refuses every request with 428 until the password is changed, so
  // there is nothing any page in here could usefully render.
  useEffect(() => {
    if (mustChangePassword) router.replace("/change-password");
  }, [mustChangePassword, router]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-fade text-sm">Loading…</div>;
  }
  if (!user) return null;
  if (mustChangePassword) return null;

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
      <Nav />
      <main className="flex-1 min-w-0 px-9 py-8">{children}</main>
    </div>
  );
}
