/**
 * src/services/adminService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Admin operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const roles = require("../constants/roles");
const prisma = require("../config/database");
const bcrypt = require("bcryptjs");

class AdminService {
  async getUserLogReport() {
    const users = await prisma.user.findMany({
      include: { loginLogs: true },
      orderBy: { name: "asc" },
    });

    return users.map((user, index) => {
      const totalDurationMinutes = user.loginLogs.reduce((acc, log) => acc + (log.duration || 0), 0);

      // Group login durations by calendar day (YYYY-MM-DD in IST)
      const dailyMap = {};
      user.loginLogs.forEach(log => {
        if (!log.loginAt) return;
        const day = new Date(log.loginAt).toLocaleDateString("en-CA"); // "YYYY-MM-DD"
        dailyMap[day] = (dailyMap[day] || 0) + (log.duration || 0);
      });
      const dailyUsage = Object.entries(dailyMap)
        .map(([date, minutes]) => ({ date, minutes, hours: parseFloat((minutes / 60).toFixed(2)) }))
        .sort((a, b) => b.date.localeCompare(a.date));

      return {
        slNo: index + 1,
        id: user.id,
        name: user.name,
        empId: user.empId,
        dept: user.dept,
        phone: user.phone || "N/A",
        altPhone: user.altPhone || "",
        email: user.email,
        role: user.role,
        designation: user.designation,
        location: user.location,
        lastLogin: user.lastLogin,
        totalUsageMinutes: totalDurationMinutes,
        totalUsageHours: (totalDurationMinutes / 60).toFixed(2),
        dailyUsage,
        isActive: user.isActive,
        rmEmpId: user.rmEmpId,
        hodEmpId: user.hodEmpId,
      };
    });
  }

  async getDeptTrackingReport() {
    const requests = await prisma.request.findMany();
    const deptStats = {};

    requests.forEach((req) => {
      const dept = req.assignedDept || "Unknown";
      if (!deptStats[dept]) {
        deptStats[dept] = { deptName: dept, total: 0, open: 0, pending: 0, closed: 0, rejected: 0, totalResolutionDays: 0, resolvedCount: 0 };
      }
      deptStats[dept].total++;
      if (req.isClosed) {
        deptStats[dept].closed++;
        if (req.resolvedDate) {
          deptStats[dept].totalResolutionDays += (new Date(req.resolvedDate) - new Date(req.createdAt)) / (1000 * 60 * 60 * 24);
          deptStats[dept].resolvedCount++;
        }
      } else {
        if (req.assignedStatus === "Open") deptStats[dept].open++;
        else deptStats[dept].pending++;
      }
      if (req.rmStatus === "Rejected" || req.hodStatus === "Rejected" || req.deptHodStatus === "Rejected") {
        deptStats[dept].rejected++;
      }
    });

    return Object.values(deptStats).map(dept => ({
      ...dept,
      avgResolutionDays: dept.resolvedCount > 0 ? (dept.totalResolutionDays / dept.resolvedCount).toFixed(1) : "N/A",
      efficiency: dept.total > 0 ? Math.round((dept.closed / dept.total) * 100) : 0
    }));
  }

  async createUser(data) {
    const { empId, name, email, phone, altPhone, role, dept, designation, location, password, rmEmpId, hodEmpId } = data;
    const existing = await prisma.user.findFirst({ where: { OR: [{ empId }, { email: { equals: email.trim(), mode: "insensitive" } }] } });
    if (existing) throw new Error("User with this Employee ID or Email already exists.");

    if (rmEmpId) {
      const rm = await prisma.user.findUnique({ where: { empId: rmEmpId } });
      if (!rm) throw Object.assign(new Error(`RM Employee ID "${rmEmpId}" not found.`), { status: 400 });
    }
    if (hodEmpId) {
      const hod = await prisma.user.findUnique({ where: { empId: hodEmpId } });
      if (!hod) throw Object.assign(new Error(`HOD Employee ID "${hodEmpId}" not found.`), { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({
      data: {
        empId,
        name,
        email: email.toLowerCase(),
        phone,
        altPhone: altPhone || null,
        role: role || roles.REQUESTOR,
        dept: dept || "Other",
        designation,
        location,
        passwordHash,
        rmEmpId: rmEmpId || null,
        hodEmpId: hodEmpId || null,
      }
    });
  }

  async bulkCreateUsers(users) {
    const created = [];
    const failed  = [];
    for (const data of users) {
      try {
        const user = await this.createUser(data);
        created.push({ empId: user.empId, name: user.name });
      } catch (err) {
        failed.push({ empId: data.empId || "", name: data.name || "", reason: err.message });
      }
    }
    return { created, failed };
  }

  async updateUser(empId, data) {
    const { name, email, phone, altPhone, role, dept, designation, location, rmEmpId, hodEmpId } = data;

    if (rmEmpId) {
      const rm = await prisma.user.findUnique({ where: { empId: rmEmpId } });
      if (!rm) throw Object.assign(new Error(`RM Employee ID "${rmEmpId}" not found.`), { status: 400 });
    }
    if (hodEmpId) {
      const hod = await prisma.user.findUnique({ where: { empId: hodEmpId } });
      if (!hod) throw Object.assign(new Error(`HOD Employee ID "${hodEmpId}" not found.`), { status: 400 });
    }

    return prisma.user.update({
      where: { empId },
      data: {
        name,
        email: email?.toLowerCase(),
        phone,
        altPhone: altPhone || null,
        role,
        dept,
        designation,
        location,
        rmEmpId: rmEmpId || null,
        hodEmpId: hodEmpId || null,
      }
    });
  }

  // ── Department CRUD ────────────────────────────────────────────────────────
  async getDepartmentList() {
    return prisma.department.findMany({ orderBy: { name: "asc" } });
  }

  async createDepartment(name) {
    if (!name?.trim()) throw Object.assign(new Error("Department name is required."), { status: 400 });
    return prisma.department.create({ data: { name: name.trim() } });
  }

  async updateDepartment(id, data) {
    const { name, isActive } = data;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (isActive !== undefined) update.isActive = isActive;
    return prisma.department.update({ where: { id: Number(id) }, data: update });
  }

  async deleteDepartment(id) {
    return prisma.department.delete({ where: { id: Number(id) } });
  }

  // ── Location CRUD ─────────────────────────────────────────────────────────
  async getLocationList() {
    return prisma.location.findMany({ orderBy: { name: "asc" } });
  }

  async createLocation(name) {
    if (!name?.trim()) throw Object.assign(new Error("Location name is required."), { status: 400 });
    return prisma.location.create({ data: { name: name.trim() } });
  }

  async updateLocation(id, data) {
    const { name, isActive } = data;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (isActive !== undefined) update.isActive = isActive;
    return prisma.location.update({ where: { id: Number(id) }, data: update });
  }

  async deleteLocation(id) {
    return prisma.location.delete({ where: { id: Number(id) } });
  }

  async toggleUserStatus(empId, isActive) {
    return prisma.user.update({ where: { empId }, data: { isActive } });
  }

  async resetPassword(empId, newPassword) {
    if (!newPassword || newPassword.length < 6)
      throw new Error("Password must be at least 6 characters.");
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { empId }, data: { passwordHash: hash } });
    return { success: true };
  }

  // ── User Roles CRUD ──────────────────────────────────────────────────────────

  async getUserRoles({ search, role, dept } = {}) {
    const where = {};
    if (role) where.role = role;
    if (dept) where.dept = dept;
    if (search) {
      where.OR = [
        { empId: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    const rows = await prisma.userRole.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: [{ empId: "asc" }, { role: "asc" }, { dept: "asc" }],
    });
    return rows.map(r => ({
      id:       r.id,
      empId:    r.empId,
      name:     r.user?.name || "",
      role:     r.role,
      dept:     r.dept,
      isActive: r.isActive,
    }));
  }

  async addUserRole(empId, role, dept) {
    const user = await prisma.user.findUnique({ where: { empId } });
    if (!user) throw Object.assign(new Error(`User ${empId} not found.`), { status: 404 });

    // If an inactive record already exists for this combo, reactivate it instead of creating a duplicate
    const existing = await prisma.userRole.findFirst({ where: { empId, role, dept } });
    if (existing) {
      if (existing.isActive) throw Object.assign(new Error("This role/dept combination already exists for this user."), { status: 400 });
      return await prisma.userRole.update({ where: { id: existing.id }, data: { isActive: true } });
    }

    return await prisma.userRole.create({ data: { empId, role, dept } });
  }

  async updateUserRole(id, role, dept) {
    const existing = await prisma.userRole.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Role entry not found."), { status: 404 });
    try {
      return await prisma.userRole.update({ where: { id }, data: { role, dept } });
    } catch (e) {
      if (e.code === "P2002") throw Object.assign(new Error("This role/dept combination already exists for this user."), { status: 400 });
      throw e;
    }
  }

  async toggleUserRole(id) {
    const existing = await prisma.userRole.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Role entry not found."), { status: 404 });
    return await prisma.userRole.update({ where: { id }, data: { isActive: !existing.isActive } });
  }

  async deleteUserRole(id) {
    const existing = await prisma.userRole.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Role entry not found."), { status: 404 });
    await prisma.userRole.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = new AdminService();
