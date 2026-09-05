-- Multi-role users: mockup's "assign one or more roles" requires an array,
-- not the single Role enum column this started as. Backfill existing single
-- role into a one-element array before dropping the old column.
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
UPDATE "users" SET "roles" = ARRAY["role"];
ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "users" DROP COLUMN "role";

-- Allocation approval workflow: mockup shows allocations going through their
-- own Approve/Refuse action ("To Approve" -> "Approved"), not created active.
ALTER TYPE "AllocationStatus" ADD VALUE 'PENDING' BEFORE 'ACTIVE';
ALTER TYPE "AllocationStatus" ADD VALUE 'REFUSED' BEFORE 'EXPIRED';

-- Time off type config surfaced by the mockup (who approves it, display color).
ALTER TABLE "time_off_types" ADD COLUMN "approver_role" TEXT;
ALTER TABLE "time_off_types" ADD COLUMN "display_color" TEXT;
