-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Requestor', 'RM', 'HOD', 'DeptHOD', 'Management', 'Admin');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('message', 'file', 'voice', 'mixed', 'approval', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "emp_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Requestor',
    "dept" TEXT NOT NULL,
    "designation" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "dept" TEXT NOT NULL,
    "assigned_dept" TEXT NOT NULL,
    "rm_status" TEXT NOT NULL DEFAULT '--',
    "rm_date" TIMESTAMP(3),
    "hod_status" TEXT NOT NULL DEFAULT '--',
    "hod_date" TIMESTAMP(3),
    "dept_hod_status" TEXT NOT NULL DEFAULT '--',
    "dept_hod_date" TIMESTAMP(3),
    "mgmt_status" TEXT NOT NULL DEFAULT '--',
    "mgmt_date" TIMESTAMP(3),
    "forwarded" BOOLEAN NOT NULL DEFAULT false,
    "forwarded_by" TEXT,
    "forwarded_at" TIMESTAMP(3),
    "assigned_status" TEXT NOT NULL DEFAULT 'Open',
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "resolved_date" TIMESTAMP(3),
    "resolved_by" TEXT DEFAULT '-',
    "seen" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "author_id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'message',
    "text" TEXT DEFAULT '',
    "file_url" TEXT,
    "file_name" TEXT,
    "is_image" BOOLEAN NOT NULL DEFAULT false,
    "voice_url" TEXT,
    "duration" TEXT,
    "status" TEXT,
    "purpose" TEXT,
    "changed_dept" TEXT,
    "original_dept" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_emp_id_key" ON "users"("emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "requests_emp_id_idx" ON "requests"("emp_id");

-- CreateIndex
CREATE INDEX "requests_assigned_dept_idx" ON "requests"("assigned_dept");

-- CreateIndex
CREATE INDEX "chat_messages_request_id_idx" ON "chat_messages"("request_id");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "users"("emp_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("emp_id") ON DELETE RESTRICT ON UPDATE CASCADE;
