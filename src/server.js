/**
 * src/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RTS Backend — Entry Point.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const app = require("./app");
app.disable("x-powered-by");

// ── Local dev only: start HTTP server + crons ─────────────────────────────────
// On Vercel, this file is imported (not run directly), so require.main !== module
// and app.listen() is never called — Vercel handles the HTTP layer itself.
if (require.main === module) {
  const prisma = require("./config/database");
  const { startFoodReminderCron } = require("./utils/foodReminder");
  const { startRecurringCron }    = require("./utils/recurringCron");
  const { startAutoCloseCron }    = require("./utils/autoCloseCron");

  const PORT = process.env.PORT || 5000;

  prisma.$connect()
    .then(() => {
      console.log("✅ Database connected via Prisma");
      startFoodReminderCron();
      startRecurringCron();
      startAutoCloseCron();
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
}

// Export for Vercel serverless
module.exports = app;
