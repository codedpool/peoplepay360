"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { homeRouteFor } from "../lib/permissions";

export default function HomePage() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    router.replace(status === "authenticated" && user ? homeRouteFor(user) : "/login");
  }, [status, user, router]);

  return <div className="min-h-screen flex items-center justify-center text-fade text-sm">Loading…</div>;
}
