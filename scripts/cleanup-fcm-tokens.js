"use strict";

/**
 * One-time script: for every user who has more than one FCM token,
 * keep only the most recently created one and delete the rest.
 *
 * Run once from the rts_backend directory:
 *   node scripts/cleanup-fcm-tokens.js
 */

const prisma = require("../src/config/database");

async function main() {
  // Find all empIds that have more than one token
  const duplicates = await prisma.fcmToken.groupBy({
    by: ["empId"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });

  if (duplicates.length === 0) {
    console.log("No duplicate FCM tokens found. Table is already clean.");
    return;
  }

  console.log(`Found ${duplicates.length} user(s) with duplicate tokens. Cleaning up…`);

  let totalDeleted = 0;

  for (const { empId } of duplicates) {
    // Get all tokens for this user, newest first
    const tokens = await prisma.fcmToken.findMany({
      where:   { empId },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });

    // Keep the first (newest), delete the rest
    const toDelete = tokens.slice(1).map(t => t.id);
    const { count } = await prisma.fcmToken.deleteMany({
      where: { id: { in: toDelete } },
    });

    console.log(`  ${empId}: deleted ${count} old token(s), kept newest.`);
    totalDeleted += count;
  }

  console.log(`\nDone. Total tokens deleted: ${totalDeleted}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
