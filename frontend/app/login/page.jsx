"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { requestPasswordReset } from "../../lib/api";
import { homeRouteFor } from "../../lib/permissions";

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid grid-cols-2 gap-[3px] w-7 h-7 shrink-0">
        <div className="rounded-[3px] bg-indigo-600" />
        <div className="rounded-[3px] bg-indigo-300" />
        <div className="rounded-[3px] bg-indigo-300" />
        <div className="rounded-[3px] bg-indigo-600" />
      </div>
      <div>
        <p className="text-[1.05rem] font-extrabold tracking-tight text-slate-900 leading-tight">PeoplePay360</p>
        <p className="text-[0.68rem] text-slate-400 leading-tight">HR &amp; Payroll</p>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ off }) {
  return off ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path
        d="M10.6 5.2A10.6 10.6 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.3 3.3M6.6 6.6C4.5 8 3 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.9 10a3 3 0 0 0 4.1 4.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1.5 12c1.5-3 5.5-7 10.5-7s9 4 10.5 7c-1.5 3-5.5 7-10.5 7s-9-4-10.5-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InputField({ icon, endAdornment, ...props }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5
        focus-within:ring-2 focus-within:ring-indigo-500/25 focus-within:border-indigo-500 transition-colors"
    >
      <span className="text-slate-400 shrink-0">{icon}</span>
      <input
        {...props}
        className="flex-1 min-w-0 bg-transparent text-[0.9rem] text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      {endAdornment && <span className="shrink-0">{endAdornment}</span>}
    </div>
  );
}

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen flex items-center justify-center p-6 sm:p-10 relative overflow-hidden bg-[#F3F1FD]">
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-indigo-100/70 blur-3xl" />

      <div className="relative w-full max-w-5xl min-h-[660px] rounded-[2rem] shadow-2xl shadow-indigo-950/10 overflow-hidden flex bg-white">
        <div className="flex-1 min-w-0 flex flex-col px-10 sm:px-14 xl:px-16 py-10">
          <BrandMark />

          <div className="flex-1 flex flex-col justify-center">
            <div className="w-full max-w-sm mx-auto">
              {mode === "signIn" ? (
                <div>
                  <h1 className="text-[1.85rem] font-bold text-slate-900 tracking-tight">Welcome back 👋</h1>
                  <p className="text-[0.85rem] text-slate-500 mt-1.5 mb-7">Sign in to continue to your workspace.</p>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="email" className="text-[0.8rem] font-medium text-slate-700">
                        Work Email
                      </label>
                      <InputField
                        id="email"
                        type="email"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        icon={<MailIcon />}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="password" className="text-[0.8rem] font-medium text-slate-700">
                        Password
                      </label>
                      <InputField
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        icon={<LockIcon />}
                        endAdornment={
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            <EyeIcon off={showPassword} />
                          </button>
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="self-end text-[0.75rem] font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {error && (
                      <p className="text-[0.8rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700
                        disabled:opacity-50 disabled:pointer-events-none text-white font-medium text-[0.9rem] py-2.5 transition-colors"
                    >
                      {submitting ? "Signing in…" : "Sign In"}
                      {!submitting && <ArrowIcon />}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <h1 className="text-[1.85rem] font-bold text-slate-900 tracking-tight">Request a reset</h1>
                  <p className="text-[0.85rem] text-slate-500 mt-1.5 mb-7">
                    This sends an administrator a request to set you a new password. They&apos;ll pass it to you
                    directly — nothing is emailed.
                  </p>

                  {resetSent ? (
                    <div className="flex flex-col gap-5">
                      {/* Same wording regardless of whether the address matched an
                          account. Confirming that a given email has a login here
                          would hand out a list of valid accounts. */}
                      <p className="text-[0.85rem] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3.5 py-2.5">
                        If that address has an account, an administrator has been notified.
                      </p>
                      <button
                        onClick={backToSignIn}
                        className="rounded-xl border border-slate-200 text-slate-700 hover:border-slate-300 font-medium text-[0.9rem] py-2.5 transition-colors"
                      >
                        Back to sign in
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleResetRequest} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="reset-email" className="text-[0.8rem] font-medium text-slate-700">
                          Work Email
                        </label>
                        <InputField
                          id="reset-email"
                          type="email"
                          required
                          autoComplete="username"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com"
                          icon={<MailIcon />}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="reset-note" className="text-[0.8rem] font-medium text-slate-700">
                          Note for the administrator (optional)
                        </label>
                        <input
                          id="reset-note"
                          type="text"
                          maxLength={500}
                          value={resetNote}
                          onChange={(e) => setResetNote(e.target.value)}
                          placeholder="e.g. locked out since Monday"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[0.9rem] text-slate-900
                            placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500
                            transition-colors"
                        />
                      </div>

                      {resetError && (
                        <p className="text-[0.8rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          {resetError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={resetSubmitting}
                        className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700
                          disabled:opacity-50 disabled:pointer-events-none text-white font-medium text-[0.9rem] py-2.5 transition-colors"
                      >
                        {resetSubmitting ? "Sending…" : "Send request"}
                      </button>
                      <button
                        type="button"
                        onClick={backToSignIn}
                        className="text-[0.85rem] text-slate-500 hover:text-slate-700 py-1"
                      >
                        Back to sign in
                      </button>
                    </form>
                  )}
                </div>
              )}

              <p className="text-center text-[0.75rem] text-slate-400 mt-8">
                Accounts are created by an administrator. Contact yours if you need access.
              </p>
            </div>
          </div>

          <p className="text-center text-[0.7rem] text-slate-400">© {year} PeoplePay360. All rights reserved.</p>
        </div>

        <div className="hidden lg:block w-[45%] shrink-0 bg-[#EEF0FC] relative">
          <img src="/login.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
    </main>
  );
}
