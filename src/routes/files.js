const router = require("express").Router({ caseSensitive: true });
const path   = require("path");
const fs     = require("fs");
const prisma = require("../config/database");

// UUID pattern — new files stored in PostgreSQL
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Legacy disk folder — only used for files uploaded before the DB migration
const UPLOAD_DIR = path.join(__dirname, "../../", process.env.UPLOAD_DIR || "uploads");

router.get("/", (req, res) => res.status(400).json({ error: "Filename required." }));

router.get("/:filename", async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    if (!filename) return res.status(400).json({ error: "Filename required." });

    if (UUID_RE.test(filename)) {
      // New file — read binary data from PostgreSQL
      const rows = await prisma.$queryRawUnsafe(
        `SELECT file_name, mime_type, size, data FROM stored_files WHERE id = $1`,
        filename,
      );
      if (!rows.length) return res.status(404).json({ error: "File not found." });
      const file = rows[0];
      const buf  = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
      res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.file_name)}"`);
      return res.send(buf);
    }

    // Legacy filename — try disk first
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) return res.sendFile(filePath);

    // Disk file missing — look it up in the DB by original filename (migration fallback)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT file_name, mime_type, data FROM stored_files WHERE file_name = $1 LIMIT 1`,
      filename,
    );
    if (!rows.length) return res.status(404).json({ error: "File not found." });
    const file = rows[0];
    const buf  = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.file_name)}"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
