"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login as apiLogin, logout as apiLogout, bootstrapSession, onUnauthorized } from "./api";
import { hasPermission, isElevated } from "./permissions";

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

// "loading" (bootstrap in flight) -> "authenticated" | "unauthenticated"
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const router = useRouter();

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await bootstrapSession();
      if (cancelled) return;
      if (token) {
        const claims = decodeJwt(token);
        setUser(
          claims && { id: claims.sub, roles: claims.roles, employeeId: claims.employeeId, email: claims.email }
        );
        setStatus(claims ? "authenticated" : "unauthenticated");
      } else {
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const publicUser = await apiLogin(email, password);
    setUser(publicUser);
    setStatus("authenticated");
    return publicUser;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  const can = useCallback((permission) => (user ? hasPermission(user.roles, permission) : false), [user]);
  const elevated = user ? isElevated(user.roles) : false;

  return (
    <AuthContext.Provider value={{ user, status, login, logout, can, elevated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
