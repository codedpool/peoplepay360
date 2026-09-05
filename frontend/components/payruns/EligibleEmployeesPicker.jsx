"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import EmptyState from "../ui/EmptyState";
import Pagination from "../ui/Pagination";
import { formatCurrency } from "../../lib/currency";


// Mirrors the backend's own eligibility rule (an ACTIVE contract covering the
// whole period) rather than showing "all employees minus some filtered out" —
// this list IS who can legally be paid for this period.
export default function EligibleEmployeesPicker({ periodStart, periodEnd, selected, onChange }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ periodStart, periodEnd, page: String(page), pageSize: "20" });
      if (search.trim()) params.set("search", search.trim());
      const res = await api.get(`/api/payruns/eligible-employees?${params}`);
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const selectedSet = new Set(selected);

  function toggle(employeeId) {
    onChange(selectedSet.has(employeeId) ? selected.filter((id) => id !== employeeId) : [...selected, employeeId]);
  }

  function selectAllOnPage() {
    const ids = new Set(selected);
    rows.forEach((r) => ids.add(r.employeeId));
    onChange([...ids]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <input
          className="field max-w-xs"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-[0.8rem] text-fade shrink-0">{selected.length} selected</p>
      </div>

      {loading && <p className="text-fade text-[0.85rem]">Loading…</p>}
      {loadError && <EmptyState message={`Couldn't load eligible employees: ${loadError}`} />}
      {!loading && !loadError && rows.length === 0 && (
        <EmptyState message="No employees have an active contract covering this period." />
      )}

      {!loading && !loadError && rows.length > 0 && (
        <>
          <div className="panel divide-y divide-line max-h-72 overflow-y-auto">
            {rows.map((r) => (
              <label key={r.employeeId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={selectedSet.has(r.employeeId)} onChange={() => toggle(r.employeeId)} />
                <span className="flex-1 text-[0.85rem]">{r.name}</span>
                <span className="text-[0.78rem] text-fade">{r.department}</span>
                <span className="num text-[0.8rem] text-fade w-20 text-right">{formatCurrency(r.wage)}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className="text-[0.78rem] text-ledger hover:text-ledger-dark" onClick={selectAllOnPage}>
              Select all on this page
            </button>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
