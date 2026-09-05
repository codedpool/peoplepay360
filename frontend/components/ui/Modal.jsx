"use client";

import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 py-12 px-4">
      <div className={`w-full ${width} bg-panel border border-line rounded-2xl shadow-xl shadow-ink/10`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-semibold text-[1.05rem]">{title}</h2>
          <button onClick={onClose} className="text-fade hover:text-ink text-[0.85rem]">
            Close
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
