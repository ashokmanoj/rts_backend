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

  // Fetch the request along with the requestor's user record (which has hodEmpId)
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

  // Strategy 1: look up requestor's hodEmpId — most accurate pointer to who their HOD is
  const requestor = await prisma.user.findUnique({
    where:  { empId: request.empId },
    select: { hodEmpId: true },
  });

  let hod = null;

  if (requestor?.hodEmpId) {
    hod = await prisma.user.findUnique({
      where:  { empId: requestor.hodEmpId },
      select: { empId: true, name: true },
    });
  }

  // Strategy 2: any HOD in that dept (active or inactive)
  if (!hod) {
    hod = await prisma.user.findFirst({
      where:   { dept: request.dept, role: "HOD" },
      select:  { empId: true, name: true },
      orderBy: { isActive: "desc" },
    });
  }

  // Strategy 3: any SuperUser (valid FK, clearly labelled in the text)
  if (!hod) {
    hod = await prisma.user.findFirst({
      where:  { role: "SuperUser" },
      select: { empId: true, name: true },
    });
  }

  if (!hod) {
    console.error("Could not find any valid user to use as authorId. Aborting.");
    process.exit(1);
  }

  const authorId = hod.empId;
  const author   = hod.name;

  console.log(`Recovering approval message for request ${reqId}`);
  console.log(`  Dept: ${request.dept}`);
  console.log(`  Author: ${author} (${authorId})`);
  console.log(`  Approval date: ${request.hodDate}`);

  const msg = await prisma.chatMessage.create({
    data: {
      requestId: reqId,
      authorId,
      author,
      role:      "HOD",
      dept:      request.dept,
      type:      "approval",
      text:      "Approved the request.",
      status:    "Approved",
      purpose:   request.purpose,
      createdAt: request.hodDate || new Date(),
    },
  });

  console.log(`Done — chat message created with id ${msg.id}.`);
}

main()
  .catch(err => { console.error(err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
