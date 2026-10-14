"use strict";

/**
 * One-time migration: close out existing broadcast tickets.
 *
 * Broadcasts are created closed, but before this fix `acknowledgement` was left
 * empty, so the UI showed them as waiting for requestor acknowledgement.
 * New broadcasts are now created with acknowledgement = "Resolved"; this script
 * applies the same to the ones already sent.
 */

const prisma = require("./src/config/database");

async function run() {
  const result = await prisma.request.updateMany({
    where: { requestorRole: "broadcast", acknowledgement: null },
    data:  { acknowledgement: "Resolved", acknowledgedAt: new Date(), isClosed: true },
  });

  console.log(`Done. Broadcast tickets closed: ${result.count}`);
}

run()
  .catch(err => { console.error("Migration failed:", err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
