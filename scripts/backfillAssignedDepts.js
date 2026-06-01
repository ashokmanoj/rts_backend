"use strict";
/**
 * scripts/backfillAssignedDepts.js
 *
 * Fixes existing forwarded requests that are missing assignedDepts.
 * For each forwarded request, finds the forwarding chat message's originalDept
 * and builds the full assignedDepts chain so all involved depts retain visibility.
 *
 * Run: node scripts/backfillAssignedDepts.js
 */

const prisma = require("../src/config/database");

async function main() {
  const forwarded = await prisma.request.findMany({
    where: { forwarded: true },
    include: { chatMessages: { where: { status: "Forwarded" }, orderBy: { createdAt: "asc" } } },
  });

  console.log(`\nFound ${forwarded.length} forwarded requests to check.\n`);

  let updated = 0;
  let skipped = 0;

  for (const req of forwarded) {
    // Collect all depts from forwarding chat messages
    const depts = new Set();
    for (const msg of req.chatMessages) {
      if (msg.originalDept) depts.add(msg.originalDept.trim());
      if (msg.changedDept)  depts.add(msg.changedDept.trim());
    }
    // Always include current assignedDept
    if (req.assignedDept) depts.add(req.assignedDept.trim());

    const chain = [...depts].filter(Boolean).join(",");

    if (!chain || chain === req.assignedDept) {
      skipped++;
      continue;
    }

    // Only update if assignedDepts is missing or incomplete
    const existing = req.assignedDepts ? req.assignedDepts.split(",").map(s => s.trim()).filter(Boolean) : [];
    const allAlreadyPresent = [...depts].every(d => existing.includes(d));
    if (allAlreadyPresent && existing.length > 0) {
      skipped++;
      continue;
    }

    await prisma.request.update({
      where: { id: req.id },
      data:  { assignedDepts: chain },
    });

    console.log(`  UPDATED  #${req.id}  assignedDepts: "${chain}"`);
    updated++;
  }

  console.log(`\nDone — ${updated} updated, ${skipped} already correct.\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
