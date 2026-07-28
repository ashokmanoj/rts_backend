"use strict";
/**
 * One-time recovery script: inserts missing HOD approval chat message for request #1260.
 *
 * Run once against production:
 *   node src/db/recoverApprovalChat.js
 */

const prisma = require("../config/database");

async function main() {
  const reqId = 1260;

  // Fetch the request
  const request = await prisma.request.findUnique({
    where: { id: reqId },
    select: { empId: true, dept: true, hodStatus: true, hodDate: true, purpose: true },
  });

  if (!request) {
    console.error(`Request ${reqId} not found.`);
    process.exit(1);
  }

  if (request.hodStatus !== "Approved") {
    console.log(`hodStatus is "${request.hodStatus}", not "Approved" — nothing to recover.`);
    process.exit(0);
  }

  // Check if the approval chat message already exists
  const existing = await prisma.chatMessage.findFirst({
    where: { requestId: reqId, type: "approval", status: "Approved" },
  });

  if (existing) {
    console.log("Approval chat message already exists, no action needed.");
    process.exit(0);
  }

  // Find the HOD of the requestor's department
  const hod = await prisma.user.findFirst({
    where: { dept: request.dept, role: "HOD", isActive: true },
    select: { empId: true, name: true },
  });

  let authorId = hod?.empId || "UNKNOWN";
  let author   = hod?.name  || "HOD";

  console.log(`Recovering approval message for request ${reqId}`);
  console.log(`  Dept: ${request.dept}`);
  console.log(`  HOD found: ${author} (${authorId})`);
  console.log(`  Approval date: ${request.hodDate}`);

  const msg = await prisma.chatMessage.create({
    data: {
      requestId:    reqId,
      authorId,
      author,
      role:         "HOD",
      dept:         request.dept,
      type:         "approval",
      text:         "Approved the request.",
      status:       "Approved",
      purpose:      request.purpose,
      createdAt:    request.hodDate || new Date(),
    },
  });

  console.log(`Done — chat message created with id ${msg.id}.`);
}

main()
  .catch(err => { console.error(err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
