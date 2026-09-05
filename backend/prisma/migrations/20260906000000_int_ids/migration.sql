-- The original version of this migration dropped every id/foreign-key column
-- and replaced it with a brand new column of the same name -- with no data
-- migration at all. That fails outright on any table that already has rows
-- (the new NOT NULL column has nothing to fill it with), and even where it
-- doesn't fail, the "new" ids it invents bear no relation to each other
-- across tables, so every foreign key would silently point at the wrong row.
-- Rewritten so every table gets a new integer id backfilled by a sequence,
-- and every foreign-key column is backfilled by joining the old text id to
-- the new integer id before any old column is dropped.

-- Phase 1: drop everything that depends on the old id/fk columns.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_no_overlapping_active_ranges";

ALTER TABLE "attendances" DROP CONSTRAINT "attendances_employee_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_fkey";
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_employee_id_fkey";
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_salary_structure_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT "employees_manager_id_fkey";
ALTER TABLE "employees" DROP CONSTRAINT "employees_schedule_id_fkey";
ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_resolved_by_id_fkey";
ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_user_id_fkey";
ALTER TABLE "payruns" DROP CONSTRAINT "payruns_salary_structure_id_fkey";
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_payslip_id_fkey";
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_salary_rule_id_fkey";
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_contract_id_fkey";
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_employee_id_fkey";
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_payrun_id_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey";
ALTER TABLE "salary_rules" DROP CONSTRAINT "salary_rules_salary_structure_id_fkey";
ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_employee_id_fkey";
ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_time_off_type_id_fkey";
ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_employee_id_fkey";
ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_time_off_type_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_employee_id_fkey";

-- Phase 2: give every table a new integer id. ADD COLUMN ... SERIAL
-- auto-populates every existing row via nextval(), so this alone assigns a
-- unique integer to every row without touching the old "id" column yet.
ALTER TABLE "working_schedules" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "salary_structures" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "time_off_types" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "employees" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "users" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "contracts" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "attendances" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "time_off_allocations" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "time_off_requests" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "salary_rules" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "payruns" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "payslips" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "payslip_lines" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "refresh_tokens" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "audit_logs" ADD COLUMN "id_int" SERIAL;
ALTER TABLE "password_reset_requests" ADD COLUMN "id_int" SERIAL;

-- Phase 3: matching integer foreign-key columns, empty for now.
ALTER TABLE "employees" ADD COLUMN "manager_id_int" INTEGER;
ALTER TABLE "employees" ADD COLUMN "schedule_id_int" INTEGER;
ALTER TABLE "users" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "contracts" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "contracts" ADD COLUMN "salary_structure_id_int" INTEGER;
ALTER TABLE "attendances" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "time_off_allocations" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "time_off_allocations" ADD COLUMN "time_off_type_id_int" INTEGER;
ALTER TABLE "time_off_requests" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "time_off_requests" ADD COLUMN "time_off_type_id_int" INTEGER;
ALTER TABLE "time_off_requests" ADD COLUMN "allocation_id_int" INTEGER;
ALTER TABLE "salary_rules" ADD COLUMN "salary_structure_id_int" INTEGER;
ALTER TABLE "payruns" ADD COLUMN "salary_structure_id_int" INTEGER;
ALTER TABLE "payslips" ADD COLUMN "payrun_id_int" INTEGER;
ALTER TABLE "payslips" ADD COLUMN "employee_id_int" INTEGER;
ALTER TABLE "payslips" ADD COLUMN "contract_id_int" INTEGER;
ALTER TABLE "payslip_lines" ADD COLUMN "payslip_id_int" INTEGER;
ALTER TABLE "payslip_lines" ADD COLUMN "salary_rule_id_int" INTEGER;
ALTER TABLE "refresh_tokens" ADD COLUMN "user_id_int" INTEGER;
ALTER TABLE "audit_logs" ADD COLUMN "actor_user_id_int" INTEGER;
ALTER TABLE "password_reset_requests" ADD COLUMN "user_id_int" INTEGER;
ALTER TABLE "password_reset_requests" ADD COLUMN "resolved_by_id_int" INTEGER;

-- Phase 4: backfill every foreign-key column by joining the old text id to
-- the new integer id assigned in phase 2. This is the step the original
-- migration skipped, and the reason it silently broke every relationship.
UPDATE "employees" c SET "manager_id_int" = p."id_int" FROM "employees" p WHERE c."manager_id" = p."id";
UPDATE "employees" c SET "schedule_id_int" = p."id_int" FROM "working_schedules" p WHERE c."schedule_id" = p."id";
UPDATE "users" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "contracts" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "contracts" c SET "salary_structure_id_int" = p."id_int" FROM "salary_structures" p WHERE c."salary_structure_id" = p."id";
UPDATE "attendances" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "time_off_allocations" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "time_off_allocations" c SET "time_off_type_id_int" = p."id_int" FROM "time_off_types" p WHERE c."time_off_type_id" = p."id";
UPDATE "time_off_requests" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "time_off_requests" c SET "time_off_type_id_int" = p."id_int" FROM "time_off_types" p WHERE c."time_off_type_id" = p."id";
UPDATE "time_off_requests" c SET "allocation_id_int" = p."id_int" FROM "time_off_allocations" p WHERE c."allocation_id" = p."id";
UPDATE "salary_rules" c SET "salary_structure_id_int" = p."id_int" FROM "salary_structures" p WHERE c."salary_structure_id" = p."id";
UPDATE "payruns" c SET "salary_structure_id_int" = p."id_int" FROM "salary_structures" p WHERE c."salary_structure_id" = p."id";
UPDATE "payslips" c SET "payrun_id_int" = p."id_int" FROM "payruns" p WHERE c."payrun_id" = p."id";
UPDATE "payslips" c SET "employee_id_int" = p."id_int" FROM "employees" p WHERE c."employee_id" = p."id";
UPDATE "payslips" c SET "contract_id_int" = p."id_int" FROM "contracts" p WHERE c."contract_id" = p."id";
UPDATE "payslip_lines" c SET "payslip_id_int" = p."id_int" FROM "payslips" p WHERE c."payslip_id" = p."id";
UPDATE "payslip_lines" c SET "salary_rule_id_int" = p."id_int" FROM "salary_rules" p WHERE c."salary_rule_id" = p."id";
UPDATE "refresh_tokens" c SET "user_id_int" = p."id_int" FROM "users" p WHERE c."user_id" = p."id";
UPDATE "audit_logs" c SET "actor_user_id_int" = p."id_int" FROM "users" p WHERE c."actor_user_id" = p."id";
UPDATE "password_reset_requests" c SET "user_id_int" = p."id_int" FROM "users" p WHERE c."user_id" = p."id";
UPDATE "password_reset_requests" c SET "resolved_by_id_int" = p."id_int" FROM "users" p WHERE c."resolved_by_id" = p."id";

-- Phase 5: drop the old pkey + old text columns on every table, then
-- promote each *_int column into the name it's replacing.
ALTER TABLE "working_schedules" DROP CONSTRAINT "working_schedules_pkey", DROP COLUMN "id";
ALTER TABLE "working_schedules" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "working_schedules" ADD CONSTRAINT "working_schedules_pkey" PRIMARY KEY ("id");

ALTER TABLE "salary_structures" DROP CONSTRAINT "salary_structures_pkey", DROP COLUMN "id";
ALTER TABLE "salary_structures" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id");

ALTER TABLE "time_off_types" DROP CONSTRAINT "time_off_types_pkey", DROP COLUMN "id";
ALTER TABLE "time_off_types" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "time_off_types" ADD CONSTRAINT "time_off_types_pkey" PRIMARY KEY ("id");

ALTER TABLE "employees" DROP CONSTRAINT "employees_pkey", DROP COLUMN "id", DROP COLUMN "manager_id", DROP COLUMN "schedule_id";
ALTER TABLE "employees" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "employees" RENAME COLUMN "manager_id_int" TO "manager_id";
ALTER TABLE "employees" RENAME COLUMN "schedule_id_int" TO "schedule_id";
ALTER TABLE "employees" ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");

ALTER TABLE "users" DROP CONSTRAINT "users_pkey", DROP COLUMN "id", DROP COLUMN "employee_id";
ALTER TABLE "users" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "users" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

ALTER TABLE "contracts" DROP CONSTRAINT "contracts_pkey", DROP COLUMN "id", DROP COLUMN "employee_id", DROP COLUMN "salary_structure_id";
ALTER TABLE "contracts" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "contracts" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "contracts" RENAME COLUMN "salary_structure_id_int" TO "salary_structure_id";
ALTER TABLE "contracts" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");

ALTER TABLE "attendances" DROP CONSTRAINT "attendances_pkey", DROP COLUMN "id", DROP COLUMN "employee_id";
ALTER TABLE "attendances" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "attendances" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "attendances" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");

ALTER TABLE "time_off_allocations" DROP CONSTRAINT "time_off_allocations_pkey", DROP COLUMN "id", DROP COLUMN "employee_id", DROP COLUMN "time_off_type_id";
ALTER TABLE "time_off_allocations" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "time_off_allocations" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "time_off_allocations" RENAME COLUMN "time_off_type_id_int" TO "time_off_type_id";
ALTER TABLE "time_off_allocations" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "time_off_allocations" ALTER COLUMN "time_off_type_id" SET NOT NULL;
ALTER TABLE "time_off_allocations" ADD CONSTRAINT "time_off_allocations_pkey" PRIMARY KEY ("id");

ALTER TABLE "time_off_requests" DROP CONSTRAINT "time_off_requests_pkey", DROP COLUMN "id", DROP COLUMN "employee_id", DROP COLUMN "time_off_type_id", DROP COLUMN "allocation_id";
ALTER TABLE "time_off_requests" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "time_off_requests" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "time_off_requests" RENAME COLUMN "time_off_type_id_int" TO "time_off_type_id";
ALTER TABLE "time_off_requests" RENAME COLUMN "allocation_id_int" TO "allocation_id";
ALTER TABLE "time_off_requests" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "time_off_requests" ALTER COLUMN "time_off_type_id" SET NOT NULL;
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE "salary_rules" DROP CONSTRAINT "salary_rules_pkey", DROP COLUMN "id", DROP COLUMN "salary_structure_id";
ALTER TABLE "salary_rules" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "salary_rules" RENAME COLUMN "salary_structure_id_int" TO "salary_structure_id";
ALTER TABLE "salary_rules" ALTER COLUMN "salary_structure_id" SET NOT NULL;
ALTER TABLE "salary_rules" ADD CONSTRAINT "salary_rules_pkey" PRIMARY KEY ("id");

ALTER TABLE "payruns" DROP CONSTRAINT "payruns_pkey", DROP COLUMN "id", DROP COLUMN "salary_structure_id";
ALTER TABLE "payruns" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "payruns" RENAME COLUMN "salary_structure_id_int" TO "salary_structure_id";
ALTER TABLE "payruns" ALTER COLUMN "salary_structure_id" SET NOT NULL;
ALTER TABLE "payruns" ADD CONSTRAINT "payruns_pkey" PRIMARY KEY ("id");

ALTER TABLE "payslips" DROP CONSTRAINT "payslips_pkey", DROP COLUMN "id", DROP COLUMN "payrun_id", DROP COLUMN "employee_id", DROP COLUMN "contract_id";
ALTER TABLE "payslips" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "payslips" RENAME COLUMN "payrun_id_int" TO "payrun_id";
ALTER TABLE "payslips" RENAME COLUMN "employee_id_int" TO "employee_id";
ALTER TABLE "payslips" RENAME COLUMN "contract_id_int" TO "contract_id";
ALTER TABLE "payslips" ALTER COLUMN "payrun_id" SET NOT NULL;
ALTER TABLE "payslips" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "payslips" ALTER COLUMN "contract_id" SET NOT NULL;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_pkey" PRIMARY KEY ("id");

ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_pkey", DROP COLUMN "id", DROP COLUMN "payslip_id", DROP COLUMN "salary_rule_id";
ALTER TABLE "payslip_lines" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "payslip_lines" RENAME COLUMN "payslip_id_int" TO "payslip_id";
ALTER TABLE "payslip_lines" RENAME COLUMN "salary_rule_id_int" TO "salary_rule_id";
ALTER TABLE "payslip_lines" ALTER COLUMN "payslip_id" SET NOT NULL;
ALTER TABLE "payslip_lines" ALTER COLUMN "salary_rule_id" SET NOT NULL;
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id");

ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_pkey", DROP COLUMN "id", DROP COLUMN "user_id";
ALTER TABLE "refresh_tokens" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "refresh_tokens" RENAME COLUMN "user_id_int" TO "user_id";
ALTER TABLE "refresh_tokens" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey", DROP COLUMN "id", DROP COLUMN "actor_user_id";
ALTER TABLE "audit_logs" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "audit_logs" RENAME COLUMN "actor_user_id_int" TO "actor_user_id";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE "password_reset_requests" DROP CONSTRAINT "password_reset_requests_pkey", DROP COLUMN "id", DROP COLUMN "user_id", DROP COLUMN "resolved_by_id";
ALTER TABLE "password_reset_requests" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "password_reset_requests" RENAME COLUMN "user_id_int" TO "user_id";
ALTER TABLE "password_reset_requests" RENAME COLUMN "resolved_by_id_int" TO "resolved_by_id";
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id");

-- Phase 6: indexes (unchanged from the intended final schema).
CREATE INDEX "attendances_employee_id_idx" ON "attendances"("employee_id");
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "contracts_employee_id_idx" ON "contracts"("employee_id");
CREATE INDEX "password_reset_requests_user_id_idx" ON "password_reset_requests"("user_id");
CREATE INDEX "payslip_lines_payslip_id_idx" ON "payslip_lines"("payslip_id");
CREATE INDEX "payslips_employee_id_idx" ON "payslips"("employee_id");
CREATE UNIQUE INDEX "payslips_payrun_id_employee_id_key" ON "payslips"("payrun_id", "employee_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "salary_rules_salary_structure_id_sequence_idx" ON "salary_rules"("salary_structure_id", "sequence");
CREATE INDEX "time_off_allocations_employee_id_idx" ON "time_off_allocations"("employee_id");
CREATE INDEX "time_off_requests_employee_id_idx" ON "time_off_requests"("employee_id");
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- Phase 7: foreign keys, restored against the new integer columns.
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "working_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_off_allocations" ADD CONSTRAINT "time_off_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_off_allocations" ADD CONSTRAINT "time_off_allocations_time_off_type_id_fkey" FOREIGN KEY ("time_off_type_id") REFERENCES "time_off_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_time_off_type_id_fkey" FOREIGN KEY ("time_off_type_id") REFERENCES "time_off_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_rules" ADD CONSTRAINT "salary_rules_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payruns" ADD CONSTRAINT "payruns_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrun_id_fkey" FOREIGN KEY ("payrun_id") REFERENCES "payruns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_salary_rule_id_fkey" FOREIGN KEY ("salary_rule_id") REFERENCES "salary_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Golden Rule #1, restored. Prisma's diff has no knowledge of this constraint
-- (it isn't expressible in the Prisma schema), and dropping contracts.id /
-- contracts.employee_id above took it with it same as before. btree_gist
-- compares int equality just as well as text, so the only change from the
-- original definition is the columns' underlying type.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_no_overlapping_active_ranges"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("start_date", COALESCE("end_date", 'infinity'::date), '[]') WITH &&
  )
  WHERE ("status" = 'ACTIVE'::"ContractStatus");
