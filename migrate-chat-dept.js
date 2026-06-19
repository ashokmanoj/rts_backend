/**
 * One-time migration: backfill `dept` on chat messages where it is NULL.
 * Run ONCE with: node migrate-chat-dept.js
 */
"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Find all chat messages with null dept that have an authorId we can look up
  const messages = await prisma.chatMessage.findMany({
    where: { dept: null },
    select: { id: true, authorId: true, author: true, role: true },
  });

  console.log(`Found ${messages.length} messages with null dept`);

  // Collect unique authorIds
  const authorIds = [...new Set(messages.map(m => m.authorId))];

  // Fetch employees in one query
  const employees = await prisma.employee.findMany({
    where: { empId: { in: authorIds } },
    select: { empId: true, dept: true },
  });

  const deptMap = {};
  for (const e of employees) deptMap[e.empId] = e.dept;

  let updated = 0;
  let skipped = 0;

  for (const msg of messages) {
    const dept = deptMap[msg.authorId];
    if (!dept) { skipped++; continue; }

    await prisma.chatMessage.update({
      where: { id: msg.id },
      data:  { dept },
    });
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Skipped (no employee record): ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
