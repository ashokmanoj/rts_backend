/**
 * src/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RTS Backend — Express entry point.
 *
 * Startup sequence:
 *   1. Load env vars
 *   2. Register middleware (CORS, body parsers, logger, static files)
 *   3. Mount API routes
 *   4. Mount error handler
 *   5. Verify Prisma DB connection
 *   6. Listen on PORT
 *
 * Quick-start:
 *   npm run db:setup   ← generate Prisma client + push schema + seed users
 *   npm run dev        ← start with nodemon
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const prisma       = require("./db/prisma");
const errorHandler = require("./middleware/errorHandler");
const authRoutes   = require("./routes/auth");
const requestRoutes= require("./routes/requests");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allow the Vite dev server and any configured CLIENT_URL.
app.use(cors({
  origin:  true,
  credentials: true,
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Dev request logger ────────────────────────────────────────────────────────
// Only active in development — logs method, URL, sanitised body, and response.
if (process.env.NODE_ENV !== "production") {
  const sanitize = (body) => {
    if (!body) return body;
    const clone = { ...body };
    if (clone.password) clone.password = "******";
    if (clone.token)    clone.token    = "******";
    return clone;
  };

  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`\n📥  ${req.method} ${req.originalUrl}`);
    if (Object.keys(req.body || {}).length) {
      console.log("    Body:", sanitize(req.body));
    }

    const orig = res.send;
    res.send = function (body) {
      console.log(`📤  ${res.statusCode}  (${Date.now() - start}ms)`);
      return orig.call(this, body);
    };
    next();
  });
}

// ── Static file serving for uploaded files ────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../", process.env.UPLOAD_DIR || "uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/requests", requestRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Verify Prisma DB connection then start listening ─────────────────────────
prisma.$connect()
  .then(() => {
    console.log("✅  Database connected via Prisma");
    app.listen(PORT, () => {
      console.log(`\n🚀  RTS Backend running on http://localhost:${PORT}`);
      console.log(`    Health: http://localhost:${PORT}/api/health\n`);
    });
  })
  .catch((err) => {
    console.error("❌  Prisma DB connection failed:", err.message);
    console.error("    Check DATABASE_URL in your .env file.");
    process.exit(1);
  });
