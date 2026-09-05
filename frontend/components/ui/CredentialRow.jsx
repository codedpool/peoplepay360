"use client";

import { useState } from "react";

export default function CredentialRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <div>
        <p className="field-label mb-0.5">{label}</p>
        <p className="num text-[0.9rem]">{value}</p>
      </div>
      <button
        type="button"
        className="btn-secondary shrink-0"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
