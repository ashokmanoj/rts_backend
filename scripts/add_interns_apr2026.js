/**
 * rts_backend/scripts/add_interns_apr2026.js
 * =============================================================================
 * Adds a list of interns provided on April 21, 2026.
 *
 * Run:  node scripts/add_interns_apr2026.js
 * =============================================================================
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const INTERNS_TO_ADD = [
  {
    empId: "AI-2315",
    name: "Sahana M",
    email: "sahanasahana88155@gmail.com",
    phone: "9108964977 / 8296103286",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2318",
    name: "RangaLakshmi GN",
    email: "rangalakshmign@gmail.com",
    phone: "8217768753",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2319",
    name: "Rachana V",
    email: "rachanav622001@gmail.com",
    phone: "7760904907",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2320",
    name: "Vaishnavi L",
    email: "raovaishnavi65@gmail.com",
    phone: "9986614685",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2325",
    name: "Deepa Hegde",
    email: "deepahegde2000@yahoo.com",
    phone: "8310392046",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2327",
    name: "Sathya",
    email: "sathu4163@gmail.com",
    phone: "7829991944",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2331",
    name: "Roopa H S",
    email: "roopahs34@gmail.com",
    phone: "89516 40663",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2333",
    name: "Spoorthi",
    email: "spoorthisiddappa1725@gmail.com",
    phone: "7411 839 125",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN - Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2337",
    name: "Chandra Choodeshwara",
    email: "sandrachoodeshwara@gmail.com",
    phone: "6380488836",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Designer Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2338",
    name: "Prasanta Verma",
    email: "vprasant8@gmail.com",
    phone: "7003245288",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Designer Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2339",
    name: "Tejas Rakibe",
    email: "tejasrakibe8@gmail.com",
    phone: "9322958432",
    dept: "Interns",
    role: "Requestor",
    designation: "3D Artist Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2340",
    name: "Bisal Shah",
    email: "bisalshah536@gmail.com",
    phone: "87308 37936",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2341",
    name: "Udaykumar Hampannavar",
    email: "udaykumar89905@gmail.com",
    phone: "76769 07106",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2342",
    name: "Ajay M",
    email: "ajaykumarm76766@gmail.com",
    phone: "76766 84645",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2343",
    name: "Saptadip Roy",
    email: "roysaptadip7098@gmail.com",
    phone: "8240744545",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Designer Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2344",
    name: "Roshan Kumar",
    email: "roshankumar1676@gmail.com",
    phone: "7259615023",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2345",
    name: "Prajwal Gowda",
    email: "prajwalgowdagowda65@gmail.com",
    phone: "866 038 5369",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2346",
    name: "Lavanya",
    email: "lavanyar2926@gmail.com",
    phone: "6360980290",
    dept: "Interns",
    role: "Requestor",
    designation: "FLN - Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2347",
    name: "Yash Jadhav",
    email: "yashdjadhav85@gmail.com",
    phone: "8275710488",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  },
  {
    empId: "AI-2348",
    name: "Madhavn T",
    email: "madhavan6148@gmail.com",
    phone: "8015624567",
    dept: "Interns",
    role: "Requestor",
    designation: "Game Developer-Intern",
    location: "Bangalore"
  }
];

async function main() {
  console.log("🚀 Starting to add interns (Dept: Interns)...");
  const defaultPasswordHash = await bcrypt.hash("Test@123", 10);

  for (const intern of INTERNS_TO_ADD) {
    console.log(`Creating/Updating intern: ${intern.name} (${intern.empId})`);
    
    await prisma.user.upsert({
      where: { empId: intern.empId },
      update: {
        name: intern.name,
        email: intern.email.toLowerCase(),
        phone: intern.phone,
        dept: intern.dept,
        role: intern.role,
        designation: intern.designation,
        location: intern.location,
      },
      create: {
        empId: intern.empId,
        name: intern.name,
        email: intern.email.toLowerCase(),
        phone: intern.phone,
        passwordHash: defaultPasswordHash,
        dept: intern.dept,
        role: intern.role,
        designation: intern.designation,
        location: intern.location,
      },
    });
  }

  console.log("✅ All interns added/updated successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Error adding interns:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
