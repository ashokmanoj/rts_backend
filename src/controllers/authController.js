/**
 * src/controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Authentication.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const authService = require("../services/authService");

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    if (err.message === "Invalid credentials.") return res.status(401).json({ error: err.message });
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function heartbeat(req, res, next) {
  try {
    await authService.heartbeat(req.user.userId || req.user.id, req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.empId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { userRoles, ...rest } = user;
    res.json({
      user: {
        userId:         user.id,
        ...rest,
        role:           req.user.role,   // use JWT-selected role, not DB default
        dept:           req.user.dept,   // use JWT-selected dept, not DB default
        availableRoles: userRoles,       // all role/dept pairs for this user
      },
    });
  } catch (err) {
    next(err);
  }
}

async function selectRole(req, res, next) {
  try {
    const { role, dept } = req.body;
    if (!role || !dept) return res.status(400).json({ error: "role and dept are required." });
    const result = await authService.selectRole(req.user.userId, req.user.empId, role, dept);
    res.json(result);
  } catch (err) {
    if (err.message === "Invalid role selection.") return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function switchRole(req, res, next) {
  try {
    const { role, dept } = req.body;
    if (!role || !dept) return res.status(400).json({ error: "role and dept are required." });
    const result = await authService.switchRole(req.user.empId, role, dept);
    res.json(result);
  } catch (err) {
    if (err.message === "Invalid role selection.") return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    
    await authService.forgotPassword(email);
    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password required." });
    if (password.length < 8) return res.status(400).json({ error: "Min 8 chars required." });

    await authService.resetPassword(token, password);
    res.json({ message: "Password reset successfully." });
  } catch (err) {
    if (err.message === "Invalid or expired reset link.") return res.status(400).json({ error: err.message });
    next(err);
  }
}

module.exports = { login, me, selectRole, switchRole, logout, heartbeat, forgotPassword, resetPassword };
