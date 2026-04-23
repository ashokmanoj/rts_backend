/**
 * src/utils/formatters.js
 * Converts raw Prisma rows into the JSON shape the frontend/mobile app uses.
 * Updated: Management role support + mgmtStatus field.
 */

"use strict";

function formatRequest(row, viewerEmpId) {
  const pad = (d) => (d ? new Date(d).toLocaleString("en-IN") : null);

  return {
    id:             row.id,
    date:           new Date(row.createdAt).toLocaleDateString("en-IN"),
    empId:          row.empId,
    name:           row.owner?.name        ?? row.empId,
    dept:           row.owner?.dept        ?? row.dept,
    designation:    row.owner?.designation ?? "—",
    location:       row.owner?.location   ?? "—",
    purpose:        row.purpose,
    description:    row.description        ?? "",
    fileUrl:        row.fileUrl            ?? null,
    fileName:       row.fileName           ?? null,

    // Approval statuses — RM / HOD / DeptHOD
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
    status:         row.resolvedDate       ? "Closed" : "Open",
    assignedStatus: row.assignedStatus,
    isClosed:       row.isClosed           ?? false,
    resolvedDate:   row.resolvedDate       ?? null,
    resolvedBy:     row.resolvedBy,

    // New CloseTicket data
    closeData:      row.closeTicket ? {
      description: row.closeTicket.description,
      fileUrl:     row.closeTicket.fileUrl,
      fileName:    row.closeTicket.fileName,
      closedDate:  pad(row.closeTicket.closedDate),
    } : null,

    // Read tracking (per user)
    seen: row.readReceipts ? row.readReceipts.some(r => r.empId === viewerEmpId) : false,

    // Chat messages (if included in the query)
    chatMessages:   row.chatMessages ? row.chatMessages.map(formatMessage) : [],

    // isOwnRequest: used to hide approval buttons when approver views own submission
    isOwnRequest:   viewerEmpId ? row.empId === viewerEmpId : undefined,
  };
}

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
