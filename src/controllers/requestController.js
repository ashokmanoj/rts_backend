/**
 * src/controllers/requestController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All CRUD operations on Request records.
 *
 * FIX 1 — Correct role-based filtering (was showing all requests to everyone):
 *   RM / HOD  → see requests WHERE the REQUESTOR (owner) belongs to their dept
 *               + their own submissions
 *   DeptHOD   → see requests WHERE assignedDept = their dept + their own
 *   Requestor → only their own requests
 *   Admin     → all requests
 *
 * FIX 2 — RM/HOD/DeptHOD creating a request always uses user.dept:
 *   The 'dept' field on a request is ALWAYS the owner's department.
 *   We ignore req.body.dept and always use user.dept from the JWT.
 *
 * FIX 3 — Response includes ownerDept separately:
 *   formatRequest now exposes ownerDept so the frontend can always show
 *   the REQUESTOR's real department regardless of request.dept.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma            = require("../db/prisma");
const { formatRequest } = require("../utils/formatters");

/** Build absolute URL for an uploaded file. */
const buildFileUrl = (req, filename) => {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

/** Always join the request owner so we can filter and display correctly. */
const WITH_OWNER = { owner: true };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/requests
//
// FIX: The old filter used { dept: userDept } which matched request.dept
// (the dept stored on the request row). This broke because:
//   - When an RM creates a request, request.dept was set from req.body.dept
//     which might be any department, not necessarily the RM's own dept
//   - The Prisma query { dept: userDept } hit the request table's dept column,
//     not the owner's dept — so it was inconsistent
//
// NEW LOGIC: Join owner and filter on owner.dept so we always check the
// ACTUAL department of the person who submitted the request.
// ─────────────────────────────────────────────────────────────────────────────
async function getAll(req, res, next) {
  try {
    const { role, empId, dept } = req.user;

    let where = {};

    if (role === "Requestor") {
      // Requestors see ONLY their own requests
      where = { empId };

    } else if (role === "RM" || role === "HOD") {
      // RM/HOD see requests from people in their department
      // We join the owner relation and filter by owner.dept
      // PLUS they always see their own submissions regardless of dept
      where = {
        OR: [
          {
            // Requests submitted by anyone whose dept = this RM/HOD's dept
            owner: { dept }
          },
          {
            // Their own submissions (in case they submitted to a different dept)
            empId
          }
        ]
      };

    } else if (role === "DeptHOD") {
      // DeptHOD sees requests ASSIGNED to their department
      // PLUS their own submissions
      where = {
        OR: [
          { assignedDept: dept },
          { empId }
        ]
      };

    }
    // Admin: no where clause — sees ALL requests

    const requests = await prisma.request.findMany({
      where,
      include: WITH_OWNER,
      orderBy: { createdAt: "desc" },
    });

    res.json(requests.map((r) => formatRequest(r, empId)));
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests
//
// FIX: Always use user.dept from the JWT as the request's dept.
// This ensures:
//   - The "Dept" column in the table always shows the REQUESTOR's real dept
//   - RM/HOD/DeptHOD who submit requests are correctly filtered by their dept
//   - Mobile app and web see consistent data
//
// The body's 'dept' is used ONLY for assignedDept (which dept should handle it).
// If body.assignedDept is not provided, it defaults to user.dept.
// ─────────────────────────────────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const { purpose, description, assignedDept } = req.body;
    const user         = req.user;
    const uploadedFile = req.file;

    if (!purpose) {
      return res.status(400).json({ error: "purpose is required." });
    }

    const request = await prisma.request.create({
      data: {
        empId:        user.empId,
        purpose,
        description:  description || "",
        fileUrl:      uploadedFile ? buildFileUrl(req, uploadedFile.filename) : null,
        fileName:     uploadedFile ? uploadedFile.originalname                : null,
        // dept is ALWAYS the submitting user's own department from JWT
        dept:         user.dept,
        // assignedDept = where the request is routed to (defaults to own dept)
        assignedDept: assignedDept || user.dept,
        // seen=false so RM/HOD/DeptHOD see the blue "unread" highlight.
        // The frontend overrides this to seen=true for the CREATOR only,
        // so the requestor doesn't see their own new request highlighted.
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

    if (!decision) {
      return res.status(400).json({ error: "decision is required." });
    }
    const ALLOWED = ["Approved", "Rejected", "Checking", "Forwarded"];
    if (!ALLOWED.includes(decision)) {
      return res.status(400).json({ error: `decision must be one of: ${ALLOWED.join(", ")}` });
    }

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) return res.status(404).json({ error: "Request not found." });
    if (existing.isClosed) {
      return res.status(403).json({ error: "Cannot update a closed ticket." });
    }

    let updateData = { seen: false };

    if (decision === "Forwarded") {
      if (!newDept) {
        return res.status(400).json({ error: "newDept is required when forwarding." });
      }
      updateData = {
        ...updateData,
        forwarded:    true,
        forwardedBy:  user.name,
        forwardedAt:  now,
        assignedDept: newDept,
      };
    } else if (user.role === "RM") {
      updateData = { ...updateData, rmStatus: decision, rmDate: now };
    } else if (user.role === "HOD") {
      updateData = { ...updateData, hodStatus: decision, hodDate: now };
    } else if (user.role === "DeptHOD") {
      updateData = { ...updateData, deptHodStatus: decision, deptHodDate: now };
    } else if (user.role === "Admin") {
      return res.status(403).json({ error: "Admin has read-only access." });
    } else {
      return res.status(403).json({ error: "Your role cannot approve requests." });
    }

    const updated = await prisma.request.update({
      where:   { id: reqId },
      data:    updateData,
      include: WITH_OWNER,
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
      where: { id: Number(req.params.id) },
      data:  { seen: true },
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
      where: { id: Number(req.params.id) },
      data:  { seen: false },
    });
    if (result.count === 0) return res.status(404).json({ error: "Request not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/close  (DeptHOD only)
// ─────────────────────────────────────────────────────────────────────────────
async function close(req, res, next) {
  try {
    const reqId        = Number(req.params.id);
    const { note }     = req.body;
    const user         = req.user;
    const uploadedFile = req.file;

    if (user.role !== "DeptHOD" && user.role !== "Admin") {
      return res.status(403).json({ error: "Only DeptHOD can close tickets." });
    }

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) return res.status(404).json({ error: "Request not found." });
    if (existing.isClosed) {
      return res.status(409).json({ error: "Ticket is already closed." });
    }

    const now    = new Date();
    const dateStr= now.toLocaleDateString("en-IN");
    const fUrl   = uploadedFile ? buildFileUrl(req, uploadedFile.filename) : null;
    const fName  = uploadedFile ? uploadedFile.originalname                : null;
    const isImg  = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;

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

    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId:  user.empId,
        author:    user.name,
        role:      user.role,
        type:      "system",
        text:      note
          ? `🔒 Ticket closed by ${user.name} — ${note}`
          : `🔒 Ticket closed by ${user.name}`,
        fileUrl:   fUrl,
        fileName:  fName,
        isImage:   isImg,
      },
    });

    res.json(formatRequest(updated, user.empId));
  } catch (err) { next(err); }
}

module.exports = { getAll, create, approval, markSeen, markUnread, close };
