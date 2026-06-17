const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

const UPLOAD_DIR = path.join(__dirname, "../../", process.env.UPLOAD_DIR || "uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext    = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_EXTENSIONS = new Set([
  // Images
  ".jpeg", ".jpg", ".png", ".gif", ".webp", ".bmp", ".svg",
  // Documents
  ".pdf", ".doc", ".docx",
  // Spreadsheets / data
  ".xls", ".xlsx", ".csv",
  // Archives
  ".zip", ".rar", ".7z", ".tar", ".gz",
  // Audio
  ".mp3", ".wav", ".m4a", ".ogg",
  // Video
  ".mp4", ".mov", ".avi", ".mkv",
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    return cb(null, true);
  }
  const err = new Error(
    "Invalid file type. Allowed: Images (jpg/png/gif/webp/svg), PDF, Word, Excel, CSV, " +
    "Archives (zip/rar/7z), Audio (mp3/wav/ogg), Video (mp4/mov/avi/mkv)."
  );
  err.status = 400;
  cb(err);
};

const maxSize = (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter,
});

module.exports = upload;
