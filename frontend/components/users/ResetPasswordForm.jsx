"use client";

import { useState } from "react";
import ErrorNote from "../ui/ErrorNote";

const MIN_LENGTH = 8;

// Shared by both admin paths that set someone else's password: the direct
// "Reset password" action on a user row, and resolving a reset request raised
// from the login screen. Both end up calling the same backend service, so they
// get the same form and the same warning about what happens next.
export default function ResetPasswordForm({
  subject,
  submitting = false,
  error,
  submitLabel = "Set password",
  onSubmit,
  onCancel,
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const canSubmit = newPassword.length >= MIN_LENGTH && !mismatch;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ newPassword });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-[0.85rem] text-fade">
        Setting a new password for <span className="font-medium text-ink">{subject}</span>. Their existing
        sessions are signed out immediately, and they&apos;ll be required to choose their own password the
        next time they sign in — so this one only has to survive being handed over.
      </p>

      <div className="field-group">
        <label className="field-label">New password</label>
        <input
          type="text"
          required
          minLength={MIN_LENGTH}
          autoComplete="off"
          className="field num"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        {tooShort && <p className="text-[0.75rem] text-stamp mt-1">At least {MIN_LENGTH} characters.</p>}
      </div>

      <div className="field-group">
        <label className="field-label">Confirm password</label>
        <input
          type="text"
          required
          autoComplete="off"
          className="field num"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {mismatch && <p className="text-[0.75rem] text-stamp mt-1">These don&apos;t match.</p>}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-3 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || !canSubmit} className="btn-primary">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
