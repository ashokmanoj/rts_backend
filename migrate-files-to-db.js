/**
 * migrate-files-to-db.js
 * One-time script: moves every file in the uploads/ folder into the
 * stored_files PostgreSQL table and rewrites all URL references in the DB.
 *
 * Usage (stop the server first is NOT required — this uses raw SQL):
 *   node migrate-files-to-db.js
 *
 * Safe to run multiple times — files already in the DB are skipped.
 */

"use strict";

require("dotenv").config();

const { randomUUID } = require("crypto");
const path           = require("path");
const fs             = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma     = new PrismaClient();
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || "uploads");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_MAP = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png",  ".gif": "image/gif",
  ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".mp3": "audio/mpeg",  ".wav": "audio/wav",
  ".m4a": "audio/m4a",   ".ogg": "audio/ogg",
  ".mp4": "video/mp4",   ".mov": "video/quicktime",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  ".zip": "application/zip", ".rar": "application/x-rar-compressed",
  ".7z":  "application/x-7z-compressed",
  ".tar": "application/x-tar", ".gz": "application/gzip",
  ".jar": "application/java-archive",
};

function getMime(filename) {
  return MIME_MAP[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

// Replace old path segment with new one in a column that may be a JSON string
async function rewriteColumn(table, column, oldPath, newPath) {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET ${column} = REPLACE(${column}, $1, $2) WHERE ${column} LIKE $3`,
    oldPath,
    newPath,
    `%${oldPath}%`,
  );
}

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log("No uploads directory found — nothing to migrate.");
    return;
  }

  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(f => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, f));
      return stat.isFile() && !UUID_RE.test(path.parse(f).name);
    });

  console.log(`\nFound ${files.length} disk files to migrate.\n`);

  let migrated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(UPLOAD_DIR, filename);

    process.stdout.write(`[${i + 1}/${files.length}] ${filename} … `);

    try {
      // Check if already migrated by filename
      const existing = await prisma.$queryRawUnsafe(
        `SELECT id FROM stored_files WHERE file_name = $1 LIMIT 1`,
        filename,
      );
      if (existing.length > 0) {
        console.log(`SKIP (already in DB as ${existing[0].id})`);
        skipped++;
        continue;
      }

      const buf  = fs.readFileSync(filePath);
      const mime = getMime(filename);
      const id   = randomUUID();

      // Insert binary into stored_files
      await prisma.$executeRawUnsafe(
        `INSERT INTO stored_files (id, file_name, mime_type, size, data) VALUES ($1, $2, $3, $4, $5)`,
        id,
        filename,
        mime,
        buf.length,
        buf,
      );

      // The old path segment stored in URLs is: /api/files/<filename>
      const oldPath = `/api/files/${filename}`;
      const newPath = `/api/files/${id}`;

      // Rewrite single-URL columns
      await rewriteColumn("requests",      "file_url",  oldPath, newPath);
      await rewriteColumn("close_tickets", "file_url",  oldPath, newPath);
      await rewriteColumn("chat_messages", "file_url",  oldPath, newPath);
      await rewriteColumn("chat_messages", "voice_url", oldPath, newPath);

      // Rewrite JSON-array URL columns (stored as text, REPLACE works on the string)
      await rewriteColumn("requests",      "file_urls", oldPath, newPath);
      await rewriteColumn("close_tickets", "file_urls", oldPath, newPath);

      console.log(`OK → ${id}`);
      migrated++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Migrated : ${migrated}`);
  console.log(`Skipped  : ${skipped}  (already in DB)`);
  console.log(`Failed   : ${failed}`);
  console.log(`──────────────────────────────────────────`);

  if (migrated > 0 && failed === 0) {
    console.log(`\nAll files are now in PostgreSQL.`);
    console.log(`You can delete the uploads/ folder once you have verified everything works.\n`);
  } else if (failed > 0) {
    console.log(`\nSome files failed — do NOT delete uploads/ yet. Re-run to retry.\n`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  prisma.$disconnect();
  process.exit(1);
});
