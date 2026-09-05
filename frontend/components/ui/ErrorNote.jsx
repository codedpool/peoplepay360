export default function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="text-[0.8rem] text-stamp border border-stamp bg-stamp-light px-3 py-2">{children}</p>;
}
