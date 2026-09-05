// One definition of how money is rendered, instead of the five separate
// copies of this formatter that had drifted across the pages. Locale is
// pinned to en-IN so the grouping matches the currency (1,20,000 rather than
// 120,000) — leaving it undefined would pair a rupee symbol with whatever
// grouping the viewer's browser happened to use.
const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCurrency(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatter.format(n);
}

// Lakh/crore-abbreviated form for large aggregate totals (department costs,
// company-wide payroll spend) — the full-digit form is correct but wide
// enough to force wrapping in a table cell or a bar-chart label. Per-employee
// scale figures should keep using formatCurrency instead, where the exact
// amount matters more than compactness.
export function formatCompactCurrency(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return formatter.format(n);
}
