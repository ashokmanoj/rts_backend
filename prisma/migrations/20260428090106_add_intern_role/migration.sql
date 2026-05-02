/*
  Warnings:

  - You are about to drop the column `seen` on the `requests` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[reset_password_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'HR';
ALTER TYPE "Role" ADD VALUE 'FoodCommittee';
ALTER TYPE "Role" ADD VALUE 'Intern';

-- AlterTable
ALTER TABLE "requests" DROP COLUMN "seen",
ADD COLUMN     "requestor_role" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hod_emp_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_login" TIMESTAMP(3),
ADD COLUMN     "last_seen" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "reset_password_expires" TIMESTAMP(3),
ADD COLUMN     "reset_password_token" TEXT,
ADD COLUMN     "rm_emp_id" TEXT;

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "dept" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_logs" (
    "id" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logout_at" TIMESTAMP(3),
    "duration" INTEGER DEFAULT 0,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_reads" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "emp_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_subscriptions" (
    "id" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "suspended_from" TIMESTAMP(3),
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_cancellations" (
    "id" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_emp_id_role_dept_key" ON "user_roles"("emp_id", "role", "dept");

-- CreateIndex
CREATE INDEX "login_logs_emp_id_idx" ON "login_logs"("emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_reads_request_id_emp_id_key" ON "request_reads"("request_id", "emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_subscriptions_emp_id_key" ON "food_subscriptions"("emp_id");

-- CreateIndex
CREATE INDEX "food_cancellations_emp_id_idx" ON "food_cancellations"("emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_cancellations_emp_id_week_start_date_key" ON "food_cancellations"("emp_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_password_token_key" ON "users"("reset_password_token");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rm_emp_id_fkey" FOREIGN KEY ("rm_emp_id") REFERENCES "users"("emp_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_hod_emp_id_fkey" FOREIGN KEY ("hod_emp_id") REFERENCES "users"("emp_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_reads" ADD CONSTRAINT "request_reads_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_reads" ADD CONSTRAINT "request_reads_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_subscriptions" ADD CONSTRAINT "food_subscriptions_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_cancellations" ADD CONSTRAINT "food_cancellations_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE CASCADE ON UPDATE CASCADE;
