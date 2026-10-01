"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { randomUUID }   = require("crypto");
const p = new PrismaClient();

async function main() {
  // 1. Count rows in stored_files
  const count = await p.$queryRawUnsafe("SELECT COUNT(*) as total FROM stored_files");
  console.log("stored_files rows:", Number(count[0].total));

  // 2. Test a direct INSERT
  const id = randomUUID();
  await p.$executeRawUnsafe(
    "INSERT INTO stored_files (id, file_name, mime_type, size, data) VALUES ($1, $2, $3, $4, $5)",
    id, "test.txt", "text/plain", 4, Buffer.from("test")
  );
  console.log("INSERT test OK — id:", id);

  // 3. Verify it can be read back
  const rows = await p.$queryRawUnsafe("SELECT id, file_name FROM stored_files WHERE id = $1", id);
  console.log("SELECT test:", rows.length ? "FOUND" : "NOT FOUND");

  // 4. Cleanup test row
  await p.$executeRawUnsafe("DELETE FROM stored_files WHERE id = $1", id);
  console.log("Cleanup done.");
}

main()
  .catch(e => console.error("ERROR:", e.message))
  .finally(() => p.$disconnect());
