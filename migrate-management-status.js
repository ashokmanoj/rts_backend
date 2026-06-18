"use strict";

/**
 * One-time migration: separate Management approvals from DeptHOD approvals.
 *
 * Before this fix, both Management and DeptHOD wrote to `deptHodStatus`.
 * This script reads the chat messages (which record the approver's role) to
 * reconstruct the correct state for every request:
 *
 *   managementStatus ← latest approval by a Management user
 *   deptHodStatus    ← latest approval by a DeptHOD user
 *
 * If only Management approved → deptHodStatus resets to "--"
 * If only DeptHOD approved   → managementStatus stays "--"
 * If both approved           → both fields get their respective latest values
 */

const prisma = require("./src/config/database");

async function run() {
  // Find all requests that have a non-default deptHodStatus
  const requests = await prisma.request.findMany({
    where: { deptHodStatus: { not: "--" } },
    include: {
      chatMessages: {
        where: { type: "approval" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  console.log(`Found ${requests.length} request(s) with deptHodStatus set.\n`);

  let updated = 0;
  let skipped = 0;

  for (const req of requests) {
    const mgmtMessages  = req.chatMessages.filter(m => m.role === "Management");
    const deptHodMessages = req.chatMessages.filter(m => m.role === "DeptHOD");

    if (mgmtMessages.length === 0) {
      // No Management approval chat messages — deptHodStatus was set by DeptHOD, leave it
      skipped++;
      continue;
    }

    // Latest Management approval
    const latestMgmt = mgmtMessages[mgmtMessages.length - 1];
    const mgmtStatus = latestMgmt.status || "--";
    const mgmtDate   = latestMgmt.createdAt;

    // Latest DeptHOD approval (may not exist)
    const latestDeptHod = deptHodMessages.length > 0 ? deptHodMessages[deptHodMessages.length - 1] : null;
    const newDeptHodStatus = latestDeptHod ? (latestDeptHod.status || "--") : "--";
    const newDeptHodDate   = latestDeptHod ? latestDeptHod.createdAt : null;

    console.log(`Request #${req.id}: deptHodStatus="${req.deptHodStatus}" → managementStatus="${mgmtStatus}", deptHodStatus="${newDeptHodStatus}"`);

    await prisma.request.update({
      where: { id: req.id },
      data: {
        managementStatus: mgmtStatus,
        managementDate:   mgmtDate,
        deptHodStatus:    newDeptHodStatus,
        deptHodDate:      newDeptHodDate,
      },
    });

    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (DeptHOD-only): ${skipped}`);
}

run()
  .catch(err => { console.error("Migration failed:", err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
