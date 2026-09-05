"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  login as apiLogin,
  logout as apiLogout,
  changePassword as apiChangePassword,
  bootstrapSession,
  onUnauthorized,
  onPasswordChangeRequired,
} from "./api";
import { hasPermission, hasAnyPermission, isElevated } from "./permissions";

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
    // The API answers 428 to everything until the password is changed. A page
    // that was mid-load when that happens flips the flag here so the layout
    // can route to the change form, instead of each page rendering its own
    // "couldn't load" error.
    onPasswordChangeRequired(() => {
      setUser((current) => (current && !current.mustChangePassword
        ? { ...current, mustChangePassword: true }
        : current));
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
          claims && {
            id: claims.sub,
            roles: claims.roles,
            employeeId: claims.employeeId,
            email: claims.email,
            mustChangePassword: claims.mustChangePassword === true,
          }
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

  // Self-service change. The API hands back a fresh token whose claims no
  // longer carry mustChangePassword, so the gate lifts without a re-login.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const publicUser = await apiChangePassword(currentPassword, newPassword);
    setUser(publicUser);
    setStatus("authenticated");
    return publicUser;
  }, []);

  const can = useCallback((permission) => (user ? hasPermission(user.roles, permission) : false), [user]);
  const canAny = useCallback(
    (permissions) => (user ? hasAnyPermission(user.roles, permissions) : false),
    [user]
  );
  const elevated = user ? isElevated(user.roles) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        login,
        logout,
        changePassword,
        can,
        canAny,
        elevated,
        mustChangePassword: user?.mustChangePassword === true,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
