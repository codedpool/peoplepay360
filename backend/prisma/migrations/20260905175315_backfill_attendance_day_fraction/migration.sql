-- Backfill for the day_fraction column and the new HALF_DAY status added by
-- the preceding migration. This is deliberately a SEPARATE migration file:
-- Postgres refuses to use an enum value in the same transaction that added it,
-- and Prisma runs each migration file in its own transaction, so 'HALF_DAY'
-- is only usable from here onwards.
--
-- Mirrors deriveStatus()/computeDayFraction() in src/services/attendance.js:
-- a full day is the employee's scheduled daily hours (weekly / 5, defaulting
-- to 8h when they have no schedule), half a day is at least half of that, and
-- anything under that bar earns nothing. Rows already at or above the full-day
-- bar keep whatever status they had (PRESENT / LATE / OVERTIME) — this only
-- reclassifies the short days that used to be recorded as a full PRESENT.
UPDATE "attendances" a
SET "day_fraction" = CASE
      WHEN a."check_out" IS NULL OR a."worked_hours" IS NULL THEN 0
      WHEN a."worked_hours" >= d.full_day_hours THEN 1
      WHEN a."worked_hours" >= d.full_day_hours / 2 THEN 0.5
      ELSE 0
    END,
    "status" = CASE
      WHEN a."check_out" IS NULL OR a."worked_hours" IS NULL THEN a."status"
      WHEN a."worked_hours" < d.full_day_hours / 2 THEN 'ABSENT'::"AttendanceStatus"
      WHEN a."worked_hours" < d.full_day_hours THEN 'HALF_DAY'::"AttendanceStatus"
      ELSE a."status"
    END
FROM (
  SELECT e."id" AS employee_id,
         COALESCE(ws."weekly_hours" / 5, 8) AS full_day_hours
  FROM "employees" e
  LEFT JOIN "working_schedules" ws ON ws."id" = e."schedule_id"
) d
WHERE d.employee_id = a."employee_id";

-- Approved requests predate the allocation_id column, so nothing recorded
-- which allocation they drew from. Recover it from the approval audit log
-- (timeOffRequests.routes.js writes after.allocationId on every approval) so
-- that cancelling an already-approved request can restore the right balance.
UPDATE "time_off_requests" r
SET "allocation_id" = l.allocation_id
FROM (
  SELECT DISTINCT ON (al."entity_id")
         al."entity_id",
         al."after" ->> 'allocationId' AS allocation_id
  FROM "audit_logs" al
  WHERE al."action" = 'timeoff.approve'
    AND al."entity_type" = 'TimeOffRequest'
    AND al."after" ->> 'allocationId' IS NOT NULL
  ORDER BY al."entity_id", al."created_at" DESC
) l
WHERE l."entity_id" = r."id"
  AND r."status" = 'APPROVED'
  AND r."allocation_id" IS NULL;
