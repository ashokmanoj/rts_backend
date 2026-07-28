"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const LOCATIONS = [
  "Agartala", "Aizawl", "Bangalore", "Bhagalpur", "Cachar",
  "Chamoli", "Dehradun", "Delhi", "Dhemaji", "Diphu",
  "Guwahati", "Hubli", "Hyderabad", "Kokrajhar", "Maharashtra",
  "Nagaland", "Silchar", "Singrauli", "Sonbhadra", "Sundargarh Odisha",
];

async function main() {
  console.log(`Seeding ${LOCATIONS.length} locations…`);
  let created = 0, skipped = 0;
  for (const name of LOCATIONS) {
    try {
      await prisma.location.upsert({
        where:  { name },
        update: {},
        create: { name },
      });
      created++;
    } catch {
      skipped++;
    }
  }
  console.log(`Done — ${created} upserted, ${skipped} skipped.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
