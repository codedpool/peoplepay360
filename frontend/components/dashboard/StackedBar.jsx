// A single horizontal bar split proportionally by segment, with a legend
// underneath — used for the payslip status split (Draft/Computed/Validated/
// Paid/Sent).
export default function StackedBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex bg-paper">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => (
              <div key={i} className={s.colorClass} style={{ width: `${(s.value / total) * 100}%` }} />
            ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[0.75rem] text-fade">
            <span className={`w-2 h-2 rounded-full shrink-0 ${s.colorClass}`} />
            {s.label} <span className="num text-ink font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
