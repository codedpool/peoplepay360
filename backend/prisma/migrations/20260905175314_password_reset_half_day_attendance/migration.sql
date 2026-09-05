-- CreateEnum
CREATE TYPE "PasswordResetRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'HALF_DAY';

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "day_fraction" DECIMAL(3,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "time_off_requests" ADD COLUMN     "allocation_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "note" TEXT,
    "status" "PasswordResetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_status_idx" ON "password_reset_requests"("status");

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_idx" ON "password_reset_requests"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
