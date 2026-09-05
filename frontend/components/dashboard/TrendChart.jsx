// A minimal line/area chart over evenly-spaced points. Built by hand (no
// charting library) — at dashboard scale (a handful of months) an SVG
// polyline is plenty, and it keeps the frontend dependency-free.
export default function TrendChart({ points, formatValue, height = 200 }) {
  const width = 640;
  const padTop = 24;
  const padBottom = 28;
  const padLeft = 26;
  const padRight = 26;
  const plotHeight = height - padTop - padBottom;
  const plotWidth = width - padLeft - padRight;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padLeft + i * stepX,
    y: padTop + plotHeight - ((p.value - min) / range) * plotHeight,
    ...p,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1]?.x.toFixed(1)},${padTop + plotHeight} L${coords[0]?.x.toFixed(1)},${padTop + plotHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="text-ledger">
        {coords.length > 1 && <path d={areaPath} fill="url(#trendFill)" stroke="none" />}
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill="white" stroke="currentColor" strokeWidth="2" />
        ))}
      </g>
      {coords.map((c, i) => (
        <text key={i} x={c.x} y={height - 8} textAnchor="middle" className="fill-current text-fade" style={{ fontSize: 10 }}>
          {c.label}
        </text>
      ))}
      {formatValue && coords.length > 0 && (
        <text
          x={coords[coords.length - 1].x}
          y={coords[coords.length - 1].y - 10}
          textAnchor="end"
          className="fill-current text-ink font-semibold"
          style={{ fontSize: 11 }}
        >
          {formatValue(coords[coords.length - 1].value)}
        </text>
      )}
    </svg>
  );
}
