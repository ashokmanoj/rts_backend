/**
 * scripts/addManagementUser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates the dedicated HOD-request management login account.
 *
 * Usage (run once from rts_backend/):
 *   node scripts/addManagementUser.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma  = require("../src/config/database");

async function main() {
  const email    = "managehodreq@rts.com";
  const password = "Management@123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("✅  HOD-request management user already exists:", existing.empId);
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      empId:        "MGMT-001",
      name:         "HOD Request Manager",
      email,
      passwordHash: hash,
      role:         "Management",
      dept:         "Management",
      designation:  "Management Admin",
      location:     "HQ",
    },
  });

  console.log("✅  HOD-request management user created:");
  console.log("    Email   :", user.email);
  console.log("    EmpId   :", user.empId);
  console.log("    Password:", password);
  console.log("    Role    :", user.role);
}

main()
  .catch((err) => { console.error("❌  Error:", err.message); process.exit(1); })
  .finally(()  => prisma.$disconnect());
