/**
 * src/controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles user authentication:
 *   POST /api/auth/login   → validate credentials, return JWT + user payload
 *   GET  /api/auth/me      → return decoded JWT payload (no extra DB hit)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const prisma  = require("../db/prisma");

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user: { userId, empId, name, role, dept } }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // ── Find user by email (case-insensitive) ───────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // ── Verify password ─────────────────────────────────────────────────────
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // ── Build JWT payload ───────────────────────────────────────────────────
    // Note: we use `userId` (UUID) for internal reference; `empId` (e.g. AC-1030)
    // is the business identifier used in request records and chat messages.
    const payload = {
      userId: user.id,
      empId:  user.empId,
      name:   user.name,
      role:   user.role,
      dept:   user.dept,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * No DB hit — returns the user object already decoded from the JWT.
 * The `authenticate` middleware attaches req.user before this runs.
 */
function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
