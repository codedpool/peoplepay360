"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { requestPasswordReset } from "../../lib/api";
import { homeRouteFor } from "../../lib/permissions";

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // "Forgot password" is a second mode on this same screen rather than its own
  // route — there's no token to carry between steps, it's just a short form.
  const [mode, setMode] = useState("signIn"); // "signIn" | "forgot"
  const [resetNote, setResetNote] = useState("");
  const [resetError, setResetError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

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

  async function handleResetRequest(e) {
    e.preventDefault();
    setResetError(null);
    setResetSubmitting(true);
    try {
      await requestPasswordReset(email, resetNote);
      setResetSent(true);
    } catch (err) {
      if (err.status === 429) {
        setResetError("Too many requests. Wait a while before asking again.");
      } else {
        setResetError(err.message);
      }
    } finally {
      setResetSubmitting(false);
    }
  }

  function backToSignIn() {
    setMode("signIn");
    setResetSent(false);
    setResetError(null);
    setResetNote("");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[1.05rem] font-semibold tracking-tight">PeoplePay360</p>
          <p className="text-[0.8rem] text-fade mt-0.5">HR &amp; Payroll workspace</p>
        </div>

        {mode === "signIn" ? (
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
                <div className="flex items-baseline justify-between">
                  <label htmlFor="password" className="field-label">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-[0.72rem] text-ledger hover:text-ledger-dark mb-1"
                  >
                    Forgot password?
                  </button>
                </div>
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
        ) : (
          <div className="panel px-7 py-8">
            <h1 className="text-[1.15rem] font-semibold mb-1">Request a password reset</h1>
            <p className="text-[0.82rem] text-fade mb-6">
              This sends an administrator a request to set you a new password. They&apos;ll pass it to you
              directly — nothing is emailed.
            </p>

            {resetSent ? (
              <div className="flex flex-col gap-5">
                {/* Same wording regardless of whether the address matched an
                    account. Confirming that a given email has a login here
                    would hand out a list of valid accounts. */}
                <p className="text-[0.85rem] border border-approved bg-approved-light text-approved px-3 py-2.5">
                  If that address has an account, an administrator has been notified.
                </p>
                <button onClick={backToSignIn} className="btn-secondary w-full">
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetRequest} className="flex flex-col gap-5">
                <div className="field-group">
                  <label htmlFor="reset-email" className="field-label">
                    Work email
                  </label>
                  <input
                    id="reset-email"
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
                  <label htmlFor="reset-note" className="field-label">
                    Note for the administrator (optional)
                  </label>
                  <input
                    id="reset-note"
                    type="text"
                    maxLength={500}
                    value={resetNote}
                    onChange={(e) => setResetNote(e.target.value)}
                    className="field"
                    placeholder="e.g. locked out since Monday"
                  />
                </div>

                {resetError && (
                  <p className="text-[0.8rem] text-stamp border border-stamp bg-stamp-light px-3 py-2">
                    {resetError}
                  </p>
                )}

                <button type="submit" disabled={resetSubmitting} className="btn-primary w-full mt-1">
                  {resetSubmitting ? "Sending…" : "Send request"}
                </button>
                <button type="button" onClick={backToSignIn} className="btn-ghost w-full">
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        )}

        <p className="text-center text-[0.78rem] text-fade mt-5">
          Accounts are created by an administrator. Contact yours if you need access.
        </p>
      </div>
    </main>
  );
}
