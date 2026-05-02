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

const fileFilter = (_req, file, cb) => {
  const allowedExtensions = /^\.(jpeg|jpg|png|pdf|docx|xlsx|mp3|wav|m4a)$/;
  const allowedMimetypes = /^(image\/jpeg|image\/png|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|audio\/mpeg|audio\/wav|audio\/x-m4a|audio\/mp4)$/;
  
  const ext = path.extname(file.originalname).toLowerCase();
  const isExtAllowed = allowedExtensions.test(ext);
  const isMimeAllowed = allowedMimetypes.test(file.mimetype);

  if (isExtAllowed && isMimeAllowed) {
    return cb(null, true);
  } else {
    cb(new Error("Error: Invalid file type. Only JPG, PNG, PDF, DOCX, XLSX, MP3, WAV, and M4A are allowed."));
  }
};

const maxSize = (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter,
});

module.exports = upload;
