/**
 * src/utils/formatters.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts raw Prisma rows into the JSON shape the frontend/mobile app uses.
 *
 * FIX — dept field now always returns OWNER's real department:
 *   Previously: row.dept (the value stored on the request row)
 *   Now:        row.owner?.dept ?? row.dept
 *
 *   This matters because:
 *   - When an RM/HOD/DeptHOD creates a request, request.dept is set from
 *     user.dept (fixed in requestController), but old records might differ.
 *   - The owner relation is always joined, so owner.dept is always reliable.
 *   - Mobile app and web both receive the correct requestor department.
 *
 * Also adds: isOwnRequest field so frontend can detect when an RM/HOD/DeptHOD
 * is viewing their own submission (to hide approval buttons and show bell icon).
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

/**
 * @param {object} row         - Prisma request row (owner relation included)
 * @param {string} [viewerEmpId] - empId of the currently logged-in user
 *                                 (optional — used to set isOwnRequest)
 */
function formatRequest(row, viewerEmpId) {
  const pad = (d) => (d ? new Date(d).toLocaleString("en-IN") : null);

  return {
    id:             row.id,
    date:           new Date(row.createdAt).toLocaleDateString("en-IN"),
    empId:          row.empId,
    name:           row.owner?.name        ?? row.empId,

    // FIX: Always use the owner's actual dept, not the stored request.dept
    // (request.dept is now always == owner.dept but this is extra-safe)
    dept:           row.owner?.dept        ?? row.dept,

    designation:    row.owner?.designation ?? "—",
    location:       row.owner?.location   ?? "—",
    purpose:        row.purpose,
    description:    row.description        ?? "",
    fileUrl:        row.fileUrl            ?? null,
    fileName:       row.fileName           ?? null,

    // Approval statuses
    rmStatus:       row.rmStatus,
    rmDate:         pad(row.rmDate),
    hodStatus:      row.hodStatus,
    hodDate:        pad(row.hodDate),
    deptHodStatus:  row.deptHodStatus,
    deptHodDate:    pad(row.deptHodDate),

    // Forwarding
    assignedDept:   row.assignedDept,
    forwarded:      row.forwarded,
    forwardedBy:    row.forwardedBy        ?? null,
    forwardedAt:    pad(row.forwardedAt),

    // Closure
    assignedStatus: row.assignedStatus,
    isClosed:       row.isClosed           ?? false,
    resolvedDate:   row.resolvedDate       ?? null,
    resolvedBy:     row.resolvedBy,

    // Read tracking
    seen:           row.seen,

    // isOwnRequest: true when the logged-in user is the one who submitted it.
    // RM/HOD/DeptHOD use this to switch to "requestor mode" for their own
    // submissions — no approval buttons, show bell icon instead of rocket.
    isOwnRequest:   viewerEmpId ? row.empId === viewerEmpId : undefined,
  };
}

/**
 * @param {object} row - Prisma chat_message row
 */
function formatMessage(row) {
  return {
    id:           row.id,
    author:       row.author,
    role:         row.role,
    type:         row.type,
    text:         row.text         ?? "",
    fileUrl:      row.fileUrl      ?? null,
    fileName:     row.fileName     ?? null,
    isImage:      row.isImage      ?? false,
    voiceUrl:     row.voiceUrl     ?? null,
    duration:     row.duration     ?? null,
    status:       row.status       ?? null,
    purpose:      row.purpose      ?? null,
    changedDept:  row.changedDept  ?? null,
    originalDept: row.originalDept ?? null,
    time: new Date(row.createdAt).toLocaleTimeString("en-IN", {
      hour:   "2-digit",
      minute: "2-digit",
    }),
    date: new Date(row.createdAt).toLocaleDateString("en-IN"),
  };
}

module.exports = { formatRequest, formatMessage };
