/**
 * rts_backend/scripts/addSpecificUsers.js
 * =============================================================================
 * Adds specific users and their managers to the database.
 *
 * Run:  node scripts/addSpecificUsers.js
 * =============================================================================
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const USERS_TO_ADD = [
  // Managers first to ensure they exist for foreign keys (though we use empId strings)
  {
    empId: "GN-01",
    name: "CEO",
    email: "harsha@gumbisoftware.com",
    phone: "9243204300",
    dept: "Management",
    role: "Management",
    designation: "CEO",
    location: "Bangalore"
  },
  {
    empId: "GN-1042",
    name: "Sudhakar G Hegde",
    email: "sghegde2010@gmail.com",
    phone: "9945369696",
    dept: "HR",
    role: "HR",
    designation: "Team Lead",
    location: "Bangalore"
  },
  // The specific users
  {
    empId: "AC-1069",
    name: "Sindhu Shrikant Hegde",
    email: "sindhuhegde743118@gmail.com",
    phone: "9448451987",
    dept: "Management",
    role: "Management",
    designation: "Asst Executive - Management",
    location: "Bangalore",
    rmEmpId: "GN-01",
    hodEmpId: "GN-01"
  },
  {
    empId: "AC-1114",
    name: "Arun K G",
    email: "arunabhatkg@gmail.com",
    phone: "9535212718",
    dept: "Admin",
    role: "Requestor",
    designation: "Executive",
    location: "Bangalore",
    rmEmpId: "GN-1042",
    hodEmpId: "GN-1042"
  },
  {
    empId: "GC-1299",
    name: "Vikas V",
    email: "vikasv.9147@gmail.com",
    phone: "8861409225",
    dept: "Accounts",
    role: "Requestor",
    designation: "Senior Accountant-Cost",
    location: "Bangalore",
    rmEmpId: "GN-01",
    hodEmpId: "GN-01"
  }
];

async function main() {
  console.log("🚀 Starting to add specific users...");
  const defaultPasswordHash = await bcrypt.hash("Test@123", 10);

  for (const user of USERS_TO_ADD) {
    const { rmEmpId, hodEmpId, ...userData } = user;
    
    console.log(`Creating/Updating user: ${userData.name} (${userData.empId})`);
    
    await prisma.user.upsert({
      where: { empId: userData.empId },
      update: {
        name: userData.name,
        email: userData.email.toLowerCase(),
        phone: userData.phone,
        dept: userData.dept,
        role: userData.role,
        designation: userData.designation,
        location: userData.location,
        rmEmpId: rmEmpId || null,
        hodEmpId: hodEmpId || null,
      },
      create: {
        empId: userData.empId,
        name: userData.name,
        email: userData.email.toLowerCase(),
        phone: userData.phone,
        passwordHash: defaultPasswordHash,
        dept: userData.dept,
        role: userData.role,
        designation: userData.designation,
        location: userData.location,
        rmEmpId: rmEmpId || null,
        hodEmpId: hodEmpId || null,
      },
    });
  }

  console.log("✅ All users added/updated successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Error adding users:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
