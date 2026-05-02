/**
 * src/services/authService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Authentication.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const roles = require("../constants/roles");
const prisma = require("../config/database");
const { sendPasswordResetEmail } = require("../utils/emailService");

class AuthService {
  async login(email, password) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { userRoles: { select: { role: true, dept: true } } },
    });

    if (!user || !user.isActive) throw new Error("Invalid credentials.");

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) throw new Error("Invalid credentials.");

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: now, lastSeen: now },
      }),
      prisma.loginLog.create({
        data: { empId: user.empId, loginAt: now },
      }),
    ]);

    // Multiple roles → require selection before issuing a full token
    if (user.userRoles.length > 1) {
      const tempToken = jwt.sign(
        { userId: user.id, empId: user.empId, name: user.name, location: user.location, type: "temp" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );
      return {
        needsRoleSelection: true,
        tempToken,
        availableRoles: user.userRoles,
      };
    }

    // Single role: use UserRole entry if present, else fall back to user.role/dept
    const activeRole = user.userRoles.length === 1
      ? { role: user.userRoles[0].role, dept: user.userRoles[0].dept }
      : { role: user.role, dept: user.dept };

    const payload = {
      userId:   user.id,
      empId:    user.empId,
      name:     user.name,
      role:     activeRole.role,
      dept:     activeRole.dept,
      location: user.location,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    return { token, user: payload };
  }

  async selectRole(userId, empId, role, dept) {
    const userRole = await prisma.userRole.findFirst({ where: { empId, role, dept } });
    if (!userRole) throw new Error("Invalid role selection.");

    const [user, availableRoles] = await Promise.all([
      prisma.user.findUnique({ where: { empId } }),
      prisma.userRole.findMany({ where: { empId }, select: { role: true, dept: true } }),
    ]);

    const payload = { userId, empId, name: user.name, role, dept, location: user.location };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
    return { token, user: { ...payload, availableRoles } };
  }

  async switchRole(empId, role, dept) {
    const userRole = await prisma.userRole.findFirst({ where: { empId, role, dept } });
    if (!userRole) throw new Error("Invalid role selection.");

    const [user, availableRoles] = await Promise.all([
      prisma.user.findUnique({ where: { empId } }),
      prisma.userRole.findMany({ where: { empId }, select: { role: true, dept: true } }),
    ]);

    const payload = { userId: user.id, empId, name: user.name, role, dept, location: user.location };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
    return { token, user: { ...payload, availableRoles } };
  }

  async logout(empId) {
    const now = new Date();
    const lastLog = await prisma.loginLog.findFirst({
      where: { empId, logoutAt: null },
      orderBy: { loginAt: "desc" },
    });

    if (lastLog) {
      const durationMinutes = Math.round((now - lastLog.loginAt) / 60000);
      await prisma.loginLog.update({
        where: { id: lastLog.id },
        data: {
          logoutAt: now,
          duration: durationMinutes,
        },
      });
    }
  }

  async heartbeat(userId, empId) {
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeen: now },
    });

    const lastLog = await prisma.loginLog.findFirst({
      where: { empId, logoutAt: null },
      orderBy: { loginAt: "desc" },
    });

    if (lastLog) {
      const durationMinutes = Math.round((now - lastLog.loginAt) / 60000);
      await prisma.loginLog.update({
        where: { id: lastLog.id },
        data: { duration: durationMinutes },
      });
    }
  }

  async forgotPassword(email) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) return;

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token, resetPasswordExpires: expires },
    });

    await sendPasswordResetEmail(user.email, user.name, token);
  }

  async resetPassword(token, password) {
    const user = await prisma.user.findUnique({
      where: { resetPasswordToken: token },
    });

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new Error("Invalid or expired reset link.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
  }

  async getUserById(empId) {
    return prisma.user.findUnique({
      where: { empId },
      select: {
        id: true, empId: true, name: true, role: true, dept: true, location: true,
        userRoles: { select: { role: true, dept: true } },
      },
    });
  }
}

module.exports = new AuthService();
