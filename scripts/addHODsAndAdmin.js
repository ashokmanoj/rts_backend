/**
 * scripts/addHODsAndAdmin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upserts all Department HODs and the System Admin into the database.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/database");

const HOD_USERS = [
  { empId:"DHOD-ACADE", name:"Academic Department HOD",                email:"academic@rts.com",                role:"DeptHOD", dept:"Academic" },
  { empId:"DHOD-ACCOU", name:"Accounts Department HOD",                email:"accounts@rts.com",                role:"DeptHOD", dept:"Accounts" },
  { empId:"DHOD-ADMIN", name:"Admin Department HOD",                   email:"admin.dept@rts.com",              role:"DeptHOD", dept:"Admin" },
  { empId:"DHOD-ANIMA", name:"Animation Department HOD",               email:"animation@rts.com",               role:"DeptHOD", dept:"Animation" },
  { empId:"DHOD-BROAD", name:"Broadcasting Department HOD",            email:"broadcasting@rts.com",            role:"DeptHOD", dept:"Broadcasting" },
  { empId:"DHOD-BUSIN", name:"Business Development Department HOD",    email:"businessdevelopment@rts.com",     role:"DeptHOD", dept:"Business Development" },
  { empId:"DHOD-CORPO", name:"Corporate Communications Department HOD",email:"corporatecommunications@rts.com", role:"DeptHOD", dept:"Corporate Communications" },
  { empId:"DHOD-DOCUM", name:"Documantation Department HOD",           email:"documantation@rts.com",           role:"DeptHOD", dept:"Documantation" },
  { empId:"DHOD-FOODC", name:"Food Committee DeptHOD",                 email:"foodcommittee@rts.com",           role:"DeptHOD", dept:"Food Committee" },
  { empId:"DHOD-GOVTR", name:"Govt. Relations Department HOD",         email:"govtrelations@rts.com",           role:"DeptHOD", dept:"Govt. Relations" },
  { empId:"DHOD-HR",    name:"HR Department HOD",                      email:"hr@rts.com",                      role:"DeptHOD", dept:"HR" },
  { empId:"DHOD-MANAG", name:"Management Department HOD",              email:"management@rts.com",              role:"DeptHOD", dept:"Management" },
  { empId:"DHOD-MARKE", name:"Marketing Department HOD",               email:"marketing@rts.com",               role:"DeptHOD", dept:"Marketing" },
  { empId:"DHOD-OPERA", name:"Operation Department HOD",               email:"operation@rts.com",               role:"DeptHOD", dept:"Operation" },
  { empId:"DHOD-PURCH", name:"Purchase Department HOD",                email:"purchase@rts.com",                role:"DeptHOD", dept:"Purchase" },
  { empId:"DHOD-RTSHD", name:"RTS Help Desk DeptHOD",                  email:"rtshelpdesk@rts.com",             role:"DeptHOD", dept:"RTS Help Desk" },
  { empId:"DHOD-SOFTW", name:"Software Department HOD",                email:"software@rts.com",                role:"DeptHOD", dept:"Software" },
  { empId:"DHOD-STORE", name:"Store Department HOD",                   email:"store@rts.com",                   role:"DeptHOD", dept:"Store" },
  { empId:"DHOD-SYSTE", name:"System admin Department HOD",            email:"systemadmin@rts.com",             role:"DeptHOD", dept:"System admin" },
  { empId:"DHOD-TACOM", name:"TA Committee DeptHOD",                   email:"tacommittee@rts.com",             role:"DeptHOD", dept:"TA Committee" },
  { empId:"DHOD-TECHN", name:"Technical Support Department HOD",       email:"technicalsupport@rts.com",        role:"DeptHOD", dept:"Technical Support" },
  { empId:"ADMIN-001",  name:"System Admin",                           email:"admin@rts.com",                   role:"Admin",   dept:"Management" },
];

async function main() {
  console.log("🚀 Starting to upsert Dept HODs and Admin...");

  for (const user of HOD_USERS) {
    const password = user.role === "Admin" ? "Admin@123" : `${user.dept.split(" ")[0]}@123`;
    const hash = await bcrypt.hash(password, 10);

    console.log(`Processing: ${user.name} (${user.empId}) -> Pass: ${password}`);

    await prisma.user.upsert({
      where: { empId: user.empId },
      update: {
        name: user.name,
        email: user.email.toLowerCase(),
        role: user.role,
        dept: user.dept,
        isActive: true,
      },
      create: {
        empId: user.empId,
        name: user.name,
        email: user.email.toLowerCase(),
        passwordHash: hash,
        role: user.role,
        dept: user.dept,
        location: "HQ",
        designation: user.role === "Admin" ? "System Administrator" : "Department Head",
        isActive: true,
      },
    });
  }

  console.log("✅ All Dept HODs and Admin have been upserted.");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
