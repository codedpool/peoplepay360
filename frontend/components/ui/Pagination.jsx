export default function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 text-[0.8rem] text-fade">
      <span>{total} total</span>
      <div className="flex items-center gap-3">
        <button
          className="btn-ghost px-2 py-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="num">
          {page} / {totalPages}
        </span>
        <button
          className="btn-ghost px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
