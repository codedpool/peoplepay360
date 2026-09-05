// Simple vertical bar chart, hand-built to match the rest of the dashboard —
// no charting library needed for a handful of bars.
export default function BarChart({ bars, formatValue }) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="flex items-end gap-4 h-[180px] pt-4">
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full min-w-0">
          <span className="text-[0.7rem] num text-ink font-medium truncate max-w-full">
            {formatValue ? formatValue(b.value) : b.value}
          </span>
          <div className="w-full flex-1 flex items-end">
            <div
              className={`w-full rounded-t-md ${b.colorClass ?? "bg-ledger/25"}`}
              style={{ height: `${max > 0 ? Math.max((b.value / max) * 100, 2) : 2}%` }}
            />
          </div>
          <span className="text-[0.72rem] text-fade truncate max-w-full">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
