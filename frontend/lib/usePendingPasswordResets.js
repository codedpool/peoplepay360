"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "./api";
import { useAuth } from "./auth-context";

// Password reset tickets are raised from the login screen, so the only way an
// admin learns one is waiting is by being told here — shared by the sidebar
// badge and the topbar bell so both stay in sync off one fetch pattern.
export function usePendingPasswordResets() {
  const pathname = usePathname();
  const { can } = useAuth();
  const [count, setCount] = useState(0);
  const canManageUsers = can("user:manage");

  useEffect(() => {
    if (!canManageUsers) {
      setCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/password-reset-requests?status=PENDING&pageSize=1");
        if (!cancelled) setCount(res.pagination?.total ?? 0);
      } catch {
        // Not worth surfacing an error over — the Users page shows the real
        // queue and its own load failure if there is one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageUsers, pathname]);

  return count;
}
