/**
 * src/app.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express Application Configuration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const morgan       = require("morgan");
const path         = require("path");
const errorHandler = require("./middleware/errorHandler");
const authRoutes   = require("./routes/auth");
const requestRoutes= require("./routes/requests");
const adminRoutes  = require("./routes/admin");
const foodRoutes   = require("./routes/food");

const app = express();

// ── Security & Logging ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan("dev"));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.128:5173"
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === "development") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

// ── Static file serving ───────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../", process.env.UPLOAD_DIR || "uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/food",     foodRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
