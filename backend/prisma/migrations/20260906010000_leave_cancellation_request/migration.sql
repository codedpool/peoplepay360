-- An employee cannot cancel their own APPROVED leave (that would let them
-- restore their own balance), so they raise a request for HR instead. Held as
-- flags on the request itself rather than a separate model: the request stays
-- the single source of truth for its own lifecycle, and HR's queue is just a
-- filter on cancellation_requested.
ALTER TABLE "time_off_requests"
  ADD COLUMN "cancellation_requested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancellation_reason" TEXT,
  ADD COLUMN "cancellation_requested_at" TIMESTAMP(3);

CREATE INDEX "time_off_requests_cancellation_requested_idx"
  ON "time_off_requests"("cancellation_requested");
