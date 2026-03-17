/**
 * src/db/init.js
 * Run once to create tables and seed all demo users:
 *   node src/db/init.js
 */

require("dotenv").config();
const fs     = require("fs");
const path   = require("path");
const bcrypt = require("bcryptjs");
const pool   = require("./pool");

async function init() {
  const client = await pool.connect();
  try {
    console.log("📦  Running schema...");
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await client.query(sql);
    console.log("✅  Schema ready.");

    // ─────────────────────────────────────────────────────────────
    // Demo users — password is always "password123" for all
    // ─────────────────────────────────────────────────────────────
    const demoUsers = [
      // ── Employees (requestors) ──────────────────────────────
      { emp_id: "E001", name: "Arjun Sharma",    email: "arjun@rts.com",          password: "password123", role: "Employee", dept: "Software",        designation: "Sr. Developer",   location: "Bangalore" },
      { emp_id: "E002", name: "Priya Nair",      email: "priya@rts.com",           password: "password123", role: "Employee", dept: "Academic",         designation: "Lecturer",        location: "Kochi"     },
      { emp_id: "E003", name: "Rahul Das",       email: "rahul@rts.com",           password: "password123", role: "Employee", dept: "Broadcasting",     designation: "Broadcast Eng",   location: "Mumbai"    },
      { emp_id: "E004", name: "Sneha Iyer",      email: "sneha@rts.com",           password: "password123", role: "Employee", dept: "Accounts",         designation: "Accountant",      location: "Chennai"   },
      { emp_id: "E005", name: "Vikram Patil",    email: "vikram@rts.com",          password: "password123", role: "Employee", dept: "Animation",        designation: "Animator",        location: "Pune"      },

      // ── Reporting Managers (RM) ─────────────────────────────
      { emp_id: "R001", name: "Deepak Menon",    email: "rm.software@rts.com",     password: "password123", role: "RM",       dept: "Software",         designation: "Team Lead",       location: "Bangalore" },
      { emp_id: "R002", name: "Kavitha Reddy",   email: "rm.academic@rts.com",     password: "password123", role: "RM",       dept: "Academic",         designation: "Sr. Lecturer",    location: "Hyderabad" },
      { emp_id: "R003", name: "Suresh Kumar",    email: "rm.operations@rts.com",   password: "password123", role: "RM",       dept: "Operations",       designation: "Ops Lead",        location: "Delhi"     },

      // ── HODs (requestor's department head) ──────────────────
      { emp_id: "H001", name: "Dr. Anand Joshi", email: "hod.software@rts.com",    password: "password123", role: "HOD",      dept: "Software",         designation: "Head of Dept",    location: "Bangalore" },
      { emp_id: "H002", name: "Prof. Meena Pillai", email: "hod.academic@rts.com", password: "password123", role: "HOD",      dept: "Academic",         designation: "Head of Dept",    location: "Kochi"     },
      { emp_id: "H003", name: "Mr. Ravi Shenoy", email: "hod.operations@rts.com",  password: "password123", role: "HOD",      dept: "Operations",       designation: "Head of Dept",    location: "Delhi"     },

      // ── Department HODs (assigned department — step 3) ──────
      { emp_id: "D001", name: "IT HOD",          email: "itdepartment@rts.com",    password: "password123", role: "DeptHOD",  dept: "IT",               designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D002", name: "HR HOD",          email: "hrdepartment@rts.com",    password: "password123", role: "DeptHOD",  dept: "HR",               designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D003", name: "Finance HOD",     email: "financedepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Finance",          designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D004", name: "Operations HOD",  email: "operationsdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Operations",   designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D005", name: "Technical HOD",   email: "technicaldepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Technical Support", designation: "Dept HOD",   location: "HQ"        },
      { emp_id: "D006", name: "Admin HOD",       email: "admindepartment@rts.com", password: "password123", role: "DeptHOD",  dept: "Admin",            designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D007", name: "Accounts HOD",    email: "accountsdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Accounts",        designation: "Dept HOD",       location: "HQ"        },
      { emp_id: "D008", name: "Animation HOD",   email: "animationdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Animation",      designation: "Dept HOD",       location: "HQ"        },
      { emp_id: "D009", name: "Software HOD",    email: "softwaredepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Software",        designation: "Dept HOD",        location: "HQ"       },
      { emp_id: "D010", name: "Broadcasting HOD",email: "broadcastingdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Broadcasting", designation: "Dept HOD",     location: "HQ"        },
      { emp_id: "D011", name: "Academic HOD",    email: "academicdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Academic",        designation: "Dept HOD",        location: "HQ"       },
      { emp_id: "D012", name: "Store HOD",       email: "storedepartment@rts.com", password: "password123", role: "DeptHOD",  dept: "Store",            designation: "Dept HOD",        location: "HQ"        },
      { emp_id: "D013", name: "Management HOD",  email: "managementdepartment@rts.com", password: "password123", role: "DeptHOD", dept: "Management",   designation: "Dept HOD",        location: "HQ"        },

      // ── Admin (read-only access) ─────────────────────────────
      { emp_id: "A001", name: "System Admin",    email: "admin@rts.com",           password: "password123", role: "Admin",    dept: "Management",       designation: "System Admin",    location: "HQ"        },
    ];

    for (const u of demoUsers) {
      const exists = await client.query(
        "SELECT id FROM users WHERE emp_id = $1", [u.emp_id]
      );
      if (exists.rows.length > 0) {
        console.log(`   ↩  ${u.emp_id} (${u.role}) already exists, skipping.`);
        continue;
      }
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (emp_id, name, email, password_hash, role, dept, designation, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [u.emp_id, u.name, u.email, hash, u.role, u.dept, u.designation, u.location]
      );
      console.log(`   ✔  ${u.role.padEnd(8)} ${u.name.padEnd(22)} ${u.email}`);
    }

    console.log("\n🚀  Database initialised.");
    console.log("   Password for ALL users: password123\n");
    console.log("   Employee logins:   arjun@rts.com, priya@rts.com ...");
    console.log("   RM logins:         rm.software@rts.com ...");
    console.log("   HOD logins:        hod.software@rts.com ...");
    console.log("   DeptHOD logins:    itdepartment@rts.com, hrdepartment@rts.com ...");
    console.log("   Admin login:       admin@rts.com");
  } catch (err) {
    console.error("❌  Init failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

init();