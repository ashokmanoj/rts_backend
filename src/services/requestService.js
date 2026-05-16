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
const { sendNewRequestNotification } = require("../utils/pushService");

const WITH_OWNER = { owner: true, closeTicket: true, chatMessages: true, readReceipts: true };

class RequestService {
  buildFileUrl(req, filename) {
    if (!filename) return null;
    const base = process.env.SERVER_URL
      ? process.env.SERVER_URL.replace(/\/$/, "")
      : `${req.protocol}://${req.get("host")}`;
    return `${base}/api/files/${filename}`;
  }

  async getAll(user, query) {
    const { role, empId, dept: userDept } = user;
    const { page, limit, skip, take } = parsePagination(query);
    const { status, search, name, dept, assignedDept, type, startDate, endDate, assignedStatus, priority } = query;

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
    } else if (role === "DeptHOD") {
      roleFilter = { OR: [{ empId }, { dept: userDept }, { assignedDept: userDept }] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { empId },
          { owner: { rmEmpId: empId } },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { empId },
          { owner: { hodEmpId: empId } },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        ],
      };
    } else {
      // Regular staff: own requests + dept-wide requests with no specific assignee + specifically named
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { OR: [{ assignedPersonEmpId: null }, { assignedPersonEmpId: "" }] }] },
          { assignedPersonEmpId: { contains: empId } },
        ],
      };
    }

    const extraFilters = [];
    if (name) extraFilters.push({ owner: { name: { contains: name, mode: "insensitive" } } });
    if (dept) extraFilters.push({ dept });
    if (assignedDept) extraFilters.push({ assignedDept });

    if (priority) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      if (priority === "Overdue") {
        extraFilters.push({ dueDate: { not: null, lt: today } });
      } else if (priority === "High") {
        const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
        extraFilters.push({ dueDate: { gte: today, lte: endOfDay(d7) } });
      } else if (priority === "Medium") {
        const d8  = new Date(today); d8.setDate(d8.getDate() + 8);
        const d15 = new Date(today); d15.setDate(d15.getDate() + 15);
        extraFilters.push({ dueDate: { gte: d8, lte: endOfDay(d15) } });
      } else if (priority === "Low") {
        const d16 = new Date(today); d16.setDate(d16.getDate() + 16);
        const d30 = new Date(today); d30.setDate(d30.getDate() + 30);
        extraFilters.push({ dueDate: { gte: d16, lte: endOfDay(d30) } });
      }
    }
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
    } else if (role === "DeptHOD") {
      roleFilter = { OR: [{ empId }, { dept: userDept }, { assignedDept: userDept }] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { empId },
          { owner: { rmEmpId: empId } },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { empId },
          { owner: { hodEmpId: empId } },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        ],
      };
    } else {
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { OR: [{ assignedPersonEmpId: null }, { assignedPersonEmpId: "" }] }] },
          { assignedPersonEmpId: { contains: empId } },
        ],
      };
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

  async getById(reqId, user) {
    const row = await prisma.request.findUnique({ where: { id: reqId }, include: WITH_OWNER });
    if (!row) return null;
    return formatRequest(row, user.empId);
  }

  async create(user, data, uploadedFiles, req) {
    const { purpose, description, assignedDept, assignedDepts, dueDate, assignedPersonEmpId, assignedPersonName } = data;

    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    const first = files[0] ?? null;

    const request = await prisma.request.create({
      data: {
        empId:               user.empId,
        purpose,
        description:         description || "",
        fileUrl:             first ? this.buildFileUrl(req, first.filename) : null,
        fileName:            first ? first.originalname : null,
        fileUrls:            files.length > 0 ? JSON.stringify(files.map(f => this.buildFileUrl(req, f.filename))) : null,
        fileNames:           files.length > 0 ? JSON.stringify(files.map(f => f.originalname)) : null,
        dept:                user.dept,
        assignedDept:        (Array.isArray(assignedDept) ? assignedDept[0] : assignedDept) || user.dept,
        assignedDepts:       (Array.isArray(assignedDepts) ? assignedDepts[0] : assignedDepts) || null,
        requestorRole:       user.role,
        dueDate:             dueDate ? new Date(dueDate) : null,
        assignedPersonEmpId: assignedPersonEmpId || null,
        assignedPersonName:  Array.isArray(assignedPersonName) ? (assignedPersonName[0] || null) : (assignedPersonName || null),
        readReceipts:        { create: { empId: user.empId } },
      },
      include: WITH_OWNER,
    });

    // Fire push notifications to RM, HOD, DeptHOD (non-blocking)
    sendNewRequestNotification(request).catch(() => {});

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
    if (decision === "Checking") {
      updateData.assignedStatus = "Checking";
      updateData.checkingBy     = `${user.name} (${user.role})`;
      if (body.checkingDeadline) updateData.checkingDeadline = new Date(body.checkingDeadline);
      if (body.checkingReason)   updateData.checkingReason   = body.checkingReason;
    }

    if (decision === "Forwarded") {
      if (!newDept) throw new Error("newDept is required when forwarding.");
      updateData = { ...updateData, forwarded: true, forwardedBy: user.name, forwardedAt: now, assignedDept: newDept };
    } else if (["RM", "HOD", "DeptHOD", "Management"].includes(user.role)) {
      const field = user.role === "RM" ? "rmStatus" : user.role === "HOD" ? "hodStatus" : "deptHodStatus";
      const dateField = user.role === "RM" ? "rmDate" : user.role === "HOD" ? "hodDate" : "deptHodDate";
      updateData[field] = decision;
      updateData[dateField] = now;
    } else {
      const isTeamMember = existing.assignedDept === user.dept;
      const isAssigned = existing.assignedPersonEmpId
        ? existing.assignedPersonEmpId.split(",").map(s => s.trim()).includes(user.empId)
        : false;
      if (!((isTeamMember || isAssigned) && decision === "Checking")) throw new Error("Unauthorized approval.");
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
    if (existing.isClosed || existing.assignedStatus === "Pending Acknowledgement") throw new Error("Ticket already closed.");

    const canClose = ["DeptHOD", "Management"].includes(user.role) || (existing.assignedDept === user.dept && existing.dept !== user.dept);
    if (!canClose) throw new Error("Not authorized to close.");

    const now = new Date();
    const fUrl = uploadedFile ? this.buildFileUrl(req, uploadedFile.filename) : null;
    const fName = uploadedFile ? uploadedFile.originalname : null;
    const isImg = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;

    await prisma.closeTicket.create({ data: { requestId: reqId, description: note || "No reason", fileUrl: fUrl, fileName: fName, closedDate: now } });
    await prisma.requestRead.deleteMany({ where: { requestId: reqId, empId: { not: user.empId } } });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({
      where: { id: reqId },
      data: { assignedStatus: "Pending Acknowledgement", isClosed: false, resolvedDate: now, resolvedBy: user.name },
      include: WITH_OWNER,
    });

    const closureText = note
      ? `🔒 Resolution submitted by ${user.name} (${user.dept}) — awaiting requestor acknowledgement.\n\nResolution note: ${note}`
      : `🔒 Resolution submitted by ${user.name} (${user.dept}) — awaiting requestor acknowledgement.`;
    await prisma.chatMessage.create({ data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, type: "system", text: closureText, fileUrl: fUrl, fileName: fName, isImage: isImg } });

    return formatRequest(updated, user.empId);
  }

  async getHodPendingRequests(user) {
    const requests = await prisma.request.findMany({
      where: {
        OR: [
          {
            requestorRole: "HOD",
            hodStatus:     { in: ["--", "Checking"] },
            rmStatus:      { not: "Rejected" },
            isClosed:      false,
          },
          {
            isClosed: false,
            owner: {
              OR: [
                { rmEmpId:  { in: ["GN-01", "GN-02"] } },
                { hodEmpId: { in: ["GN-01", "GN-02"] } },
              ],
            },
          },
        ],
      },
      include: WITH_OWNER,
      orderBy: { createdAt: "desc" },
    });
    return requests.map(r => formatRequest(r, user.empId));
  }

  async hodApproval(reqId, user, body) {
    const { decision, comment } = body;

    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: { owner: true } });
    if (!existing) throw new Error("Request not found.");
    if (existing.isClosed) throw new Error("Cannot update a closed ticket.");

    const GN_MANAGERS = ["GN-01", "GN-02"];
    const isGnRequest = GN_MANAGERS.includes(existing.owner?.rmEmpId) || GN_MANAGERS.includes(existing.owner?.hodEmpId);
    const validDecisions = isGnRequest
      ? ["Approved", "Checking", "Rejected", "Close"]
      : ["Approved", "Rejected"];

    if (!validDecisions.includes(decision)) {
      throw new Error(`Decision must be one of: ${validDecisions.join(", ")}.`);
    }

    const now = new Date();

    await prisma.requestRead.deleteMany({ where: { requestId: reqId, empId: { not: user.empId } } });
    await prisma.requestRead.upsert({
      where: { requestId_empId: { requestId: reqId, empId: user.empId } },
      update: {},
      create: { requestId: reqId, empId: user.empId },
    });

    const updateData = decision === "Close"
      ? { hodStatus: "Closed", hodDate: now, isClosed: true }
      : { hodStatus: decision, hodDate: now };

    const updated = await prisma.request.update({
      where: { id: reqId },
      data: updateData,
      include: WITH_OWNER,
    });

    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId:  user.empId,
        author:    user.name,
        role:      user.role,
        type:      "approval",
        text:      comment || `${decision} the request.`,
        status:    decision === "Close" ? "Closed" : decision,
        purpose:   updated.purpose,
        changedDept:  null,
        originalDept: existing.assignedDept,
      },
    });

    return formatRequest(updated, user.empId);
  }

  async acknowledge(reqId, user, body) {
    const { status } = body;
    if (!["Received", "Not Received"].includes(status))
      throw new Error("status must be 'Received' or 'Not Received'.");

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    if (existing.assignedStatus !== "Pending Acknowledgement")
      throw new Error("No pending acknowledgement for this ticket.");
    if (existing.empId !== user.empId) throw new Error("Only the requestor can acknowledge.");

    const now = new Date();
    let updateData;
    let chatText;

    if (status === "Received") {
      const dateStr = now.toLocaleDateString("en-IN");
      updateData = { acknowledgement: "Received", acknowledgedAt: now, isClosed: true, assignedStatus: `${dateStr} (Closed)` };
      chatText = "✅ Requestor confirmed receipt — ticket is now officially closed.";
    } else {
      // Not Received: reopen the ticket
      updateData = { acknowledgement: null, acknowledgedAt: null, isClosed: false, assignedStatus: "Open", resolvedDate: null, resolvedBy: null };
      chatText = "🔄 Requestor reported not received — ticket has been reopened.";
      await prisma.closeTicket.deleteMany({ where: { requestId: reqId } });
    }

    const updated = await prisma.request.update({
      where: { id: reqId },
      data:  updateData,
      include: WITH_OWNER,
    });

    await prisma.chatMessage.create({
      data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, type: "system", text: chatText },
    });

    return formatRequest(updated, user.empId);
  }

  async getUsersByDept(depts) {
    const deptList = Array.isArray(depts) ? depts : [depts];
    return prisma.user.findMany({
      where:   { dept: { in: deptList }, isActive: true },
      select:  { empId: true, name: true, dept: true, designation: true, role: true },
      orderBy: { name: "asc" },
    });
  }

  async markSeen(requestId, empId) {
    return prisma.requestRead.upsert({ where: { requestId_empId: { requestId, empId } }, update: {}, create: { requestId, empId } });
  }

  async markUnread(requestId, empId) {
    return prisma.requestRead.deleteMany({ where: { requestId, empId } });
  }
}

module.exports = new RequestService();
