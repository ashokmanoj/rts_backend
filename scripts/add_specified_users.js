"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Test@123", 10);

  console.log("🚀 Starting user upsert script...");

  // 1. Add CEO (GN-01)
  console.log("Upserting CEO (GN-01)...");
  await prisma.user.upsert({
    where: { empId: "GN-01" },
    update: {
      name: "CEO",
      email: "harsha@gumbisoftware.com",
      phone: "9243204300",
      role: "Management",
      dept: "Management",
      designation: "CEO",
      location: "Bangalore"
    },
    create: {
      empId: "GN-01",
      name: "CEO",
      email: "harsha@gumbisoftware.com",
      phone: "9243204300",
      passwordHash,
      role: "Management",
      dept: "Management",
      designation: "CEO",
      location: "Bangalore"
    }
  });

  // 2. Add/Update Sudhakar G Hegde (GN-1042)
  console.log("Upserting Sudhakar G Hegde (GN-1042)...");
  await prisma.user.upsert({
    where: { empId: "GN-1042" },
    update: {
      name: "Sudhakar G Hegde",
      email: "sghegde2010@gmail.com",
      phone: "9945369696",
      role: "HR", // resolveRole in seed.js says HR dept gets HR role
      dept: "HR",
      designation: "Team Lead",
      location: "Bangalore"
    },
    create: {
      empId: "GN-1042",
      name: "Sudhakar G Hegde",
      email: "sghegde2010@gmail.com",
      phone: "9945369696",
      passwordHash,
      role: "HR",
      dept: "HR",
      designation: "Team Lead",
      location: "Bangalore"
    }
  });

  // 3. Add/Update Sindhu Shrikant Hegde (AC-1069)
  console.log("Upserting Sindhu Shrikant Hegde (AC-1069)...");
  await prisma.user.upsert({
    where: { empId: "AC-1069" },
    update: {
      phone: "9448451987",
      rmEmpId: "GN-01",
      hodEmpId: "GN-01",
      role: "Management",
      dept: "Management",
      designation: "Asst Executive - Management",
      location: "Bangalore"
    },
    create: {
      empId: "AC-1069",
      name: "Sindhu Shrikant Hegde",
      email: "sindhuhegde743118@gmail.com",
      phone: "9448451987",
      passwordHash,
      role: "Management",
      dept: "Management",
      designation: "Asst Executive - Management",
      location: "Bangalore",
      rmEmpId: "GN-01",
      hodEmpId: "GN-01"
    }
  });

  // 4. Add/Update Arun K G (AC-1114)
  console.log("Upserting Arun K G (AC-1114)...");
  await prisma.user.upsert({
    where: { empId: "AC-1114" },
    update: {
      phone: "9535212718",
      rmEmpId: "GN-1042",
      hodEmpId: "GN-1042",
      role: "Requestor",
      dept: "Admin",
      designation: "Executive",
      location: "Bangalore"
    },
    create: {
      empId: "AC-1114",
      name: "Arun K G",
      email: "arunabhatkg@gmail.com",
      phone: "9535212718",
      passwordHash,
      role: "Requestor",
      dept: "Admin",
      designation: "Executive",
      location: "Bangalore",
      rmEmpId: "GN-1042",
      hodEmpId: "GN-1042"
    }
  });

  // 5. Add/Update Vikas V (GC-1299)
  console.log("Upserting Vikas V (GC-1299)...");
  await prisma.user.upsert({
    where: { empId: "GC-1299" },
    update: {
      phone: "8861409225",
      rmEmpId: "GN-01",
      hodEmpId: "GN-01",
      role: "Requestor",
      dept: "Accounts",
      designation: "Senior Accountant-Cost",
      location: "Bangalore"
    },
    create: {
      empId: "GC-1299",
      name: "Vikas V",
      email: "vikasv.9147@gmail.com",
      phone: "8861409225",
      passwordHash,
      role: "Requestor",
      dept: "Accounts",
      designation: "Senior Accountant-Cost",
      location: "Bangalore",
      rmEmpId: "GN-01",
      hodEmpId: "GN-01"
    }
  });

  console.log("✅ All users upserted successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Error upserting users:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
