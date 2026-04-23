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
      return {
        slNo: index + 1,
        id: user.id,
        name: user.name,
        empId: user.empId,
        dept: user.dept,
        phone: user.phone || "N/A",
        email: user.email,
        role: user.role,
        designation: user.designation,
        location: user.location,
        lastLogin: user.lastLogin,
        totalUsageHours: (totalDurationMinutes / 60).toFixed(2),
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
    const { empId, name, email, phone, role, dept, designation, location, password, rmEmpId, hodEmpId } = data;
    const existing = await prisma.user.findFirst({ where: { OR: [{ empId }, { email: email.toLowerCase() }] } });
    if (existing) throw new Error("User with this Employee ID or Email already exists.");

    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({
      data: { 
        empId, 
        name, 
        email: email.toLowerCase(), 
        phone, 
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

  async updateUser(empId, data) {
    const { name, email, phone, role, dept, designation, location, rmEmpId, hodEmpId } = data;
    
    return prisma.user.update({
      where: { empId },
      data: {
        name,
        email: email?.toLowerCase(),
        phone,
        role,
        dept,
        designation,
        location,
        rmEmpId: rmEmpId || null,
        hodEmpId: hodEmpId || null,
      }
    });
  }

  async toggleUserStatus(empId, isActive) {
    return prisma.user.update({ where: { empId }, data: { isActive } });
  }
}

module.exports = new AdminService();
