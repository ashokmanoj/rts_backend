"use strict";

const prisma = require("../../config/database");
const { formatRequest } = require("../../utils/formatters");
const { WITH_OWNER, buildFileUrl, stripHtml } = require("./helpers");

async function approval(reqId, user, body) {
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
        assignedDept:        newDept,
        assignedDepts:       allDepts.join(","),   // preserved for all forward types
        assignedPersonEmpId: null,                 // clear person assignment — forwarding targets a dept, not a specific person
        assignedPersonName:  null,
        isDirectAssign:      false,                // forwarding restores dept-level visibility
        // Reset assigned-dept fields so the receiving dept gets fresh action buttons.
        // rmStatus/hodStatus for the requestor's dept are updated below if applicable.
        deptHodStatus:      "--",  deptHodDate:      null,
        assignedRmStatus:   "--",  assignedRmDate:   null,
        assignedHodStatus:  "--",  assignedHodDate:  null,
        checkingBy:         null,  checkingDeadline: null, checkingReason: null,
        assignedStatus:     "Open",
      };
      // Record the forwarder's own status so their column shows "Forwarded" rather than "--".
      // Only applies when the forwarder is from the requestor's dept (not the assigned dept);
      // assigned-dept RM/HOD fields are now reserved for the receiving dept's fresh use.
      if (user.role === "RM" || user.role === "HOD") {
        const isFromAssignedDept = user.dept === existing.assignedDept && user.dept !== existing.dept;
        if (!isFromAssignedDept) {
          if (user.role === "RM") { updateData.rmStatus = "Forwarded"; updateData.rmDate = now; }
          else                    { updateData.hodStatus = "Forwarded"; updateData.hodDate = now; }
        }
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
      } else if (user.role === "Management") {
        field     = "managementStatus";
        dateField = "managementDate";
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
      const canAssignedForward   = isAssigned && decision === "Forwarded";
      if (!((isTeamMember || isAssigned) && decision === "Checking") && !canFacilitiesForward && !canAssignedForward) {
        throw new Error("Unauthorized approval.");
      }
    }

    // Preserve CC users' read receipts — approval steps don't need to re-alert observers
    const _ccApproval = existing.ccEmpIds ? existing.ccEmpIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    await prisma.requestRead.deleteMany({
      where: { requestId: reqId, empId: { notIn: [user.empId, ..._ccApproval] } },
    });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER });

    const isDualPopupForward = decision === "Forwarded" && body.dualDept && (user.role === "DeptHOD" || user.role === "HOD");

    if (isDualPopupForward) {
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

async function close(reqId, user, body, uploadedFiles, req) {
    const { note } = body;
    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    if (existing.isClosed || existing.assignedStatus === "Pending Acknowledgement") throw new Error("Ticket already closed.");

    const isSpecificallyAssigned = !!(existing.assignedPersonEmpId &&
      existing.assignedPersonEmpId.split(",").map(s => s.trim()).includes(user.empId));
    const canClose = ["DeptHOD", "Management"].includes(user.role) ||
      (existing.assignedDept === user.dept && existing.dept !== user.dept) ||
      (user.role === "Requestor" && user.dept === "Facilities" && existing.dept === "Facilities" && existing.assignedDept !== "Facilities") ||
      isSpecificallyAssigned;
    if (!canClose) throw new Error("Not authorized to close.");

    const now   = new Date();
    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    const first = files[0] ?? null;
    const fUrl   = first ? buildFileUrl(req, first.filename)  : null;
    const fName  = first ? first.originalname                      : null;
    const isImg  = first ? first.mimetype.startsWith("image/")     : false;
    const fUrls  = files.length > 0 ? JSON.stringify(files.map(f => buildFileUrl(req, f.filename))) : null;
    const fNames = files.length > 0 ? JSON.stringify(files.map(f => f.originalname))                     : null;

    await prisma.closeTicket.create({ data: { requestId: reqId, description: note || "No reason", fileUrl: fUrl, fileName: fName, fileUrls: fUrls, fileNames: fNames, closedDate: now } });
    // Preserve CC users' read receipts — close action doesn't need to re-alert observers
    const _ccClose = existing.ccEmpIds ? existing.ccEmpIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    await prisma.requestRead.deleteMany({
      where: { requestId: reqId, empId: { notIn: [user.empId, ..._ccClose] } },
    });
    await prisma.requestRead.upsert({ where: { requestId_empId: { requestId: reqId, empId: user.empId } }, update: {}, create: { requestId: reqId, empId: user.empId } });

    const updated = await prisma.request.update({
      where: { id: reqId },
      data: { assignedStatus: "Pending Acknowledgement", isClosed: false, resolvedDate: now, resolvedBy: user.name },
      include: WITH_OWNER,
    });

    const plainNote = stripHtml(note);
    const closureText = plainNote
      ? `🔒 Resolution submitted by ${user.name} (${user.dept}) — awaiting requestor acknowledgement.\n\nResolution note: ${plainNote}`
      : `🔒 Resolution submitted by ${user.name} (${user.dept}) — awaiting requestor acknowledgement.`;
    await prisma.chatMessage.create({ data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, type: "system", text: closureText, fileUrl: fUrl, fileName: fName, isImage: isImg } });

    return formatRequest(updated, user.empId);
  }

async function acknowledge(reqId, user, body) {
    const { status } = body;
    // Accept both old and new label names for backwards compatibility
    const normalizedStatus =
      status === "Resolved" || status === "Received"         ? "Resolved"     :
      status === "Not Resolved" || status === "Not Received" ? "Not Resolved" : null;
    if (!normalizedStatus) throw new Error("status must be 'Resolved' or 'Not Resolved'.");

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    // Allow acknowledgement for tickets pending ack OR directly rejected/closed by staff
    const canAcknowledge =
      existing.assignedStatus === "Pending Acknowledgement" ||
      (existing.isClosed && !existing.acknowledgement);
    if (!canAcknowledge) throw new Error("No pending acknowledgement for this ticket.");
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
        reopenedAt: new Date(),
      };
      chatText = "🔄 Requestor reported not received — ticket has been reopened. All approval statuses reset.";
      await prisma.closeTicket.deleteMany({ where: { requestId: reqId } });
      // Clear all read receipts so the ticket appears as unread/top for all users
      await prisma.requestRead.deleteMany({ where: { requestId: reqId } });
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

async function attachAfterClose(reqId, user, uploadedFiles, req) {
    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: { closeTicket: true } });
    if (!existing) throw Object.assign(new Error("Request not found."), { status: 404 });
    if (!existing.isClosed || existing.acknowledgement !== "Resolved")
      throw Object.assign(new Error("Ticket must be closed and acknowledged first."), { status: 400 });

    const isAssignedDept        = existing.assignedDept === user.dept;
    const isSpecificallyAssigned = existing.assignedPersonEmpId
      ? existing.assignedPersonEmpId.split(",").map(s => s.trim()).includes(user.empId)
      : false;
    const isRequestor = existing.empId === user.empId;
    if (!isAssignedDept && !isSpecificallyAssigned && !isRequestor)
      throw Object.assign(new Error("Not authorized to attach files."), { status: 403 });

    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    if (!files.length) throw Object.assign(new Error("No files provided."), { status: 400 });

    const newUrls  = files.map(f => buildFileUrl(req, f.filename));
    const newNames = files.map(f => f.originalname);

    // System summary message
    await prisma.chatMessage.create({
      data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, dept: user.dept, type: "system", text: `📎 ${files.length} file(s) attached after closure by ${user.name} (${user.dept}).` },
    });

    // Individual file messages — visible only in chat, not in closure details
    for (let i = 0; i < files.length; i++) {
      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(newNames[i]);
      await prisma.chatMessage.create({
        data: { requestId: reqId, authorId: user.empId, author: user.name, role: user.role, dept: user.dept, type: "file", text: "", fileUrl: newUrls[i], fileName: newNames[i], isImage: isImg },
      });
    }

    const updated = await prisma.request.findUnique({ where: { id: reqId }, include: WITH_OWNER });
    return formatRequest(updated, user.empId);
  }

async function stopRecurring(reqId, user) {
    if (user.role !== "DeptHOD") throw Object.assign(new Error("Only DeptHOD can stop recurring."), { status: 403 });

    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw Object.assign(new Error("Request not found."), { status: 404 });
    if (!existing.isRecurring) throw Object.assign(new Error("This request is not recurring."), { status: 400 });
    if (existing.assignedDept !== user.dept) throw Object.assign(new Error("Unauthorized — not your assigned dept."), { status: 403 });

    const updated = await prisma.request.update({
      where: { id: reqId },
      data:  { isRecurring: false, nextRecurringDate: null },
      include: WITH_OWNER,
    });

    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId:  user.empId,
        author:    user.name,
        role:      user.role,
        type:      "system",
        text:      `🔁 Recurring schedule stopped by ${user.name} (Dept HOD — ${user.dept}). No further auto-requests will be created.`,
      },
    });

    return formatRequest(updated, user.empId);
  }

module.exports = { approval, close, acknowledge, attachAfterClose, stopRecurring };
