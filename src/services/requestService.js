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
    const { status, search, name, dept, assignedDept, type, startDate, endDate, rmStatus: rmStatusParam, deptHodStatus: deptHodStatusParam, priority, sortOrder, unread, latest } = query;

    // Parse comma-separated multi-value params
    const parseMulti = (val) => val ? val.split(",").map(s => s.trim()).filter(Boolean) : [];
    const rmStatuses      = parseMulti(rmStatusParam);
    const deptHodStatuses = parseMulti(deptHodStatusParam);
    const priorities      = parseMulti(priority);
    const depts           = parseMulti(dept);
    const assignedDepts   = parseMulti(assignedDept);
    const names           = parseMulti(name);
    const types           = parseMulti(type);

    let closureFilter = {};
    if (status === "open") closureFilter = { resolvedDate: null };
    if (status === "closed") closureFilter = { resolvedDate: { not: null } };

    let roleFilter = {};
    if (role === "SuperUser" || role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (role === "DeptHOD") {
      // DeptHOD sees:
      //   1. Own requests
      //   2. External incoming: other dept → their dept  (assignedDept = userDept, dept ≠ userDept)
      //   3. Self-targeted: user targets their own dept  (dept = userDept AND assignedDept = userDept)
      //   4. Forwarding chain
      // Does NOT see: outgoing from their dept to other depts (dept = userDept, assignedDept ≠ userDept)
      roleFilter = { OR: [
        { empId },
        { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        { AND: [{ dept: userDept }, { assignedDept: userDept }] },
        { assignedDepts: { contains: userDept } },
      ] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { empId },
          // Own dept direct reports (outgoing requests)
          { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
          // Incoming from other depts (current assignedDept)
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          // Tracking — incoming forwarded away: all dept RMs can track (dept ≠ userDept)
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }] },
          // Tracking — outgoing forwarded away: only the specific RM sees their direct report's request
          { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }] },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { empId },
          // Own dept direct reports (outgoing requests)
          { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
          // Incoming from other depts
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          // Tracking — incoming forwarded away: all dept HODs can track
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }] },
          // Tracking — outgoing forwarded away: only the specific HOD sees their direct report's request
          { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }] },
        ],
      };
    } else if (["Academic", "Animation", "Software"].includes(userDept)) {
      // These depts: only own requests + specifically assigned (no dept-wide visibility)
      roleFilter = {
        OR: [
          { empId },
          { assignedPersonEmpId: { contains: empId } },
        ],
      };
    } else {
      // Other regular staff: own requests + incoming to their dept + specifically assigned + forwarding chain
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { assignedPersonEmpId: { contains: empId } },
          // Tracking: requests forwarded from/through their dept remain visible
          { assignedDepts: { contains: userDept } },
        ],
      };
    }

    const extraFilters = [];

    // Name (multi)
    if (names.length === 1) {
      extraFilters.push({ owner: { name: { contains: names[0], mode: "insensitive" } } });
    } else if (names.length > 1) {
      extraFilters.push({ OR: names.map(n => ({ owner: { name: { contains: n, mode: "insensitive" } } })) });
    }

    // Dept (multi)
    if (depts.length === 1)      extraFilters.push({ dept: depts[0] });
    else if (depts.length > 1)   extraFilters.push({ dept: { in: depts } });

    // Assigned dept (multi)
    if (assignedDepts.length === 1)    extraFilters.push({ assignedDept: assignedDepts[0] });
    else if (assignedDepts.length > 1) extraFilters.push({ assignedDept: { in: assignedDepts } });

    // When either status filter is active, automatically exclude closed tickets
    if (rmStatuses.length > 0 || deptHodStatuses.length > 0) {
      extraFilters.push({ isClosed: false });
    }

    // Requestor Dept Status — "Open" (--) means BOTH rm and hod haven't acted;
    // "ack_pending" = Pending Acknowledgement; others = either rm or hod matches
    if (rmStatuses.length > 0) {
      const hasOpen       = rmStatuses.includes("--");
      const hasAckPending = rmStatuses.includes("ack_pending");
      const others        = rmStatuses.filter(s => s !== "--" && s !== "ack_pending");
      const clauses       = [];
      if (hasOpen)          clauses.push({ AND: [{ rmStatus: "--" }, { hodStatus: "--" }] });
      if (hasAckPending)    clauses.push({ assignedStatus: "Pending Acknowledgement" });
      if (others.length === 1)  clauses.push({ OR: [{ rmStatus: others[0] }, { hodStatus: others[0] }] });
      if (others.length  > 1)  clauses.push({ OR: [{ rmStatus: { in: others } }, { hodStatus: { in: others } }] });
      extraFilters.push(clauses.length === 1 ? clauses[0] : { OR: clauses });
    }

    // Assigned Dept Status — "Open" (--) means ALL three assigned-dept fields haven't acted;
    // other statuses = ANY of the three assigned-dept fields matches
    if (deptHodStatuses.length > 0) {
      const hasOpen = deptHodStatuses.includes("--");
      const others  = deptHodStatuses.filter(s => s !== "--");
      const clauses = [];
      // "Open" = assigned RM, assigned HOD AND DeptHOD are all still pending
      if (hasOpen) clauses.push({ AND: [{ assignedRmStatus: "--" }, { assignedHodStatus: "--" }, { deptHodStatus: "--" }] });
      // Other statuses = any of the three assigned-dept fields has that status
      if (others.length === 1) clauses.push({ OR: [{ assignedRmStatus: others[0] }, { assignedHodStatus: others[0] }, { deptHodStatus: others[0] }] });
      if (others.length  > 1) clauses.push({ OR: [{ assignedRmStatus: { in: others } }, { assignedHodStatus: { in: others } }, { deptHodStatus: { in: others } }] });
      extraFilters.push(clauses.length === 1 ? clauses[0] : { OR: clauses });
    }

    // Priority (multi — each maps to a date-range clause)
    if (priorities.length > 0) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const buildPriorityClause = (p) => {
        if (p === "Overdue") return { dueDate: { not: null, lt: today } };
        if (p === "High")    { const d7 = new Date(today); d7.setDate(d7.getDate() + 7);   return { dueDate: { gte: today, lte: endOfDay(d7) } }; }
        if (p === "Medium")  { const d8 = new Date(today); d8.setDate(d8.getDate() + 8);  const d15 = new Date(today); d15.setDate(d15.getDate() + 15); return { dueDate: { gte: d8, lte: endOfDay(d15) } }; }
        if (p === "Low")     { const d16 = new Date(today); d16.setDate(d16.getDate() + 16); const d30 = new Date(today); d30.setDate(d30.getDate() + 30); return { dueDate: { gte: d16, lte: endOfDay(d30) } }; }
        return null;
      };
      const pClauses = priorities.map(buildPriorityClause).filter(Boolean);
      if (pClauses.length === 1) extraFilters.push(pClauses[0]);
      else if (pClauses.length > 1) extraFilters.push({ OR: pClauses });
    }

    // Type (multi — sent/received)
    if (types.length > 0) {
      const buildTypeClause = (t) => {
        if (t === "sent")     return { empId };
        if (t === "received") return { assignedDept: userDept, empId: { not: empId } };
        return null;
      };
      const tClauses = types.map(buildTypeClause).filter(Boolean);
      if (tClauses.length === 1) extraFilters.push(tClauses[0]);
      else if (tClauses.length > 1) extraFilters.push({ OR: tClauses });
    }

    // Unread: tickets this user hasn't opened yet
    if (unread === "true") extraFilters.push({ readReceipts: { none: { empId } } });

    // Latest: tickets with any activity in the last 7 days
    if (latest === "true") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      extraFilters.push({
        OR: [
          { createdAt:   { gte: sevenDaysAgo } },
          { rmDate:      { gte: sevenDaysAgo } },
          { hodDate:     { gte: sevenDaysAgo } },
          { deptHodDate: { gte: sevenDaysAgo } },
          { forwardedAt: { gte: sevenDaysAgo } },
          { resolvedDate:{ gte: sevenDaysAgo } },
        ],
      });
    }

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); dateFilter.gte = s; }
      if (endDate)   { const e = new Date(endDate);   e.setHours(23, 59, 59, 999); dateFilter.lte = e; }
      extraFilters.push({ createdAt: dateFilter });
    }

    let searchFilter = {};
    if (search && search.trim()) {
      const term = search.trim();
      searchFilter = {
        OR: [
          { purpose:     { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { empId:       { contains: term, mode: "insensitive" } },
          { owner: { name: { contains: term, mode: "insensitive" } } },
        ],
      };
    }

    const andClauses = [roleFilter, closureFilter, ...extraFilters];
    if (searchFilter.OR) andClauses.push(searchFilter);
    const where = { AND: andClauses.filter(f => Object.keys(f).length > 0) };

    const order = sortOrder === "asc" ? "asc" : "desc";

    const [requests, total] = await Promise.all([
      prisma.request.findMany({ where, include: WITH_OWNER, orderBy: { createdAt: order }, skip, take }),
      prisma.request.count({ where }),
    ]);

    return buildPageResponse(requests.map(r => formatRequest(r, empId)), total, page, limit);
  }

  async getFilterOptions(user) {
    const { role, empId, dept: userDept } = user;
    let roleFilter = {};
    if (role === "SuperUser" || role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (role === "DeptHOD") {
      // DeptHOD sees:
      //   1. Own requests
      //   2. External incoming: other dept → their dept  (assignedDept = userDept, dept ≠ userDept)
      //   3. Self-targeted: user targets their own dept  (dept = userDept AND assignedDept = userDept)
      //   4. Forwarding chain
      // Does NOT see: outgoing from their dept to other depts (dept = userDept, assignedDept ≠ userDept)
      roleFilter = { OR: [
        { empId },
        { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
        { AND: [{ dept: userDept }, { assignedDept: userDept }] },
        { assignedDepts: { contains: userDept } },
      ] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }] },
          { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }] },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }] },
          { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }] },
        ],
      };
    } else if (["Academic", "Animation", "Software"].includes(userDept)) {
      roleFilter = {
        OR: [
          { empId },
          { assignedPersonEmpId: { contains: empId } },
        ],
      };
    } else {
      roleFilter = {
        OR: [
          { empId },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { assignedPersonEmpId: { contains: empId } },
          { assignedDepts: { contains: userDept } },
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
      updateData.checkingBy     = `${user.name} (${user.dept} - ${user.role})`;
      if (body.checkingDeadline) updateData.checkingDeadline = new Date(body.checkingDeadline);
      if (body.checkingReason)   updateData.checkingReason   = body.checkingReason;
    }

    if (decision === "Forwarded") {
      if (!newDept) throw new Error("newDept is required when forwarding.");
      // Always store the full forwarding chain in assignedDepts so the history is never lost
      const origDept      = existing.assignedDept;
      const existingDepts = existing.assignedDepts ? existing.assignedDepts.split(",").map(s => s.trim()).filter(Boolean) : [];
      const allDepts      = [...new Set([...existingDepts, origDept, newDept])];
      updateData = {
        ...updateData,
        forwarded:     true,
        forwardedBy:   user.name,
        forwardedAt:   now,
        assignedDept:  newDept,
        assignedDepts: allDepts.join(","),   // preserved for all forward types
        // Reset approval statuses so the new dept gets a fresh set of action buttons.
        // Previous approvals are preserved in chat history.
        rmStatus:           "--",  rmDate:          null,
        hodStatus:          "--",  hodDate:          null,
        deptHodStatus:      "--",  deptHodDate:      null,
        assignedRmStatus:   "--",  assignedRmDate:   null,
        assignedHodStatus:  "--",  assignedHodDate:  null,
        checkingBy:         null,  checkingDeadline: null, checkingReason: null,
        assignedStatus:     "Open",
      };
      // DeptHOD dual-dept popup forward also auto-approves their stepGumbi@123456
      if (body.dualDept && user.role === "DeptHOD") {
        updateData.deptHodStatus = "Approved";
        updateData.deptHodDate   = now;
      }
    } else if (["RM", "HOD", "DeptHOD", "Management"].includes(user.role)) {
      // If RM/HOD is from the ASSIGNED dept (not requestor's dept) → use assigned fields
      const isAssignedDeptUser =
        (user.role === "RM" || user.role === "HOD") &&
        user.dept === existing.assignedDept &&
        user.dept !== existing.dept;

      let field, dateField;
      if (user.role === "RM") {
        field     = isAssignedDeptUser ? "assignedRmStatus"  : "rmStatus";
        dateField = isAssignedDeptUser ? "assignedRmDate"    : "rmDate";
      } else if (user.role === "HOD") {
        field     = isAssignedDeptUser ? "assignedHodStatus" : "hodStatus";
        dateField = isAssignedDeptUser ? "assignedHodDate"   : "hodDate";
      } else {
        field     = "deptHodStatus";
        dateField = "deptHodDate";
      }
      updateData[field] = decision;
      updateData[dateField] = now;
      if (decision === "Rejected") {
        updateData.isClosed      = true;
        updateData.resolvedDate  = now;
        updateData.resolvedBy    = `${user.name} (${user.role})`;
        updateData.assignedStatus = `Rejected (Closed)`;
      }
      if (user.role === "DeptHOD" && decision === "Approved" && body.assignedPersonEmpId) {
        updateData.assignedPersonEmpId = body.assignedPersonEmpId;
        updateData.assignedPersonName  = body.assignedPersonName || null;
      }
    } else {
      const isTeamMember = existing.assignedDept === user.dept;
      const isAssigned = existing.assignedPersonEmpId
        ? existing.assignedPersonEmpId.split(",").map(s => s.trim()).includes(user.empId)
        : false;
      const canFacilitiesForward = isTeamMember && user.dept === "Facilities" && decision === "Forwarded";
      if (!((isTeamMember || isAssigned) && decision === "Checking") && !canFacilitiesForward) {
        throw new Error("Unauthorized approval.");
      }
    }

    await prisma.requestRead.deleteMany({ where: { requestId: reqId, empId: { not: user.empId } } });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER });

    const isDeptHodPopupForward = decision === "Forwarded" && body.dualDept && user.role === "DeptHOD";

    if (isDeptHodPopupForward) {
      // Two messages: first Approved, then Forwarded — both visible in chat
      await prisma.chatMessage.create({
        data: {
          requestId: reqId,
          authorId:  user.empId,
          author:    user.name,
          role:      user.role,
          dept:      user.dept,
          type:      "approval",
          text:      comment || "Approved the request.",
          status:    "Approved",
          purpose:   updated.purpose,
          changedDept:  null,
          originalDept: existing.assignedDept,
        },
      });
      await prisma.chatMessage.create({
        data: {
          requestId: reqId,
          authorId:  user.empId,
          author:    user.name,
          role:      user.role,
          dept:      user.dept,
          type:      "approval",
          text:      `Forwarded to ${newDept} department.`,
          status:    "Forwarded",
          purpose:   updated.purpose,
          changedDept:  newDept,
          originalDept: existing.assignedDept,
        },
      });
    } else {
      await prisma.chatMessage.create({
        data: {
          requestId: reqId,
          authorId:  user.empId,
          author:    user.name,
          role:      user.role,
          dept:      user.dept,
          type:      "approval",
          text:      comment || `${decision} the request.`,
          status:    decision,
          purpose:   updated.purpose,
          changedDept:  decision === "Forwarded" ? newDept : null,
          originalDept: existing.assignedDept,
        },
      });
    }

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
        owner: {
          OR: [
            { rmEmpId:  { in: ["GN-01", "GN-02"] } },
            { hodEmpId: { in: ["GN-01", "GN-02"] } },
          ],
        },
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
      : ["Approved", "Rejected", "Close"];

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
        dept:      user.dept,
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
    // Accept both old and new label names for backwards compatibility
    const normalizedStatus =
      status === "Resolved" || status === "Received"         ? "Resolved"     :
      status === "Not Resolved" || status === "Not Received" ? "Not Resolved" : null;
    if (!normalizedStatus) throw new Error("status must be 'Resolved' or 'Not Resolved'.");

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    if (existing.assignedStatus !== "Pending Acknowledgement")
      throw new Error("No pending acknowledgement for this ticket.");
    if (existing.empId !== user.empId) throw new Error("Only the requestor can acknowledge.");

    const now = new Date();
    let updateData;
    let chatText;

    if (normalizedStatus === "Resolved") {
      const dateStr = now.toLocaleDateString("en-IN");
      updateData = { acknowledgement: "Resolved", acknowledgedAt: now, isClosed: true, assignedStatus: `${dateStr} (Closed)` };
      chatText = "✅ Requestor confirmed — ticket is now officially resolved and closed.";
    } else {
      // Not Resolved: reopen the ticket and reset all approval fields
      // (chat messages are kept — full history preserved)
      updateData = {
        acknowledgement: null, acknowledgedAt: null,
        isClosed: false, assignedStatus: "Open",
        resolvedDate: null, resolvedBy: null,
        rmStatus: "--",           rmDate: null,
        hodStatus: "--",          hodDate: null,
        deptHodStatus: "--",      deptHodDate: null,
        assignedRmStatus: "--",   assignedRmDate: null,
        assignedHodStatus: "--",  assignedHodDate: null,
        checkingBy: null, checkingDeadline: null, checkingReason: null,
      };
      chatText = "🔄 Requestor reported not received — ticket has been reopened. All approval statuses reset.";
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

  async deleteRequest(reqId, user) {
    if (user.role !== "SuperUser") throw new Error("Only SuperUser can delete requests.");
    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    // Cascade: chat messages, read records, close ticket records deleted via DB relations
    await prisma.request.delete({ where: { id: reqId } });
    return { success: true };
  }

  async editRequest(reqId, user, body) {
    if (user.role !== "SuperUser") throw new Error("Only SuperUser can edit requests.");
    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: WITH_OWNER });
    if (!existing) throw new Error("Request not found.");

    const { purpose, description, assignedDept, assignedDepts, dueDate, assignedPersonEmpId, assignedPersonName } = body;
    const updateData = {};
    if (purpose           !== undefined) updateData.purpose           = purpose;
    if (description       !== undefined) updateData.description       = description;
    if (assignedDept      !== undefined) updateData.assignedDept      = assignedDept;
    if (assignedDepts     !== undefined) updateData.assignedDepts     = assignedDepts || null;
    if (assignedPersonEmpId !== undefined) updateData.assignedPersonEmpId = assignedPersonEmpId || null;
    if (assignedPersonName  !== undefined) updateData.assignedPersonName  = assignedPersonName  || null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER });
    await prisma.chatMessage.create({
      data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, type: "system", text: `✏️ Request edited by ${user.name} (SuperUser).` },
    });
    return formatRequest(updated, user.empId);
  }
}

module.exports = new RequestService();
