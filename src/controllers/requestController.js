/**
 * src/controllers/requestController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All CRUD operations on Request records.
 *
 * ROLES:
 *   Requestor   → only their own requests
 *   RM / HOD    → requests from their dept + their own
 *   DeptHOD     → requests assigned to their dept + their own; can close tickets
 *   Management  → ALL requests; can approve AND close tickets (like DeptHOD but global)
 *   Admin       → ALL requests; READ-ONLY (cannot approve or close)
 *
 * PAGINATION — GET /api/requests
 *   ?page=1, ?limit=20, ?status=open|closed, ?search=keyword
 *
 * CLOSE TICKET:
 *   - Note and file are saved to the closure system chat message
 *   - Both note text and fileUrl appear in the chat thread
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma                                 = require("../db/prisma");
const { formatRequest }                      = require("../utils/formatters");
const { parsePagination, buildPageResponse } = require("../utils/paginate");

const buildFileUrl = (req, filename) => {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

const WITH_OWNER = { owner: true, closeTicket: true, chatMessages: true };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/requests?page=1&limit=20&status=open|closed&search=keyword
// ─────────────────────────────────────────────────────────────────────────────
async function getAll(req, res, next) {
  try {
    const { role, empId, dept }       = req.user;
    const { page, limit, skip, take } = parsePagination(req.query);
    const { status, search }          = req.query;

    // Status filter
    let closureFilter = {};
    if (status === "open")   closureFilter = { isClosed: false };
    if (status === "closed") closureFilter = { isClosed: true  };

    // Search filter
    let searchFilter = {};
    if (search && search.trim()) {
      const term = search.trim();
      searchFilter = {
        OR: [
          { purpose:     { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { empId:       { contains: term, mode: "insensitive" } },
        ],
      };
    }

    // Role-based filter
    let roleFilter = {};
    if (role === "Management" || role === "Admin") {
      roleFilter = {}; // See everything
    } else if (role === "RM" || role === "HOD" || role === "DeptHOD") {
      roleFilter = {
        OR: [
          { empId: empId },
          { dept: dept },         // See requests FROM their dept
          { assignedDept: dept }  // See requests TO their dept
        ]
      };
    } else {
      // Requestor
      roleFilter = {
        OR: [
          { empId: empId }, // Own requests
          {
            AND: [
              { assignedDept: dept }, // Requests assigned to my dept
              { dept: { not: dept } } // ...from other departments
            ]
          }
        ]
      };
    }

    const andClauses = [roleFilter, closureFilter];
    if (searchFilter.OR) andClauses.push(searchFilter);
    const where = {
      AND: andClauses.filter((f) => Object.keys(f).length > 0),
    };

    const [requests, total] = await Promise.all([
      prisma.request.findMany({ where, include: WITH_OWNER, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.request.count({ where }),
    ]);

    res.json(buildPageResponse(requests.map((r) => formatRequest(r, empId)), total, page, limit));
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests
// ─────────────────────────────────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const { purpose, description, assignedDept } = req.body;
    const user         = req.user;
    const uploadedFile = req.file;

    if (!purpose) return res.status(400).json({ error: "purpose is required." });

    const request = await prisma.request.create({
      data: {
        empId:        user.empId,
        purpose,
        description:  description || "",
        fileUrl:      uploadedFile ? buildFileUrl(req, uploadedFile.filename) : null,
        fileName:     uploadedFile ? uploadedFile.originalname                : null,
        dept:         user.dept,
        assignedDept: assignedDept || user.dept,
        seen:         false,
      },
      include: WITH_OWNER,
    });

    res.status(201).json(formatRequest(request, user.empId));
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/approval
// ─────────────────────────────────────────────────────────────────────────────
async function approval(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const { decision, comment, newDept } = req.body;
    const user  = req.user;
    const now   = new Date();

    if (!decision) return res.status(400).json({ error: "decision is required." });

    const ALLOWED = ["Approved", "Rejected", "Checking", "Forwarded"];
    if (!ALLOWED.includes(decision)) {
      return res.status(400).json({ error: `decision must be one of: ${ALLOWED.join(", ")}` });
    }

    const existing = await prisma.request.findUnique({ 
      where: { id: reqId },
      include: { owner: true }
    });
    if (!existing)       return res.status(404).json({ error: "Request not found." });
    if (existing.isClosed) return res.status(403).json({ error: "Cannot update a closed ticket." });

    // Admin is always read-only
    if (user.role === "Admin") {
      return res.status(403).json({ error: "Admin has read-only access." });
    }

    let updateData = { seen: false };

    if (decision === "Checking") {
      updateData.assignedStatus = "Checking";
    }

    // Custom Approval Logic:
    // If RM/HOD/DeptHOD made the request, ONLY Management can approve it.
    const isSpecialRequest = ["RM", "HOD", "DeptHOD"].includes(existing.owner.role);

    if (decision === "Forwarded") {
      if (!newDept) return res.status(400).json({ error: "newDept is required when forwarding." });
      updateData = { ...updateData, forwarded: true, forwardedBy: user.name, forwardedAt: now, assignedDept: newDept };
    } else if (isSpecialRequest) {
      if (user.role !== "Management") {
        return res.status(403).json({ error: "This request (from RM/HOD/DeptHOD) can only be approved by Management." });
      }
      updateData = { ...updateData, deptHodStatus: decision, deptHodDate: now };
    } else if (user.role === "RM") {
      updateData = { ...updateData, rmStatus: decision, rmDate: now };
    } else if (user.role === "HOD") {
      updateData = { ...updateData, hodStatus: decision, hodDate: now };
    } else if (user.role === "DeptHOD") {
      updateData = { ...updateData, deptHodStatus: decision, deptHodDate: now };
    } else if (user.role === "Management") {
      updateData = { ...updateData, deptHodStatus: decision, deptHodDate: now };
    } else {
      // Normal Requestors / Team members
      // Can do "Checking" if they are in the assigned department
      const isTeamMember = existing.assignedDept === user.dept;
      if (isTeamMember && decision === "Checking") {
         // Already handled assignedStatus above
      } else {
        return res.status(403).json({ error: "Your role cannot approve this request." });
      }
    }

    const updated = await prisma.request.update({
      where: { id: reqId }, data: updateData, include: WITH_OWNER,
    });

    await prisma.chatMessage.create({
      data: {
        requestId:    reqId,
        authorId:     user.empId,
        author:       user.name,
        role:         user.role,
        type:         "approval",
        text:         comment || `${decision} the request.`,
        status:       decision,
        purpose:      updated.purpose,
        changedDept:  decision === "Forwarded" ? newDept : null,
        originalDept: existing.assignedDept,
      },
    });

    res.json(formatRequest(updated, user.empId));
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/seen
// ─────────────────────────────────────────────────────────────────────────────
async function markSeen(req, res, next) {
  try {
    const result = await prisma.request.updateMany({
      where: { id: Number(req.params.id) }, data: { seen: true },
    });
    if (result.count === 0) return res.status(404).json({ error: "Request not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/unread
// ─────────────────────────────────────────────────────────────────────────────
async function markUnread(req, res, next) {
  try {
    const result = await prisma.request.updateMany({
      where: { id: Number(req.params.id) }, data: { seen: false },
    });
    if (result.count === 0) return res.status(404).json({ error: "Request not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/close
// Close ticket: saves to CloseTicket table + system chat message
// ─────────────────────────────────────────────────────────────────────────────
async function close(req, res, next) {
  try {
    const reqId        = Number(req.params.id);
    const { note }     = req.body;
    const user         = req.user;
    const uploadedFile = req.file;

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing)         return res.status(404).json({ error: "Request not found." });
    if (existing.isClosed) return res.status(409).json({ error: "Ticket is already closed." });

    const isAssignedToMyDept = existing.assignedDept === user.dept;
    const isFromOtherDept    = existing.dept !== user.dept;
    
    // DeptHOD and Management can close anything.
    // Team members can close tickets assigned TO them from OTHER departments.
    const canClose = ["DeptHOD", "Management"].includes(user.role) || (isAssignedToMyDept && isFromOtherDept);

    if (!canClose) {
      return res.status(403).json({ error: "You are not authorized to close this ticket." });
    }

    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-IN");
    const fUrl    = uploadedFile ? buildFileUrl(req, uploadedFile.filename) : null;
    const fName   = uploadedFile ? uploadedFile.originalname                : null;
    const isImg   = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;

    // 1. Save to CloseTicket table
    await prisma.closeTicket.create({
      data: {
        requestId:   reqId,
        description: note || "No reason provided",
        fileUrl:     fUrl,
        fileName:    fName,
        closedDate:  now
      }
    });

    // 2. Update Request status
    const updated = await prisma.request.update({
      where: { id: reqId },
      data: {
        assignedStatus: `${dateStr} (Closed)`,
        isClosed:       true,
        resolvedDate:   now,
        resolvedBy:     user.name,
        seen:           false,
      },
      include: WITH_OWNER,
    });

    const closureText = note
      ? `🔒 Ticket closed by ${user.name} (${user.dept})\n\nResolution note: ${note} `
      : `🔒 Ticket closed by ${user.name} (${user.dept})`;

    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId:  user.empId,
        author:    user.name,
        role:      user.role,
        type:      "system",
        text:      closureText,
        fileUrl:   fUrl,
        fileName:  fName,
        isImage:   isImg,
      },
    });

    res.json(formatRequest(updated, user.empId));
  } catch (err) { next(err); }
}

module.exports = { getAll, create, approval, markSeen, markUnread, close };
