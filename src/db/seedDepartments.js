"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEPARTMENTS = [
  "Academics-Assam", "Academics-Karnataka", "Academics-Mizoram", "Academics-Telangana",
  "Academics-Tripura", "Academics-Uttarakhand",
  "Accounts-A", "Accounts-G", "Animation",
  "Broadcasting-Assam", "Broadcasting-Karnataka", "Broadcasting-Mizoram", "Broadcasting-Telangana",
  "Broadcasting-Tripura", "Broadcasting-Uttarakhand",
  "Business Development", "Corporate Communications", "Documentation",
  "Facilities", "Food Committee", "Game Development", "Govt. Relations",
  "HR", "Interns", "Management", "Marketing",
  "Operations-Assam", "Operations-Bihar", "Operations-Karnataka", "Operations-Maharashtra",
  "Operations-Mizoram", "Operations-Nagaland", "Operations-Sundargarh Odisha",
  "Operations-Tripura", "Operations-Uttarakhand",
  "Purchase", "RTS Help Desk", "Software",
  "Stores-Assam", "Stores-Karnataka", "Stores-Mizoram", "Stores-Tripura", "Stores-Uttarakhand",
  "System Admin-Assam", "System Admin-Karnataka", "System Admin-Uttarakhand",
  "TA Committee", "Technical Support",
];

async function main() {
  console.log(`Seeding ${DEPARTMENTS.length} departments…`);
  let created = 0, skipped = 0;
  for (const name of DEPARTMENTS) {
    try {
      await prisma.department.upsert({
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
