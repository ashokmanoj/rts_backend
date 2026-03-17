require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const errorHandler = require("./middleware/errorHandler");

const authRoutes    = require("./routes/auth");
const requestRoutes = require("./routes/requests");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static file serving (uploaded files) ─────────────────────
const UPLOAD_DIR = path.join(__dirname, "../", process.env.UPLOAD_DIR || "uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/requests", requestRoutes);

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  RTS Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
