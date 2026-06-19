/**
 * src/utils/formatters.js
 * Converts raw Prisma rows into the JSON shape the frontend/mobile app uses.
 */

"use strict";

const daysDiff = (date) => {
  if (!date) return null;
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
};

const computePriority = (dueDate) => {
  if (!dueDate) return null;
  const days = daysDiff(dueDate);
  if (days < 0)  return "Overdue";
  if (days <= 7)  return "High";
  if (days <= 15) return "Medium";
  if (days <= 30) return "Low";
  return null;
};

function formatRequest(row, viewerEmpId) {
  const pad = (d) => (d ? new Date(d).toLocaleString("en-IN") : null);

  return {
    id:             row.id,
    date:           new Date(row.createdAt).toLocaleDateString("en-IN"),
    time:           new Date(row.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    empId:          row.empId,
    name:           row.owner?.name        ?? row.empId,
    dept:           row.owner?.dept        ?? row.dept,
    designation:    row.owner?.designation ?? "—",
    location:       row.owner?.location   ?? "—",
    purpose:        row.purpose,
    description:    row.description        ?? "",
    fileUrl:        row.fileUrl            ?? null,
    fileName:       row.fileName           ?? null,
    fileUrls:  (() => { if (row.fileUrls)  { try { return JSON.parse(row.fileUrls);  } catch { return null; } } return row.fileUrl  ? [row.fileUrl]  : null; })(),
    fileNames: (() => { if (row.fileNames) { try { return JSON.parse(row.fileNames); } catch { return null; } } return row.fileName ? [row.fileName] : null; })(),

    requestorRole:  row.requestorRole  ?? null,

    // Requestor dept approval statuses
    rmStatus:       row.rmStatus,
    rmDate:         pad(row.rmDate),
    hodStatus:      row.hodStatus,
    hodDate:        pad(row.hodDate),
    // Assigned dept approval statuses
    assignedRmStatus:  row.assignedRmStatus,
    assignedRmDate:    pad(row.assignedRmDate),
    assignedHodStatus: row.assignedHodStatus,
    assignedHodDate:   pad(row.assignedHodDate),
    deptHodStatus:  row.deptHodStatus,
    deptHodDate:    pad(row.deptHodDate),
    managementStatus: row.managementStatus ?? "--",
    managementDate:   pad(row.managementDate),

    // Forwarding
    assignedDept:      row.assignedDept,
    forwarded:         row.forwarded,
    forwardedBy:       row.forwardedBy     ?? null,
    forwardedAt:       pad(row.forwardedAt),
    // The dept that forwarded = originalDept in the "Forwarded" chat message (previous assignedDept)
    forwardedFromDept: (() => {
      const msg = row.chatMessages?.find(m => m.status === "Forwarded" && m.originalDept);
      return msg?.originalDept ?? null;
    })(),

    // Assigned departments & person
    assignedDepts:       row.assignedDepts        ?? null,
    assignedPersonEmpId: row.assignedPersonEmpId  ?? null,
    assignedPersonName:  row.assignedPersonName   ?? null,

    ccDepts:       row.ccDepts       ?? null,
    ccEmpIds:      row.ccEmpIds      ?? null,
    ccPersonNames: row.ccPersonNames ?? null,

    // Closure
    status:         row.resolvedDate       ? "Closed" : "Open",
    assignedStatus: row.assignedStatus,
    isClosed:       row.isClosed           ?? false,
    resolvedDate:   row.resolvedDate       ?? null,
    resolvedBy:     row.resolvedBy,

    closeData:      row.closeTicket ? {
      description: row.closeTicket.description,
      fileUrl:     row.closeTicket.fileUrl,
      fileName:    row.closeTicket.fileName,
      fileUrls:  (() => { if (row.closeTicket.fileUrls)  { try { return JSON.parse(row.closeTicket.fileUrls);  } catch { return null; } } return row.closeTicket.fileUrl  ? [row.closeTicket.fileUrl]  : null; })(),
      fileNames: (() => { if (row.closeTicket.fileNames) { try { return JSON.parse(row.closeTicket.fileNames); } catch { return null; } } return row.closeTicket.fileName ? [row.closeTicket.fileName] : null; })(),
      closedDate:  pad(row.closeTicket.closedDate),
    } : null,

    // Due date & priority (frozen once ticket is closed)
    dueDate:        row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-IN") : null,
    dueDateRaw:     row.dueDate ?? null,
    priority:       row.isClosed ? null : computePriority(row.dueDate),
    daysUntilDue:   row.isClosed ? null : daysDiff(row.dueDate),

    // Checking deadline
    checkingDeadline:   row.checkingDeadline ? new Date(row.checkingDeadline).toLocaleDateString("en-IN") : null,
    checkingReason:     row.checkingReason   ?? null,
    checkingBy:         row.checkingBy       ?? null,
    checkingDaysLeft:   daysDiff(row.checkingDeadline),

    // Requestor acknowledgement
    acknowledgement:  row.acknowledgement  ?? null,
    acknowledgedAt:   pad(row.acknowledgedAt),

    // Reopen tracking
    reopenedAt:      row.reopenedAt ? new Date(row.reopenedAt).toLocaleString("en-IN") : null,

    // Recurring
    isRecurring:        row.isRecurring       ?? false,
    recurringInterval:  row.recurringInterval ?? null,
    recurringParentId:  row.recurringParentId ?? null,

    // GN-route: requestor's RM or HOD is GN-01 or GN-02 → goes to Management portal
    isGnRoute: !!(["GN-01", "GN-02"].includes(row.owner?.rmEmpId) || ["GN-01", "GN-02"].includes(row.owner?.hodEmpId)),

    // Read tracking
    seen: row.readReceipts ? row.readReceipts.some(r => r.empId === viewerEmpId) : false,

    chatMessages:   row.chatMessages ? row.chatMessages.map(formatMessage) : [],

    isOwnRequest:   viewerEmpId ? row.empId === viewerEmpId : undefined,
  };
}

function formatMessage(row) {
  return {
    id:           row.id,
    author:       row.author,
    role:         row.role,
    dept:         row.dept         ?? null,
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
