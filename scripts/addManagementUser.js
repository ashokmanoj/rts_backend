/**
 * scripts/addManagementUser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Run once to create the Management login if it doesn't exist yet.
 *
 * Usage:
 *   node scripts/addManagementUser.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma  = require("../src/db/prisma");

/*************  ✨ Windsurf Command ⭐  *************/
/**
 * Main function to create the Management user if it doesn't exist yet.
 *
 * @returns {Promise<void>} Resolves when the user is created or already exists.
 */
/*******  ba35057b-40d3-4d6a-9811-d151c946deb6  *******/
async function main() {
  const email    = "management@rts.com";
  const password = "Management@123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("✅  Management user already exists:", existing.empId);
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      empId:        "MGMT-001",
      name:         "Director General",
      email,
      passwordHash: hash,
      role:         "Management",
      dept:         "Management",
      designation:  "Director",
      location:     "HQ",
    },
  });

  console.log("✅  Management user created:");
  console.log("    Email   :", user.email);
  console.log("    EmpId   :", user.empId);
  console.log("    Password: Management@123");
  console.log("    Role    :", user.role);
}

main()
  .catch((err) => { console.error("❌  Error:", err.message); process.exit(1); })
  .finally(()  => prisma.$disconnect());
