"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const targets = [
    "1790857422277-911229.jpeg",
    "1790857422336-153724.xlsx",
  ];

  for (const name of targets) {
    const rows = await p.$queryRawUnsafe(
      `SELECT id, file_name, size, created_at FROM stored_files WHERE file_name = $1 LIMIT 1`,
      name
    );
    if (rows.length) {
      console.log(`✅ FOUND: ${name} → id=${rows[0].id}, size=${rows[0].size}`);
    } else {
      console.log(`❌ MISSING: ${name} — not in stored_files`);
    }
  }
}

main()
  .catch(e => console.error("ERROR:", e.message))
  .finally(() => p.$disconnect());
