/**
 * src/services/requestService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma = require("../config/database");
const { formatRequest } = require("../utils/formatters");
const { parsePagination, buildPageResponse } = require("../utils/paginate");

const WITH_OWNER = { owner: true, closeTicket: true, chatMessages: true, readReceipts: true };

class RequestService {
  buildFileUrl(req, filename) {
    if (!filename) return null;
    const base = process.env.SERVER_URL
      ? process.env.SERVER_URL.replace(/\/$/, "")
      : `${req.protocol}://${req.get("host")}`;
    return `${base}/uploads/${filename}`;
  }

  async getAll(user, query) {
    const { role, empId, dept: userDept } = user;
    const { page, limit, skip, take } = parsePagination(query);
    const { status, search, name, dept, assignedDept, type, startDate, endDate, assignedStatus } = query;

    let closureFilter = {};
    if (status === "open") closureFilter = { resolvedDate: null };
    if (status === "closed") closureFilter = { resolvedDate: { not: null } };

    let assignedStatusFilter = {};
    if (assignedStatus === "Open") assignedStatusFilter = { assignedStatus: "Open" };
    else if (assignedStatus === "Checking") assignedStatusFilter = { assignedStatus: "Checking" };
    else if (assignedStatus === "Closed") assignedStatusFilter = { assignedStatus: { contains: "(Closed)" } };

    let roleFilter = {};
    if (role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (["RM", "HOD", "DeptHOD"].includes(role)) {
      roleFilter = { OR: [{ empId }, { dept: userDept }, { assignedDept: userDept }] };
    } else {
      roleFilter = { OR: [{ empId }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] }] };
    }

    const extraFilters = [];
    if (name) extraFilters.push({ owner: { name: { contains: name, mode: "insensitive" } } });
    if (dept) extraFilters.push({ dept });
    if (assignedDept) extraFilters.push({ assignedDept });
    if (type === "sent") extraFilters.push({ empId });
    else if (type === "received") extraFilters.push({ assignedDept: userDept, empId: { not: empId } });

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateFilter.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter.lte = e;
      }
      extraFilters.push({ createdAt: dateFilter });
    }

    let searchFilter = {};
    if (search && search.trim()) {
      const term = search.trim();
      searchFilter = {
        OR: [
          { purpose: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { empId: { contains: term, mode: "insensitive" } },
          { owner: { name: { contains: term, mode: "insensitive" } } },
        ],
      };
    }

    const andClauses = [roleFilter, closureFilter, assignedStatusFilter, ...extraFilters];
    if (searchFilter.OR) andClauses.push(searchFilter);
    const where = { AND: andClauses.filter(f => Object.keys(f).length > 0) };

    const [requests, total] = await Promise.all([
      prisma.request.findMany({ where, include: WITH_OWNER, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.request.count({ where }),
    ]);

    return buildPageResponse(requests.map(r => formatRequest(r, empId)), total, page, limit);
  }

  async getFilterOptions(user) {
    const { role, empId, dept: userDept } = user;
    let roleFilter = {};
    if (role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (["RM", "HOD", "DeptHOD"].includes(role)) {
      roleFilter = { OR: [{ empId }, { dept: userDept }, { assignedDept: userDept }] };
    } else {
      roleFilter = { OR: [{ empId }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] }] };
    }

    const [rawNames, rawDepts, rawAssignedDepts] = await Promise.all([
      prisma.request.findMany({ where: roleFilter, select: { owner: { select: { name: true } } }, distinct: ['empId'] }),
      prisma.request.findMany({ where: roleFilter, select: { dept: true }, distinct: ['dept'] }),
      prisma.request.findMany({ where: roleFilter, select: { assignedDept: true }, distinct: ['assignedDept'] })
    ]);

    return {
      names: rawNames.map(r => r.owner.name).sort(),
      depts: rawDepts.map(r => r.dept).sort(),
      assignedDepts: rawAssignedDepts.map(r => r.assignedDept).sort(),
      assignedStatuses: ["Open", "Checking", "Closed"]
    };
  }

  async create(user, data, uploadedFile, req) {
    const { purpose, description, assignedDept } = data;
    const request = await prisma.request.create({
      data: {
        empId: user.empId,
        purpose,
        description: description || "",
        fileUrl: uploadedFile ? this.buildFileUrl(req, uploadedFile.filename) : null,
        fileName: uploadedFile ? uploadedFile.originalname : null,
        dept: user.dept,
        assignedDept: assignedDept || user.dept,
        readReceipts: { create: { empId: user.empId } }
      },
      include: WITH_OWNER,
    });
    return formatRequest(request, user.empId);
  }

  async approval(reqId, user, body) {
    const { decision, comment, newDept } = body;
    const now = new Date();

    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: { owner: true } });
    if (!existing) throw new Error("Request not found.");
    if (existing.isClosed) throw new Error("Cannot update a closed ticket.");
    if (user.role === "Admin") throw new Error("Admin has read-only access.");

    let updateData = {};
    if (decision === "Checking") updateData.assignedStatus = "Checking";

    const isSpecialRequest = ["RM", "HOD", "DeptHOD"].includes(existing.owner.role);

    if (decision === "Forwarded") {
      if (!newDept) throw new Error("newDept is required when forwarding.");
      updateData = { ...updateData, forwarded: true, forwardedBy: user.name, forwardedAt: now, assignedDept: newDept };
    } else if (isSpecialRequest) {
      if (user.role !== "Management") throw new Error("Special request can only be approved by Management.");
      updateData = { ...updateData, deptHodStatus: decision, deptHodDate: now };
    } else if (["RM", "HOD", "DeptHOD", "Management"].includes(user.role)) {
      const field = user.role === "RM" ? "rmStatus" : user.role === "HOD" ? "hodStatus" : "deptHodStatus";
      const dateField = user.role === "RM" ? "rmDate" : user.role === "HOD" ? "hodDate" : "deptHodDate";
      updateData[field] = decision;
      updateData[dateField] = now;
    } else {
      const isTeamMember = existing.assignedDept === user.dept;
      if (!(isTeamMember && decision === "Checking")) throw new Error("Unauthorized approval.");
    }

    await prisma.requestRead.deleteMany({ where: { requestId: reqId, empId: { not: user.empId } } });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER });

    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId: user.empId,
        author: user.name,
        role: user.role,
        type: "approval",
        text: comment || `${decision} the request.`,
        status: decision,
        purpose: updated.purpose,
        changedDept: decision === "Forwarded" ? newDept : null,
        originalDept: existing.assignedDept,
      },
    });

    return formatRequest(updated, user.empId);
  }

  async close(reqId, user, body, uploadedFile, req) {
    const { note } = body;
    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    if (existing.isClosed) throw new Error("Ticket already closed.");

    const canClose = ["DeptHOD", "Management"].includes(user.role) || (existing.assignedDept === user.dept && existing.dept !== user.dept);
    if (!canClose) throw new Error("Not authorized to close.");

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN");
    const fUrl = uploadedFile ? this.buildFileUrl(req, uploadedFile.filename) : null;
    const fName = uploadedFile ? uploadedFile.originalname : null;
    const isImg = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;

    await prisma.closeTicket.create({ data: { requestId: reqId, description: note || "No reason", fileUrl: fUrl, fileName: fName, closedDate: now } });
    await prisma.requestRead.deleteMany({ where: { requestId: reqId, empId: { not: user.empId } } });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({
      where: { id: reqId },
      data: { assignedStatus: `${dateStr} (Closed)`, isClosed: true, resolvedDate: now, resolvedBy: user.name },
      include: WITH_OWNER,
    });

    const closureText = note ? `🔒 Ticket closed by ${user.name} (${user.dept})\n\nResolution note: ${note} ` : `🔒 Ticket closed by ${user.name} (${user.dept})`;
    await prisma.chatMessage.create({ data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, type: "system", text: closureText, fileUrl: fUrl, fileName: fName, isImage: isImg } });

    return formatRequest(updated, user.empId);
  }

  async markSeen(requestId, empId) {
    return prisma.requestRead.upsert({ where: { requestId_empId: { requestId, empId } }, update: {}, create: { requestId, empId } });
  }

  async markUnread(requestId, empId) {
    return prisma.requestRead.deleteMany({ where: { requestId, empId } });
  }
}

module.exports = new RequestService();
