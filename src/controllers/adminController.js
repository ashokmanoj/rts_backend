/**
 * src/controllers/adminController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Admin operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const adminService = require("../services/adminService");
const { isOnline }  = require("../utils/presenceService");

function isUserAdminLike(user) {
  const role = (user?.role || "").trim();
  const dept = (user?.dept || "").trim().toLowerCase();
  return ["SuperUser", "Admin", "Management"].includes(role) || (role === "DeptHOD" && dept === "hr");
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
    if (err.status === 400 || err.message.includes("already exists")) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function bulkCreateUsers(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const { users } = req.body;
    if (!Array.isArray(users) || users.length === 0) return res.status(400).json({ error: "No users provided." });
    if (users.length > 200) return res.status(400).json({ error: "Maximum 200 users per upload." });
    const result = await adminService.bulkCreateUsers(users);
    res.status(201).json(result);
  } catch (err) {
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
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    if (req.user.role !== "SuperUser") return res.status(403).json({ error: "Access denied." });
    const { empId } = req.params;
    const { newPassword } = req.body;
    await adminService.resetPassword(empId, newPassword);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function getUserRoles(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const data = await adminService.getUserRoles(req.query);
    res.json(data);
  } catch (err) { next(err); }
}

async function addUserRole(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const { empId, role, dept } = req.body;
    if (!empId || !role || !dept) return res.status(400).json({ error: "empId, role and dept are required." });
    const entry = await adminService.addUserRole(empId, role, dept);
    res.status(201).json(entry);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function updateUserRole(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id." });
    const { role, dept } = req.body;
    if (!role || !dept) return res.status(400).json({ error: "role and dept are required." });
    const entry = await adminService.updateUserRole(id, role, dept);
    res.json(entry);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function toggleUserRole(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id." });
    const entry = await adminService.toggleUserRole(id);
    res.json(entry);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function deleteUserRole(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id." });
    await adminService.deleteUserRole(id);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

// ── Department CRUD ────────────────────────────────────────────────────────
async function getDepartments(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const depts = await adminService.getDepartmentList();
    res.json(depts);
  } catch (err) { next(err); }
}

async function createDepartment(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const dept = await adminService.createDepartment(req.body.name);
    res.status(201).json(dept);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "Department already exists." });
    next(err);
  }
}

async function updateDepartment(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const dept = await adminService.updateDepartment(req.params.id, req.body);
    res.json(dept);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Department name already exists." });
    next(err);
  }
}

async function deleteDepartment(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    await adminService.deleteDepartment(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ── Location CRUD ──────────────────────────────────────────────────────────
async function getLocations(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const locs = await adminService.getLocationList();
    res.json(locs);
  } catch (err) { next(err); }
}

async function createLocation(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const loc = await adminService.createLocation(req.body.name);
    res.status(201).json(loc);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "Location already exists." });
    next(err);
  }
}

async function updateLocation(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    const loc = await adminService.updateLocation(req.params.id, req.body);
    res.json(loc);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Location name already exists." });
    next(err);
  }
}

async function deleteLocation(req, res, next) {
  try {
    if (!isUserAdminLike(req.user)) return res.status(403).json({ error: "Access denied." });
    await adminService.deleteLocation(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ── Mobile Users ───────────────────────────────────────────────────────────
async function getMobileUsers(req, res, next) {
  try {
    if (req.user.role !== "SuperUser") return res.status(403).json({ error: "Access denied." });
    const users = await adminService.getMobileUsers(isOnline);
    res.json(users);
  } catch (err) { next(err); }
}

module.exports = { getUserLogReport, createUser, bulkCreateUsers, toggleUserStatus, getDeptTrackingReport, updateUser, resetPassword, getUserRoles, addUserRole, updateUserRole, toggleUserRole, deleteUserRole, getDepartments, createDepartment, updateDepartment, deleteDepartment, getLocations, createLocation, updateLocation, deleteLocation, getMobileUsers };
