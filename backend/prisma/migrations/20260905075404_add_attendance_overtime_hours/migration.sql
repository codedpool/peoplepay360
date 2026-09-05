-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "overtime_hours" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "time_off_allocations" ALTER COLUMN "status" SET DEFAULT 'PENDING';
