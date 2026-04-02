/**
 * src/db/prisma.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Prisma Client instance.
 *
 * Import this wherever you need DB access:
 *   const prisma = require("../db/prisma");
 *
 * Prisma automatically manages the connection pool.
 * Do NOT instantiate PrismaClient more than once — use this shared instance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["error", "warn"]   // Show SQL errors and warnings in dev
    : ["error"],          // Only errors in production
});

module.exports = prisma;
