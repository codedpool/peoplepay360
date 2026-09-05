"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { homeRouteFor } from "../../lib/permissions";

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(homeRouteFor(user));
    }
  }, [status, user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      router.replace(homeRouteFor(loggedInUser));
    } catch (err) {
      if (err.status === 423) {
        setError("Account temporarily locked from repeated failed attempts. Try again later.");
      } else if (err.status === 429) {
        setError("Too many attempts. Wait a few minutes before trying again.");
      } else {
        setError("Incorrect email or password.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[1.05rem] font-semibold tracking-tight">PeoplePay360</p>
          <p className="text-[0.8rem] text-fade mt-0.5">HR &amp; Payroll workspace</p>
        </div>

        <div className="panel px-7 py-8">
          <h1 className="text-[1.15rem] font-semibold mb-1">Welcome back</h1>
          <p className="text-[0.82rem] text-fade mb-6">Sign in to continue to your workspace.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="field-group">
              <label htmlFor="email" className="field-label">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="name@company.com"
              />
            </div>

            <div className="field-group">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <p className="text-[0.8rem] text-stamp border border-stamp bg-stamp-light px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full mt-1">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[0.78rem] text-fade mt-5">
          Accounts are created by an administrator. Contact yours if you need access.
        </p>
      </div>
    </main>
  );
}
