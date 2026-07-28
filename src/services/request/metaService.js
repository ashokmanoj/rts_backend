"use strict";

const prisma = require("../../config/database");

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
      where:  { empId },
      select: { role: true, dept: true },
    });
    if (!availableRoles.length) return [];

    const RESTRICTED_PREFIXES = ["Operations-", "Academics-", "Stores-"];
    const RESTRICTED_EXACT    = new Set(["Game Development", "Software", "Animation", "Management", "HR", "Purchase"]);
    const isRestricted = (dept) =>
      RESTRICTED_PREFIXES.some(p => dept?.startsWith(p)) || RESTRICTED_EXACT.has(dept);

    const counts = await Promise.all(
      availableRoles.map(async ({ role, dept: userDept }) => {
        let roleFilter = {};

        if (role === "SuperUser" || role === "Management" || role === "Admin") {
          roleFilter = {};
        } else if (role === "Requestor") {
          roleFilter = isRestricted(userDept)
            ? { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: "broadcast" }, { ccDepts: "ALL" }] }] }
            : { OR: [{ empId }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { assignedPersonEmpId: { contains: empId } }, { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: "broadcast" }, { ccDepts: "ALL" }] }] };
        } else if (role === "DeptHOD") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ dept: userDept }, { assignedDept: userDept }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else if (role === "RM") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else if (role === "HOD") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else {
          roleFilter = { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }] };
        }

        const andFilters = [
          { isClosed: false },
          { NOT: { requestorRole: "broadcast" } },
          { readReceipts: { none: { empId } } },
        ];
        if (Object.keys(roleFilter).length > 0) andFilters.unshift(roleFilter);

        const count = await prisma.request.count({ where: { AND: andFilters } });
        return { role, dept: userDept, count };
      })
    );
    return counts;
  }

module.exports = { getDepartments, getLocations, getUsersByDept, markSeen, markUnread, getRoleCounts };
