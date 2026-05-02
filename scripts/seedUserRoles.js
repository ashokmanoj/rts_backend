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
  // ── Pavan Verma (AC-1378) ─────────────────────────────────────────────────
  // Broadcasting:   Requestor=Yes, RM=Yes
  // Operation:      Requestor=No,  RM=Yes
  // System admin:   Requestor=No,  RM=Yes
  { empId: "AC-1378", role: "Requestor", dept: "Broadcasting" },
  { empId: "AC-1378", role: "RM",        dept: "Broadcasting" },
  { empId: "AC-1378", role: "RM",        dept: "Operation"    },
  { empId: "AC-1378", role: "RM",        dept: "System admin" },

  // ── Nishant Bhat (AC-1103) ───────────────────────────────────────────────
  // Business Development: Requestor=Yes, RM=No
  // Operation:            Requestor=No,  RM=Yes
  { empId: "AC-1103", role: "Requestor", dept: "Business Development" },
  { empId: "AC-1103", role: "RM",        dept: "Operation"            },

  // ── Vikas Deep (GN-1018) ─────────────────────────────────────────────────
  // Broadcasting:         Requestor=No,  RM=Yes
  // Business Development: Requestor=Yes, RM=No
  { empId: "GN-1018", role: "RM",        dept: "Broadcasting"         },
  { empId: "GN-1018", role: "Requestor", dept: "Business Development" },

  // ── Sudhakar G Hegde (GN-1042) ───────────────────────────────────────────
  // Admin: Requestor=No,  RM=Yes, HOD=Yes
  // HR:    Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "GN-1042", role: "RM",        dept: "Admin" },
  { empId: "GN-1042", role: "Requestor", dept: "HR"    },
  { empId: "GN-1042", role: "RM",        dept: "HR"    },


  // ── Akhilesh B (G-1007) ──────────────────────────────────────────────────
  // Broadcasting: Requestor=No,  RM=Yes, HOD=Yes
  // Management:   Requestor=Yes, RM=No
  // Purchase:     Requestor=No,  RM=Yes, HOD=Yes
  // Store:        Requestor=No,  RM=Yes, HOD=Yes
  // System admin: Requestor=No,  RM=Yes, HOD=Yes
  { empId: "G-1007", role: "RM",        dept: "Broadcasting" },
  { empId: "G-1007", role: "Requestor", dept: "Management"   },
  { empId: "G-1007", role: "RM",        dept: "Purchase"     },
  { empId: "G-1007", role: "RM",        dept: "Store"        },
  { empId: "G-1007", role: "RM",        dept: "System admin" },

  // ── Vamsi Krishna Agnihotram (AC-1379) ───────────────────────────────────
  // Broadcasting:     Requestor=No,  RM=Yes
  // Operation:        Requestor=Yes, RM=Yes, DeptHOD=Yes
  // Technical Support:Requestor=No,  RM=Yes
  { empId: "AC-1379", role: "RM",        dept: "Broadcasting"      },
  { empId: "AC-1379", role: "Requestor", dept: "Operation"         },
  { empId: "AC-1379", role: "RM",        dept: "Operation"         },
  { empId: "AC-1379", role: "RM",        dept: "Technical Support" },

  // ── Manjunatha (GN-1009) ─────────────────────────────────────────────────
  // Documantation: Requestor=No,  RM=Yes, HOD=Yes
  // Operation:     Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "GN-1009", role: "RM",        dept: "Documantation" },
  { empId: "GN-1009", role: "Requestor", dept: "Operation"     },
  { empId: "GN-1009", role: "RM",        dept: "Operation"     },
  
  // ── Nithish V (AC-1030) ──────────────────────────────────────────────────
  // Animation: Requestor=No,  RM=Yes
  // Software:  Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "AC-1030", role: "RM",        dept: "Animation" },
  { empId: "AC-1030", role: "Requestor", dept: "Software"  },
  { empId: "AC-1030", role: "RM",        dept: "Software"  },
  

  // ── Kishor Kumar Baishya (G-1136) ────────────────────────────────────────
  // Broadcasting: Requestor=No,  RM=Yes
  // Store:        Requestor=Yes, RM=Yes
  { empId: "G-1136", role: "RM",        dept: "Broadcasting" },
  { empId: "G-1136", role: "Requestor", dept: "Store"        },
  { empId: "G-1136", role: "RM",        dept: "Store"        },

  // ── PUNDARIKA PERLAMPADY (GN-1012) ───────────────────────────────────────
  // Accounts: Requestor=No,  RM=Yes
  // Store:    Requestor=Yes, RM=Yes
  { empId: "GN-1012", role: "RM",        dept: "Accounts" },
  { empId: "GN-1012", role: "Requestor", dept: "Store"    },
  { empId: "GN-1012", role: "RM",        dept: "Store"    },

  // ── Vinaya Keshava Y (GN-1023) ───────────────────────────────────────────
  // Broadcasting: Requestor=No,  RM=Yes
  // System admin: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "GN-1023", role: "RM",        dept: "Broadcasting" },
  { empId: "GN-1023", role: "Requestor", dept: "System admin" },
  { empId: "GN-1023", role: "RM",        dept: "System admin" },
  // ── Santosh Kumar (G-1104) ───────────────────────────────────────────────
  // Software: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "G-1104", role: "Requestor", dept: "Software" },
  { empId: "G-1104", role: "RM",        dept: "Software" },
  { empId: "G-1104", role: "HOD",       dept: "Software" },

  // ── LALITESHWAR KUMAR (G-1091) ───────────────────────────────────────────
  // Software: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "G-1091", role: "Requestor", dept: "Software" },
  { empId: "G-1091", role: "RM",        dept: "Software" },
  { empId: "G-1091", role: "HOD",       dept: "Software" },
  // ── Shrinidhi Irodi (AC-1248) ────────────────────────────────────────────
  // Software: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "AC-1248", role: "Requestor", dept: "Software" },
  { empId: "AC-1248", role: "RM",        dept: "Software" },
  { empId: "AC-1248", role: "HOD",       dept: "Software" },

  // ── Raveendra Ganapati Bhat (AC-1381) ────────────────────────────────────
  // Academic: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "AC-1381", role: "Requestor", dept: "Academic" },
  { empId: "AC-1381", role: "RM",        dept: "Academic" },

  // ── Pavan T V (AC-1133) ──────────────────────────────────────────────────
  // Accounts: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "AC-1133", role: "Requestor", dept: "Accounts" },
  { empId: "AC-1133", role: "RM",        dept: "Accounts" },

  // ── Pruthvi Raj R (GN-1011) ──────────────────────────────────────────────
  // Animation: Requestor=Yes, RM=Yes, DeptHOD=Yes
  { empId: "GN-1011", role: "Requestor", dept: "Animation" },
  { empId: "GN-1011", role: "RM",        dept: "Animation" },

  // ── SRIDHAR M N (GN-1015) ────────────────────────────────────────────────
  // Academic: Requestor=Yes, RM=Yes, HOD=Yes
  { empId: "GN-1015", role: "Requestor", dept: "Academic" },
  { empId: "GN-1015", role: "RM",        dept: "Academic" },
  { empId: "GN-1015", role: "HOD",       dept: "Academic" },

  // ── Carol Preethi D'Souza (GN-1001) ──────────────────────────────────────
  // Corporate Communications: Requestor=Yes, HOD=Yes
  { empId: "GN-1001", role: "Requestor", dept: "Corporate Communications" },
  { empId: "GN-1001", role: "HOD",       dept: "Corporate Communications" },

  // ── Academic RM-only employees (Requestor + RM) ───────────────────────────
  { empId: "AC-1130", role: "Requestor", dept: "Academic" },
  { empId: "AC-1130", role: "RM",        dept: "Academic" },

  { empId: "AC-1053", role: "Requestor", dept: "Academic" },
  { empId: "AC-1053", role: "RM",        dept: "Academic" },

  { empId: "AC-1191", role: "Requestor", dept: "Academic" },
  { empId: "AC-1191", role: "RM",        dept: "Academic" },

  { empId: "A-1127",  role: "Requestor", dept: "Academic" },
  { empId: "A-1127",  role: "RM",        dept: "Academic" },

  { empId: "AC-1280", role: "Requestor", dept: "Academic" },
  { empId: "AC-1280", role: "RM",        dept: "Academic" },

  { empId: "AC-1318", role: "Requestor", dept: "Academic" },
  { empId: "AC-1318", role: "RM",        dept: "Academic" },

  { empId: "C-1112",  role: "Requestor", dept: "Academic" },
  { empId: "C-1112",  role: "RM",        dept: "Academic" },

  { empId: "GN-1010", role: "Requestor", dept: "Academic" },
  { empId: "GN-1010", role: "RM",        dept: "Academic" },

  { empId: "GN-1046", role: "Requestor", dept: "Academic" },
  { empId: "GN-1046", role: "RM",        dept: "Academic" },

  { empId: "AC-1310", role: "Requestor", dept: "Academic" },
  { empId: "AC-1310", role: "RM",        dept: "Academic" },

  // ── Accounts RM (Requestor + RM) ─────────────────────────────────────────
  { empId: "GN-1041", role: "Requestor", dept: "Accounts" },
  { empId: "GN-1041", role: "RM",        dept: "Accounts" },

  // ── Govt. Relations RM (Requestor + RM) ──────────────────────────────────
  { empId: "GN-1016", role: "Requestor", dept: "Govt. Relations" },
  { empId: "GN-1016", role: "RM",        dept: "Govt. Relations" },

  // ── Operation RM-only employees (Requestor + RM) ─────────────────────────
  { empId: "A-1148",  role: "Requestor", dept: "Operation" },
  { empId: "A-1148",  role: "RM",        dept: "Operation" },

  { empId: "AC-1063", role: "Requestor", dept: "Operation" },
  { empId: "AC-1063", role: "RM",        dept: "Operation" },

  { empId: "AC-1067", role: "Requestor", dept: "Operation" },
  { empId: "AC-1067", role: "RM",        dept: "Operation" },

  { empId: "AC-1142", role: "Requestor", dept: "Operation" },
  { empId: "AC-1142", role: "RM",        dept: "Operation" },

  { empId: "AC-1393", role: "Requestor", dept: "Operation" },
  { empId: "AC-1393", role: "RM",        dept: "Operation" },

  { empId: "AC-1435", role: "Requestor", dept: "Operation" },
  { empId: "AC-1435", role: "RM",        dept: "Operation" },

  { empId: "AC-1501", role: "Requestor", dept: "Operation" },
  { empId: "AC-1501", role: "RM",        dept: "Operation" },

  { empId: "AC-1509", role: "Requestor", dept: "Operation" },
  { empId: "AC-1509", role: "RM",        dept: "Operation" },

  { empId: "AC-1530", role: "Requestor", dept: "Operation" },
  { empId: "AC-1530", role: "RM",        dept: "Operation" },

  { empId: "AC-1535", role: "Requestor", dept: "Operation" },
  { empId: "AC-1535", role: "RM",        dept: "Operation" },

  { empId: "AC-1537", role: "Requestor", dept: "Operation" },
  { empId: "AC-1537", role: "RM",        dept: "Operation" },

  { empId: "GC-1230", role: "Requestor", dept: "Operation" },
  { empId: "GC-1230", role: "RM",        dept: "Operation" },

  { empId: "GC-1304", role: "Requestor", dept: "Operation" },
  { empId: "GC-1304", role: "RM",        dept: "Operation" },

  // ── Technical Support RM (Requestor + RM) ────────────────────────────────
  { empId: "AC-1139", role: "Requestor", dept: "Technical Support" },
  { empId: "AC-1139", role: "RM",        dept: "Technical Support" },
];

async function main() {
  console.log(`\nSeeding ${USER_ROLES.length} user-role entries...\n`);

  let inserted = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const entry of USER_ROLES) {
    const user = await prisma.user.findUnique({ where: { empId: entry.empId } });
    if (!user) {
      console.warn(`  SKIP  emp_id "${entry.empId}" not found in users table — ${entry.role} / ${entry.dept}`);
      skipped++;
      continue;
    }

    try {
      await prisma.userRole.upsert({
        where:  { empId_role_dept: { empId: entry.empId, role: entry.role, dept: entry.dept } },
        update: {},
        create: { empId: entry.empId, role: entry.role, dept: entry.dept },
      });
      console.log(`  OK    ${entry.empId.padEnd(8)}  ${entry.role.padEnd(12)}  ${entry.dept}`);
      inserted++;
    } catch (err) {
      console.error(`  FAIL  ${entry.empId}  ${entry.role}  ${entry.dept} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone — ${inserted} inserted/existing, ${skipped} skipped (user not found), ${failed} failed.\n`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
