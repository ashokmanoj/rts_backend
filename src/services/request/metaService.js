"use strict";

const prisma = require("../../config/database");
const { buildRoleFilter } = require("./queryService");

async function getUsersByDept(depts) {
    const deptList = Array.isArray(depts) ? depts : [depts];
    const ASSIGNABLE_ROLES = ["RM", "HOD", "DeptHOD"];
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { dept: { in: deptList } },
          { userRoles: { some: { dept: { in: deptList }, role: { in: ASSIGNABLE_ROLES } } } },
        ],
      },
      select:  { empId: true, name: true, dept: true, designation: true, role: true, userRoles: { select: { role: true, dept: true } } },
      orderBy: { name: "asc" },
    });
    return users.map(u => ({
      empId:       u.empId,
      name:        u.name,
      dept:        u.dept,
      designation: u.designation,
      role:        u.role,
      roles:       u.userRoles.map(r => ({ role: r.role, dept: r.dept })),
    }));
  }

async function getDepartments() {
    const depts = await prisma.department.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { name: true },
    });
    return depts.map(d => d.name);
  }

async function getLocations() {
    const locs = await prisma.location.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { name: true },
    });
    return locs.map(l => l.name);
  }

async function markSeen(requestId, empId) {
    return prisma.requestRead.upsert({
      where:  { requestId_empId: { requestId, empId } },
      update: { createdAt: new Date() },
      create: { requestId, empId },
    });
  }

async function markUnread(requestId, empId) {
    return prisma.requestRead.deleteMany({ where: { requestId, empId } });
  }

async function getRoleCounts(user) {
  const { empId } = user;

  const availableRoles = await prisma.userRole.findMany({
    where:  { empId, isActive: true },
    select: { role: true, dept: true },
  });
  if (!availableRoles.length) return [];

  const counts = await Promise.all(
    availableRoles.map(async ({ role, dept: userDept }) => {
      // Use the same role filter as getAll so counts match what the user actually sees
      const roleFilter = buildRoleFilter({ role, empId, dept: userDept });
      const rf = Object.keys(roleFilter).length > 0 ? [roleFilter] : [];

      const count = await prisma.request.count({
        where: {
          AND: [
            ...rf,
            { isClosed: false },
            { NOT: { requestorRole: "broadcast" } },
            { readReceipts: { none: { empId } } },
          ],
        },
      });
      return { role, dept: userDept, count };
    })
  );
  return counts;
}

module.exports = { getDepartments, getLocations, getUsersByDept, markSeen, markUnread, getRoleCounts };
