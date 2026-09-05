// Express 4 does not catch rejected promises from async route handlers — an
// uncaught rejection here would otherwise crash the whole process on Node 22.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
