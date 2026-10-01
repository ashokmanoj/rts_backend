"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Count all stored files
  const total = await p.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM stored_files");
  console.log("stored_files total rows:", Number(total[0].cnt));

  // Count files with UUID-style names vs old timestamp names
  const uuidCount = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM stored_files WHERE id = file_name OR file_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`
  );
  console.log("UUID-named files:", Number(uuidCount[0].cnt));

  const legacyCount = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM stored_files WHERE file_name NOT LIKE '%-%-%-%-%' OR file_name LIKE '17%' OR file_name LIKE '16%'`
  );
  console.log("Legacy timestamp-named files:", Number(legacyCount[0].cnt));

  // Check if specific old filenames are in the DB
  const sample = await p.$queryRawUnsafe(
    `SELECT file_name FROM stored_files WHERE file_name ~ '^[0-9]{13}-' LIMIT 5`
  );
  console.log("\nSample old-style files in DB:", sample.length ? sample.map(r => r.file_name) : "NONE FOUND");

  // Count requests still using old filename URLs
  const oldUrlRequests = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM requests WHERE file_url IS NOT NULL AND file_url NOT LIKE '%-%-%-%-%'`
  );
  console.log("\nRequests with old filename URLs:", Number(oldUrlRequests[0].cnt));

  // Count chat messages still using old filename URLs
  const oldUrlChats = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM chat_messages WHERE file_url IS NOT NULL AND file_url NOT LIKE '%-%-%-%-%'`
  );
  console.log("Chat messages with old filename URLs:", Number(oldUrlChats[0].cnt));
}

main()
  .catch(e => console.error("ERROR:", e.message))
  .finally(() => p.$disconnect());
