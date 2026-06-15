/**
 * src/app.js
 */

"use strict";

const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const morgan       = require("morgan");
const path         = require("path");
const { default: rateLimit, ipKeyGenerator } = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");
const authRoutes        = require("./routes/auth");
const requestRoutes     = require("./routes/requests");
const adminRoutes       = require("./routes/admin");
const foodRoutes        = require("./routes/food");
const fileRoutes        = require("./routes/files");
const pushRoutes        = require("./routes/push");
const managementRoutes  = require("./routes/management");

const app = express();
app.set('trust proxy', 1); // Trust one hop (IIS reverse proxy) — prevents X-Forwarded-For spoofing

// ── Security & Logging ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https://stucle-dev.sgp1.cdn.digitaloceanspaces.com"],
      connectSrc: [   // ← FIXED: added production URLs
        "'self'",
        "http://localhost:5000",
        "http://192.168.1.128:5000",
        "https://telerts.com",
        "https://www.telerts.com",
        "http://telerts.com",
        "http://www.telerts.com",
      ]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(morgan("dev"));
app.disable("x-powered-by");

// ── Global Rate Limiting ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  keyGenerator: (req) => {
    const raw = req.ip || req.socket?.remoteAddress || "unknown";
    const ip  = raw.replace(/^::ffff:/, "").replace(/:\d+$/, "");
    return ipKeyGenerator({ ip });
  },
});
app.use("/api", globalLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.128:5173",
  "http://59.97.21.84",
  "http://59.97.21.84:5173",
  "http://telerts.com",        // ← added
  "http://www.telerts.com",    // ← added
  "https://telerts.com",
  "https://www.telerts.com",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isDev) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods:      ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/requests",   requestRoutes);
app.use("/api/admin",      adminRoutes);
app.use("/api/food",       foodRoutes);
app.use("/api/files",      fileRoutes);
app.use("/api/push",       pushRoutes);
app.use("/api/management", managementRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── 404 for unmatched /api/* routes ───────────────────────────────────────────
app.use("/api", (_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Serve static files from React app in production ──────────────────────────
if (process.env.NODE_ENV === 'production') {
  // Hashed assets (JS/CSS/images) — cache for 1 year, they change filename on every build
  app.use(express.static(path.join(__dirname, '../../rts_frontend/dist'), {
    maxAge: '1y',
    immutable: true,
  }));
  // index.html — never cache so users always get the latest build
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, '../../rts_frontend/dist/index.html'));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;