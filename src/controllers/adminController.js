/**
 * src/controllers/adminController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Admin operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const adminService = require("../services/adminService");

function isUserAdminLike(user) {
  const { role, dept } = user;
  return ["Admin", "Management"].includes(role) || (role === "DeptHOD" && dept === "HR");
}

async function getUserLogReport(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const report = await adminService.getUserLogReport();
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getDeptTrackingReport(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const report = await adminService.getDeptTrackingReport();
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const { empId, name, email, password } = req.body;
    if (!empId || !name || !email || !password) return res.status(400).json({ error: "Missing fields." });

    const newUser = await adminService.createUser(req.body);
    res.status(201).json({ message: "User created successfully", user: { empId: newUser.empId, name: newUser.name } });
  } catch (err) {
    if (err.message.includes("already exists")) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const user = await adminService.toggleUserStatus(req.params.empId, req.body.isActive);
    res.json({ message: `User ${user.isActive ? "enabled" : "disabled"} successfully`, isActive: user.isActive });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const { empId } = req.params;
    const updatedUser = await adminService.updateUser(empId, req.body);
    res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserLogReport, createUser, toggleUserStatus, getDeptTrackingReport, updateUser };
