function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function Avatar({ name, size = 9 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-ledger text-ledger font-medium shrink-0"
      style={{ width: `${size / 4}rem`, height: `${size / 4}rem`, fontSize: `${size / 9.5}rem` }}
    >
      {initials(name) || "?"}
    </span>
  );
}
