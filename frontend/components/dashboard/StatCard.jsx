export default function StatCard({ icon, label, value, delta, deltaLabel, caption }) {
  return (
    <div className="panel p-4 flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg bg-ledger-light text-ledger flex items-center justify-center shrink-0">
          {icon}
        </span>
        <p className="text-[0.78rem] text-fade truncate">{label}</p>
      </div>
      <p className="num text-[1.35rem] font-bold text-ink leading-none truncate">{value}</p>
      {delta != null ? (
        <p className={`text-[0.75rem] flex items-center gap-1 ${delta >= 0 ? "text-approved" : "text-stamp"}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d={delta >= 0 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {Math.abs(delta)}% {deltaLabel ?? ""}
        </p>
      ) : (
        <p className="text-[0.75rem] text-fade truncate">{caption ?? " "}</p>
      )}
    </div>
  );
}
