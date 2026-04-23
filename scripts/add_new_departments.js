/**
 * rts_backend/scripts/add_new_departments.js
 * =============================================================================
 * Adds missing departments and their DeptHOD logins:
 * 1. TA Committee   -> tacommittee@rts.com
 * 2. Food Committee -> foodcommittee@rts.com
 * 3. RTS Help Desk  -> rtshelpdesk@rts.com
 *
 * Run:  node scripts/add_new_departments.js
 * =============================================================================
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const NEW_DEPTS = [
  {
    empId: "DHOD-TACOM",
    name: "TA Committee DeptHOD",
    email: "tacommittee@rts.com",
    dept: "TA Committee",
    role: "DeptHOD",
    designation: "Department Head",
    location: "HQ"
  },
  {
    empId: "DHOD-FOODC",
    name: "Food Committee DeptHOD",
    email: "foodcommittee@rts.com",
    dept: "Food Committee",
    role: "DeptHOD",
    designation: "Department Head",
    location: "HQ"
  },
  {
    empId: "DHOD-RTSHD",
    name: "RTS Help Desk DeptHOD",
    email: "rtshelpdesk@rts.com",
    dept: "RTS Help Desk",
    role: "DeptHOD",
    designation: "Department Head",
    location: "HQ"
  }
];

async function main() {
  console.log("🚀 Adding new departments and DeptHOD logins...");
  const passwordHash = await bcrypt.hash("Test@123", 10);

  for (const dept of NEW_DEPTS) {
    console.log(`Creating/Updating DeptHOD for: ${dept.dept} (${dept.email})`);
    
    await prisma.user.upsert({
      where: { email: dept.email },
      update: {
        empId: dept.empId,
        name: dept.name,
        dept: dept.dept,
        role: dept.role,
        designation: dept.designation,
        location: dept.location,
      },
      create: {
        empId: dept.empId,
        name: dept.name,
        email: dept.email.toLowerCase(),
        passwordHash: passwordHash,
        dept: dept.dept,
        role: dept.role,
        designation: dept.designation,
        location: dept.location,
      },
    });
  }

  console.log("✅ All new departments and DeptHODs added successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Error adding departments:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
