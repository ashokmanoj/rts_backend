"use strict";

/**
 * scripts/seedUserRoles.js
 *
 * Seeds the user_roles table with multi-role employee data from the PDF.
 * Each row represents one (empId, role, dept) combination the user can log in as.
 *
 * PDF columns used:
 *   Requestor=Yes  → add Requestor  entry for that dept
 *   RM=Yes         → add RM         entry for that dept
 *   HOD=Yes (no DHOD-MANAG) → add HOD     entry for that dept
 *   DHOD-MANAG=Yes → add DeptHOD   entry for that dept
 *
 * Run from rts_backend folder:
 *   node scripts/seedUserRoles.js
 */

const prisma = require("../src/config/database");

const USER_ROLES = [
  // ── A-1001 — Prasanna Gajanana Hegde ─────────────────────────────────────
  { empId: "A-1001", role: "Requestor", dept: "Accounts" },
  { empId: "A-1001", role: "RM",        dept: "Accounts" },
  { empId: "A-1001", role: "HOD",       dept: "Accounts" },

  // ── AC-1378 — Pavan Verma ─────────────────────────────────────────────────
  { empId: "AC-1378", role: "Requestor", dept: "Broadcasting" },
  { empId: "AC-1378", role: "RM",        dept: "Broadcasting" },
  { empId: "AC-1378", role: "RM",        dept: "Operation" },
  { empId: "AC-1378", role: "RM",        dept: "System admin" },

  // ── AC-1103 — Nishant Bhat ────────────────────────────────────────────────
  { empId: "AC-1103", role: "Requestor", dept: "Business Development" },
  { empId: "AC-1103", role: "RM",        dept: "Operation" },

  // ── GN-1018 — Vikas Deep ─────────────────────────────────────────────────
  { empId: "GN-1018", role: "RM",        dept: "Broadcasting" },
  { empId: "GN-1018", role: "Requestor", dept: "Business Development" },

  // ── GN-1042 — Sudhakar G Hegde ───────────────────────────────────────────
  { empId: "GN-1042", role: "Requestor", dept: "HR" },
  { empId: "GN-1042", role: "RM",        dept: "HR" },
  { empId: "GN-1042", role: "HOD",       dept: "HR" },
  { empId: "GN-1042", role: "RM",        dept: "Facilities" },
  { empId: "GN-1042", role: "HOD",       dept: "Facilities" },

  // ── G-1007 — Akhilesh B ──────────────────────────────────────────────────
  { empId: "G-1007", role: "RM",        dept: "Broadcasting" },
  { empId: "G-1007", role: "HOD",       dept: "Broadcasting" },
  { empId: "G-1007", role: "Requestor", dept: "Management" },
  { empId: "G-1007", role: "RM",        dept: "Purchase" },
  { empId: "G-1007", role: "HOD",       dept: "Purchase" },
  { empId: "G-1007", role: "RM",        dept: "Store" },
  { empId: "G-1007", role: "HOD",       dept: "Store" },
  { empId: "G-1007", role: "RM",        dept: "System admin" },
  { empId: "G-1007", role: "HOD",       dept: "System admin" },

  // ── AC-1379 — Vamsi Krishna Agnihotram ───────────────────────────────────
  { empId: "AC-1379", role: "RM",        dept: "Broadcasting" },
  { empId: "AC-1379", role: "Requestor", dept: "Operation" },
  { empId: "AC-1379", role: "RM",        dept: "Operation" },
  { empId: "AC-1379", role: "HOD",       dept: "Operation" },
  { empId: "AC-1379", role: "RM",        dept: "Technical Support" },
  { empId: "AC-1379", role: "HOD",       dept: "Technical Support" },

  // ── GN-1009 — Manjunatha ─────────────────────────────────────────────────
  { empId: "GN-1009", role: "RM",        dept: "Documantation" },
  { empId: "GN-1009", role: "HOD",       dept: "Documantation" },
  { empId: "GN-1009", role: "Requestor", dept: "Operation" },
  { empId: "GN-1009", role: "RM",        dept: "Operation" },
  { empId: "GN-1009", role: "HOD",       dept: "Operation" },

  // ── AC-1030 — Nithish V ──────────────────────────────────────────────────
  { empId: "AC-1030", role: "RM",        dept: "Game Development" },
  { empId: "AC-1030", role: "HOD",       dept: "Game Development" },
  { empId: "AC-1030", role: "Requestor", dept: "Software" },
  { empId: "AC-1030", role: "RM",        dept: "Software" },
  { empId: "AC-1030", role: "HOD",       dept: "Software" },

  // ── G-1136 — Kishor Kumar Baishya ────────────────────────────────────────
  { empId: "G-1136", role: "RM",        dept: "Broadcasting" },
  { empId: "G-1136", role: "Requestor", dept: "Store" },
  { empId: "G-1136", role: "RM",        dept: "Store" },

  // ── GN-1012 — PUNDARIKA PERLAMPADY ───────────────────────────────────────
  { empId: "GN-1012", role: "RM",        dept: "Accounts" },
  { empId: "GN-1012", role: "Requestor", dept: "Store" },
  { empId: "GN-1012", role: "RM",        dept: "Store" },

  // ── GN-1023 — Vinaya Keshava Y ───────────────────────────────────────────
  { empId: "GN-1023", role: "RM",        dept: "Broadcasting" },
  { empId: "GN-1023", role: "HOD",       dept: "Broadcasting" },
  { empId: "GN-1023", role: "Requestor", dept: "System admin" },
  { empId: "GN-1023", role: "RM",        dept: "System admin" },
  { empId: "GN-1023", role: "HOD",       dept: "System admin" },

  // ── G-1104 — Santosh Kumar ───────────────────────────────────────────────
  { empId: "G-1104", role: "Requestor", dept: "Software" },
  { empId: "G-1104", role: "RM",        dept: "Software" },
  { empId: "G-1104", role: "HOD",       dept: "Software" },

  // ── G-1091 — LALITESHWAR KUMAR ───────────────────────────────────────────
  { empId: "G-1091", role: "Requestor", dept: "Software" },
  { empId: "G-1091", role: "RM",        dept: "Software" },
  { empId: "G-1091", role: "HOD",       dept: "Software" },

  // ── AC-1248 — Shrinidhi Irodi ────────────────────────────────────────────
  { empId: "AC-1248", role: "Requestor", dept: "Software" },
  { empId: "AC-1248", role: "RM",        dept: "Software" },
  { empId: "AC-1248", role: "HOD",       dept: "Software" },

  // ── AC-1381 — Raveendra Ganapati Bhat ────────────────────────────────────
  { empId: "AC-1381", role: "Requestor", dept: "Academic" },
  { empId: "AC-1381", role: "RM",        dept: "Academic" },
  { empId: "AC-1381", role: "HOD",       dept: "Academic" },

  // ── AC-1133 — Pavan T V ──────────────────────────────────────────────────
  { empId: "AC-1133", role: "Requestor", dept: "Accounts" },
  { empId: "AC-1133", role: "RM",        dept: "Accounts" },
  { empId: "AC-1133", role: "HOD",       dept: "Accounts" },

  // ── GN-1011 — Pruthvi Raj R ──────────────────────────────────────────────
  { empId: "GN-1011", role: "Requestor", dept: "Animation" },
  { empId: "GN-1011", role: "RM",        dept: "Animation" },
  { empId: "GN-1011", role: "HOD",       dept: "Animation" },

  // ── GN-1015 — SRIDHAR M N ────────────────────────────────────────────────
  { empId: "GN-1015", role: "Requestor", dept: "Academic" },
  { empId: "GN-1015", role: "RM",        dept: "Academic" },
  { empId: "GN-1015", role: "HOD",       dept: "Academic" },

  // ── GN-1001 — Carol Preethi D'Souza ──────────────────────────────────────
  { empId: "GN-1001", role: "Requestor", dept: "Corporate Communications" },
  { empId: "GN-1001", role: "HOD",       dept: "Corporate Communications" },

  // ── Academic Requestor + RM ───────────────────────────────────────────────
  // AC-1130 — Kungur Hazorika
  { empId: "AC-1130", role: "Requestor", dept: "Academic" },
  { empId: "AC-1130", role: "RM",        dept: "Academic" },
  // AC-1053 — Rinkoomani Kotoki
  { empId: "AC-1053", role: "Requestor", dept: "Academic" },
  { empId: "AC-1053", role: "RM",        dept: "Academic" },
  // AC-1191 — Ravikant Sharma
  { empId: "AC-1191", role: "Requestor", dept: "Academic" },
  { empId: "AC-1191", role: "RM",        dept: "Academic" },
  // A-1127 — Anil Kumar G
  { empId: "A-1127",  role: "Requestor", dept: "Academic" },
  { empId: "A-1127",  role: "RM",        dept: "Academic" },
  // AC-1280 — Debdulal Sharma
  { empId: "AC-1280", role: "Requestor", dept: "Academic" },
  { empId: "AC-1280", role: "RM",        dept: "Academic" },
  // AC-1318 — Sanjay Bhat
  { empId: "AC-1318", role: "Requestor", dept: "Academic" },
  { empId: "AC-1318", role: "RM",        dept: "Academic" },
  // C-1112 — DEEPA SANDEEP KULKARNI
  { empId: "C-1112",  role: "Requestor", dept: "Academic" },
  { empId: "C-1112",  role: "RM",        dept: "Academic" },
  // GN-1010 — Prakash Prabhakar Kulkarni
  { empId: "GN-1010", role: "Requestor", dept: "Academic" },
  { empId: "GN-1010", role: "RM",        dept: "Academic" },
  // AC-1310 — Shayan Rao S L
  { empId: "AC-1310", role: "Requestor", dept: "Academic" },
  { empId: "AC-1310", role: "RM",        dept: "Academic" },

  // ── Accounts Requestor + RM ───────────────────────────────────────────────
  // GN-1041 — Parameshwar V Hegde
  { empId: "GN-1041", role: "Requestor", dept: "Accounts" },
  { empId: "GN-1041", role: "RM",        dept: "Accounts" },

  // ── Govt. Relations Requestor + RM ───────────────────────────────────────
  // GN-1016 — Sudhakara B G
  { empId: "GN-1016", role: "Requestor", dept: "Govt. Relations" },
  { empId: "GN-1016", role: "RM",        dept: "Govt. Relations" },

  // ── Operation Requestor + RM ──────────────────────────────────────────────
  // A-1148 — BIKASH Hazarika
  { empId: "A-1148",  role: "Requestor", dept: "Operation" },
  { empId: "A-1148",  role: "RM",        dept: "Operation" },
  // AC-1063 — Parvez Alom Choudhury
  { empId: "AC-1063", role: "Requestor", dept: "Operation" },
  { empId: "AC-1063", role: "RM",        dept: "Operation" },
  // AC-1067 — Deep Jyoti Sarma
  { empId: "AC-1067", role: "Requestor", dept: "Operation" },
  { empId: "AC-1067", role: "RM",        dept: "Operation" },
  // AC-1142 — Rinku Pran Thakuria
  { empId: "AC-1142", role: "Requestor", dept: "Operation" },
  { empId: "AC-1142", role: "RM",        dept: "Operation" },
  // AC-1393 — Rahul Bisht
  { empId: "AC-1393", role: "Requestor", dept: "Operation" },
  { empId: "AC-1393", role: "RM",        dept: "Operation" },
  // AC-1435 — Hrishabh Jardhari
  { empId: "AC-1435", role: "Requestor", dept: "Operation" },
  { empId: "AC-1435", role: "RM",        dept: "Operation" },
  // AC-1501 — Sourav Laskar
  { empId: "AC-1501", role: "Requestor", dept: "Operation" },
  { empId: "AC-1501", role: "RM",        dept: "Operation" },
  // AC-1509 — Dhruba Jyoti Bhuyan
  { empId: "AC-1509", role: "Requestor", dept: "Operation" },
  { empId: "AC-1509", role: "RM",        dept: "Operation" },
  // AC-1530 — RAJIB HALOI
  { empId: "AC-1530", role: "Requestor", dept: "Operation" },
  { empId: "AC-1530", role: "RM",        dept: "Operation" },
  // AC-1535 — Hirak Jyoti Pathak
  { empId: "AC-1535", role: "Requestor", dept: "Operation" },
  { empId: "AC-1535", role: "RM",        dept: "Operation" },
  // AC-1537 — Anvayakrishna K
  { empId: "AC-1537", role: "Requestor", dept: "Operation" },
  { empId: "AC-1537", role: "RM",        dept: "Operation" },
  // GC-1230 — Pritam Sarma
  { empId: "GC-1230", role: "Requestor", dept: "Operation" },
  { empId: "GC-1230", role: "RM",        dept: "Operation" },
  // GC-1304 — Joseph Ricky Marcher
  { empId: "GC-1304", role: "Requestor", dept: "Operation" },
  { empId: "GC-1304", role: "RM",        dept: "Operation" },

  // ── Technical Support Requestor + RM ─────────────────────────────────────
  // AC-1139 — Rahul Subba
  { empId: "AC-1139", role: "Requestor", dept: "Technical Support" },
  { empId: "AC-1139", role: "RM",        dept: "Technical Support" },
];

async function main() {
  console.log(`\nSeeding ${USER_ROLES.length} user-role entries...\n`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of USER_ROLES) {
    const user = await prisma.user.findUnique({
      where: { empId: entry.empId },
    });
    if (!user) {
      console.warn(
        `  SKIP  emp_id "${entry.empId}" not found in users table — ${entry.role} / ${entry.dept}`,
      );
      skipped++;
      continue;
    }

    try {
      await prisma.userRole.upsert({
        where: {
          empId_role_dept: {
            empId: entry.empId,
            role: entry.role,
            dept: entry.dept,
          },
        },
        update: {},
        create: { empId: entry.empId, role: entry.role, dept: entry.dept },
      });
      console.log(
        `  OK    ${entry.empId.padEnd(8)}  ${entry.role.padEnd(12)}  ${entry.dept}`,
      );
      inserted++;
    } catch (err) {
      console.error(
        `  FAIL  ${entry.empId}  ${entry.role}  ${entry.dept} — ${err.message}`,
      );
      failed++;
    }
  }

  console.log(
    `\nDone — ${inserted} inserted/existing, ${skipped} skipped (user not found), ${failed} failed.\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
