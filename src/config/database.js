/**
 * src/config/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Prisma Client instance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["error", "warn"]
    : ["error"],
});

module.exports = prisma;
