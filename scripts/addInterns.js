/**
 * scripts/addInterns.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upserts all interns:
 *   - If user already exists → updates role, dept, designation, location, phone
 *   - If user does not exist → creates with default password  Intern@123
 *
 * Usage (run from rts_backend/):
 *   node scripts/addInterns.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma  = require("../src/config/database");

const INTERNS = [
  { empId: "AI-2315", name: "Sahana M",               email: "sahanasahana88155@gmail.com",   dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "9108964977" },
  { empId: "AI-2318", name: "RangaLakshmi GN",        email: "rangalakshmign@gmail.com",      dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "8217768753" },
  { empId: "AI-2319", name: "Rachana V",               email: "rachanav622001@gmail.com",      dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "7760904907" },
  { empId: "AI-2320", name: "Vaishnavi L",             email: "raovaishnavi65@gmail.com",      dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "9986614685" },
  { empId: "AI-2325", name: "Deepa Hegde",             email: "deepahegde2000@yahoo.com",      dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "8310392046" },
  { empId: "AI-2327", name: "Sathya",                  email: "sathu4163@gmail.com",           dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "7829991944" },
  { empId: "AI-2331", name: "Roopa H S",               email: "roopahs34@gmail.com",           dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "8951640663" },
  { empId: "AI-2333", name: "Spoorthi",                email: "spoorthisiddappa1725@gmail.com", dept: "Academic",  designation: "FLN-Intern",            location: "Bangalore", phone: "7411839125" },
  { empId: "AI-2337", name: "Chandra Choodeshwara",    email: "sandrachoodeshwara@gmail.com",  dept: "Software",   designation: "Game Designer Intern",  location: "Bangalore", phone: "6380488836" },
  { empId: "AI-2338", name: "Prasanta Verma",          email: "vprasant8@gmail.com",           dept: "Software",   designation: "Game Designer Intern",  location: "Bangalore", phone: "7003245288" },
  { empId: "AI-2339", name: "Tejas Rakibe",            email: "tejasrakibe8@gmail.com",        dept: "Animation",  designation: "3D Artist Intern",      location: "Bangalore", phone: "9322958432" },
  { empId: "AI-2340", name: "Bisal Shah",              email: "bisalshah536@gmail.com",        dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "8730837936" },
  { empId: "AI-2341", name: "Udaykumar Hampannavar",   email: "udaykumar89905@gmail.com",      dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "7676907106" },
  { empId: "AI-2342", name: "Ajay M",                  email: "ajaykumarm76766@gmail.com",     dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "7676684645" },
  { empId: "AI-2343", name: "Saptadip Roy",            email: "roysaptadip7098@gmail.com",     dept: "Software",   designation: "Game Designer Intern",  location: "Bangalore", phone: "8240744545" },
  { empId: "AI-2344", name: "Roshan Kumar",            email: "roshankumar1676@gmail.com",     dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "7259615023" },
  { empId: "AI-2345", name: "Prajwal Gowda",           email: "prajwalgowdagowda65@gmail.com", dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "8660385369" },
  { empId: "AI-2346", name: "Lavanya",                 email: "lavanyar2926@gmail.com",        dept: "Academic",   designation: "FLN-Intern",            location: "Bangalore", phone: "6360980290" },
  { empId: "AI-2347", name: "Yash Jadhav",             email: "yashjadhav85@gmail.com",        dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "8275710488" },
  { empId: "AI-2348", name: "Madhavn T",               email: "madhavan6148@gmail.com",        dept: "Software",   designation: "Game Developer-Intern", location: "Bangalore", phone: "8015624567" },
];

async function main() {
  const DEFAULT_PASSWORD = "Intern@123";
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  let created = 0, updated = 0, failed = 0;

  for (const intern of INTERNS) {
    try {
      const exists = await prisma.user.findUnique({ where: { empId: intern.empId } });

      if (exists) {
        await prisma.user.update({
          where: { empId: intern.empId },
          data: {
            name:        intern.name,
            email:       intern.email,
            phone:       intern.phone,
            role:        "Intern",
            dept:        intern.dept,
            designation: intern.designation,
            location:    intern.location,
          },
        });
        console.log(`  UPDATED  ${intern.empId.padEnd(10)} ${intern.name}`);
        updated++;
      } else {
        await prisma.user.create({
          data: {
            empId:        intern.empId,
            name:         intern.name,
            email:        intern.email,
            phone:        intern.phone,
            passwordHash: hash,
            role:         "Intern",
            dept:         intern.dept,
            designation:  intern.designation,
            location:     intern.location,
          },
        });
        console.log(`  CREATED  ${intern.empId.padEnd(10)} ${intern.name}`);
        created++;
      }
    } catch (err) {
      console.error(`  FAILED   ${intern.empId} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone — ${created} created, ${updated} updated, ${failed} failed.`);
  if (created > 0) console.log(`Default password for new users: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => { console.error("❌  Error:", err.message); process.exit(1); })
  .finally(()  => prisma.$disconnect());
