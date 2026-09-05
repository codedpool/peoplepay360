const DEFAULT_PAGE_SIZE = 20;
// Raised from 100 so that lookup fetches (employees, time-off types) used to
// resolve a foreign key into a display name can pull the whole set in one
// request. At 100 with ~100 seeded employees, any row past the first page
// resolved to no name and the raw id leaked into the table instead.
const MAX_PAGE_SIZE = 500;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function paginatedResponse(data, total, page, pageSize) {
  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

module.exports = { parsePagination, paginatedResponse };
