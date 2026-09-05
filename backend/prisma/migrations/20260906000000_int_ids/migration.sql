-- DropForeignKey
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_salary_structure_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_resolved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payruns" DROP CONSTRAINT "payruns_salary_structure_id_fkey";

-- DropForeignKey
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_payslip_id_fkey";

-- DropForeignKey
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_salary_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_payrun_id_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "salary_rules" DROP CONSTRAINT "salary_rules_salary_structure_id_fkey";

-- DropForeignKey
ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_time_off_type_id_fkey";

-- DropForeignKey
ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_time_off_type_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_employee_id_fkey";

-- AlterTable
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER NOT NULL,
ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "actor_user_id",
ADD COLUMN     "actor_user_id" INTEGER,
ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER NOT NULL,
DROP COLUMN "salary_structure_id",
ADD COLUMN     "salary_structure_id" INTEGER,
ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "employees" DROP CONSTRAINT "employees_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "manager_id",
ADD COLUMN     "manager_id" INTEGER,
DROP COLUMN "schedule_id",
ADD COLUMN     "schedule_id" INTEGER,
ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER,
DROP COLUMN "resolved_by_id",
ADD COLUMN     "resolved_by_id" INTEGER,
ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payruns" DROP CONSTRAINT "payruns_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "salary_structure_id",
ADD COLUMN     "salary_structure_id" INTEGER NOT NULL,
ADD CONSTRAINT "payruns_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "payslip_id",
ADD COLUMN     "payslip_id" INTEGER NOT NULL,
DROP COLUMN "salary_rule_id",
ADD COLUMN     "salary_rule_id" INTEGER NOT NULL,
ADD CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "payrun_id",
ADD COLUMN     "payrun_id" INTEGER NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER NOT NULL,
DROP COLUMN "contract_id",
ADD COLUMN     "contract_id" INTEGER NOT NULL,
ADD CONSTRAINT "payslips_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER NOT NULL,
ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "salary_rules" DROP CONSTRAINT "salary_rules_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "salary_structure_id",
ADD COLUMN     "salary_structure_id" INTEGER NOT NULL,
ADD CONSTRAINT "salary_rules_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "salary_structures" DROP CONSTRAINT "salary_structures_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER NOT NULL,
DROP COLUMN "time_off_type_id",
ADD COLUMN     "time_off_type_id" INTEGER NOT NULL,
ADD CONSTRAINT "time_off_allocations_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER NOT NULL,
DROP COLUMN "time_off_type_id",
ADD COLUMN     "time_off_type_id" INTEGER NOT NULL,
DROP COLUMN "allocation_id",
ADD COLUMN     "allocation_id" INTEGER,
ADD CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "time_off_types" DROP CONSTRAINT "time_off_types_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "time_off_types_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "employee_id",
ADD COLUMN     "employee_id" INTEGER,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "working_schedules" DROP CONSTRAINT "working_schedules_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "working_schedules_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "attendances_employee_id_idx" ON "attendances"("employee_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "contracts_employee_id_idx" ON "contracts"("employee_id");

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_idx" ON "password_reset_requests"("user_id");

-- CreateIndex
CREATE INDEX "payslip_lines_payslip_id_idx" ON "payslip_lines"("payslip_id");

-- CreateIndex
CREATE INDEX "payslips_employee_id_idx" ON "payslips"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrun_id_employee_id_key" ON "payslips"("payrun_id", "employee_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "salary_rules_salary_structure_id_sequence_idx" ON "salary_rules"("salary_structure_id", "sequence");

-- CreateIndex
CREATE INDEX "time_off_allocations_employee_id_idx" ON "time_off_allocations"("employee_id");

-- CreateIndex
CREATE INDEX "time_off_requests_employee_id_idx" ON "time_off_requests"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "working_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_allocations" ADD CONSTRAINT "time_off_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_allocations" ADD CONSTRAINT "time_off_allocations_time_off_type_id_fkey" FOREIGN KEY ("time_off_type_id") REFERENCES "time_off_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_time_off_type_id_fkey" FOREIGN KEY ("time_off_type_id") REFERENCES "time_off_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_rules" ADD CONSTRAINT "salary_rules_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payruns" ADD CONSTRAINT "payruns_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrun_id_fkey" FOREIGN KEY ("payrun_id") REFERENCES "payruns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_salary_rule_id_fkey" FOREIGN KEY ("salary_rule_id") REFERENCES "salary_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Golden Rule #1, restored. Prisma's diff has no knowledge of this constraint
-- (it isn't expressible in the Prisma schema), so dropping and recreating
-- contracts.employee_id above silently took the exclusion constraint with it.
-- Without this block, overlapping ACTIVE contracts for one employee become
-- possible again and period-based contract resolution loses its guarantee.
-- btree_gist compares int equality just as well as text, so the only change
-- from the original definition is the column's underlying type.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_no_overlapping_active_ranges"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("start_date", COALESCE("end_date", 'infinity'::date), '[]') WITH &&
  )
  WHERE ("status" = 'ACTIVE'::"ContractStatus");
