const TONE_CLASS = {
  approved: "stamp-approved",
  pending: "stamp-pending",
  blocking: "stamp-blocking",
  neutral: "stamp-neutral",
};

export default function Stamp({ tone = "neutral", children }) {
  return <span className={TONE_CLASS[tone] ?? TONE_CLASS.neutral}>{children}</span>;
}
