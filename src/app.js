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
const rateLimit    = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");
const authRoutes   = require("./routes/auth");
const requestRoutes= require("./routes/requests");
const adminRoutes  = require("./routes/admin");
const foodRoutes   = require("./routes/food");
const fileRoutes   = require("./routes/files");
const pushRoutes   = require("./routes/push");

const app = express();

// ── Security & Logging ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline is often needed for some React/Vite patterns, but 'self' is primary
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://stucle-dev.sgp1.cdn.digitaloceanspaces.com"],
      connectSrc: ["'self'", "http://localhost:5001", "http://192.168.1.128:5001"] // Adjust connectSrc as needed
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(morgan("dev"));
app.disable("x-powered-by"); // Hide Express header for security

// ── Global Rate Limiting ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Increased to 10,000 to accommodate 200+ concurrent users behind an office NAT
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api", globalLimiter);

// ── CORS ─────────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.128:5173",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || isDev) {
      callback(null, true);
    } else {
      // Return null for error and false for allowed to avoid 500 error
      callback(null, false);
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

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/food",     foodRoutes);
app.use("/api/files",    fileRoutes);
app.use("/api/push",     pushRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
