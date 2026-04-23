/**
 * src/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RTS Backend — Entry Point.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const app = require("./app");
const prisma = require("./config/database");

const PORT = process.env.PORT || 5000;

// ── Verify Prisma DB connection then start listening ─────────────────────────
prisma.$connect()
  .then(() => {
    console.log("✅ Database connected via Prisma");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 RTS Backend running on http://0.0.0.0:${PORT}`);
      console.log(`    Local:   http://localhost:${PORT}`);
      console.log(`    Health:  http://localhost:${PORT}/api/health\n`);
    });
  })
  .catch((err) => {
    console.error("❌ Prisma DB connection failed:", err.message);
    process.exit(1);
  });
