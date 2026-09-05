// Four different resources carry a start/end date pair — contracts, time-off
// requests, time-off allocations and payrun periods — and none of them checked
// that the end actually follows the start, so every one of them would happily
// store a range that runs backwards. A backwards range isn't merely untidy: an
// allocation with validTo < validFrom can never be matched by the approval
// lookup, and a payrun period that runs backwards silently computes zero
// scheduled working days and pays everyone nothing.
//
// One definition, applied on every route, so "end before start" can't be fixed
// in one place and left broken in the next.

// Inclusive: a single-day range (start === end) is legitimate everywhere this
// is used — a one-day leave request, a contract that starts and ends the same
// day. Only a genuinely inverted range is rejected.
function isOrderedRange(start, end) {
  if (start == null || end == null) return true;
  return end.getTime() >= start.getTime();
}

// Spread into zod's .refine(): .refine(...orderedRangeRefinement("startDate", "endDate"))
// The issue is reported on the end field, so a form can attach the message to
// the input the user most likely needs to change.
function orderedRangeRefinement(startKey, endKey, message) {
  return [
    (value) => isOrderedRange(value[startKey], value[endKey]),
    { message: message ?? "End date cannot be before the start date", path: [endKey] },
  ];
}

module.exports = { isOrderedRange, orderedRangeRefinement };
