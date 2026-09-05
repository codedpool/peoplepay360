"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { isElevated } from "../../lib/permissions";

const MIN_LENGTH = 8;

// Deliberately outside the (app) route group. When mustChangePassword is set
// the API answers 428 to every other endpoint, so this page cannot live inside
// a layout whose nav and pages all fire requests that would fail — it has to
// render standalone with only the one call it's allowed to make.
export default function ChangePasswordPage() {
  const { user, status, changePassword, mustChangePassword, logout } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-fade text-sm">Loading…</div>;
  }
  if (!user) return null;

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_LENGTH && !mismatch && !sameAsCurrent;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await changePassword(currentPassword, newPassword);
      setDone(true);
      // The returned token no longer carries the gate, so the app is reachable
      // again — send them where they'd normally land.
      router.replace(isElevated(updated.roles) ? "/employees" : "/me");
    } catch (err) {
      if (err.status === 401) {
        setError("That current password isn't right.");
      } else if (err.status === 429) {
        setError("Too many attempts. Wait a few minutes before trying again.");
      } else {
        setError(err.message);
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
          <p className="text-[0.8rem] text-fade mt-0.5">{user.email}</p>
        </div>

        <div className="panel px-7 py-8">
          <h1 className="text-[1.15rem] font-semibold mb-1">
            {mustChangePassword ? "Set a new password" : "Change password"}
          </h1>
          <p className="text-[0.82rem] text-fade mb-6">
            {mustChangePassword
              ? "An administrator set your current password. Choose your own before continuing."
              : "Enter your current password, then choose a new one."}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="field-group">
              <label htmlFor="current" className="field-label">
                Current password
              </label>
              <input
                id="current"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field"
                placeholder="••••••••••"
              />
            </div>

            <div className="field-group">
              <label htmlFor="next" className="field-label">
                New password
              </label>
              <input
                id="next"
                type="password"
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field"
                placeholder="At least 8 characters"
              />
              {tooShort && <p className="text-[0.75rem] text-stamp mt-1">At least {MIN_LENGTH} characters.</p>}
              {sameAsCurrent && (
                <p className="text-[0.75rem] text-stamp mt-1">
                  That&apos;s the same as your current password.
                </p>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="confirm" className="field-label">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field"
                placeholder="••••••••••"
              />
              {mismatch && <p className="text-[0.75rem] text-stamp mt-1">These don&apos;t match.</p>}
            </div>

            {error && (
              <p className="text-[0.8rem] text-stamp border border-stamp bg-stamp-light px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={submitting || done || !canSubmit} className="btn-primary w-full mt-1">
              {submitting ? "Saving…" : done ? "Saved" : "Change password"}
            </button>
          </form>

          <p className="text-[0.75rem] text-fade mt-5 leading-relaxed">
            Changing your password signs out your other sessions.
          </p>
        </div>

        <div className="text-center mt-5">
          {mustChangePassword ? (
            <button onClick={logout} className="text-[0.78rem] text-fade hover:text-stamp transition-colors">
              Sign out instead
            </button>
          ) : (
            <button
              onClick={() => router.back()}
              className="text-[0.78rem] text-fade hover:text-ink transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
