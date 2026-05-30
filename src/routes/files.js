const router = require("express").Router({ caseSensitive: true });
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.join(__dirname, "../../", process.env.UPLOAD_DIR || "uploads");

/**
 * GET /api/files/:filename
 * Serves uploaded files publicly. Filenames are random timestamps so they
 * are not guessable. Auth headers are not sent by <img> / <audio> tags.
 */
router.get("/", (req, res) => res.status(400).json({ error: "Filename required." }));

router.get("/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename) return res.status(400).json({ error: "Filename required." });
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found." });
  res.sendFile(filePath);
});

module.exports = router;
