/*
  Warnings:

  - You are about to drop the column `mgmt_date` on the `requests` table. All the data in the column will be lost.
  - You are about to drop the column `mgmt_status` on the `requests` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "requests" DROP COLUMN "mgmt_date",
DROP COLUMN "mgmt_status";

-- CreateTable
CREATE TABLE "close_tickets" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "closed_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "close_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "close_tickets_request_id_key" ON "close_tickets"("request_id");

-- AddForeignKey
ALTER TABLE "close_tickets" ADD CONSTRAINT "close_tickets_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
