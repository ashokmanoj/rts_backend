"use strict";

const prisma = require("../../config/database");
const { formatRequest } = require("../../utils/formatters");
const { WITH_OWNER, storeFiles, stripHtml, computeNextRecurringDate } = require("./helpers");

async function approval(reqId, user, body) {
    const { decision, comment, newDept } = body;
    const now = new Date();

    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: { owner: true } });
    if (!existing) throw new Error("Request not found.");
    if (existing.isClosed) throw new Error("Cannot update a closed ticket.");
    if (user.role === "Admin") throw new Error("Admin has read-only access.");

    // RM / HOD / DeptHOD can only act on requests where their dept is actually involved —
    // prevents thread-linked users from approving/rejecting requests assigned to another dept.
    if (["RM", "HOD", "DeptHOD"].includes(user.role)) {
      const assignedDeptsChain = existing.assignedDepts
        ? existing.assignedDepts.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      const isDeptRelevant =
        user.dept === existing.dept ||
        user.dept === existing.assignedDept ||
        assignedDeptsChain.includes(user.dept);
      if (!isDeptRelevant) {
        throw Object.assign(new Error("Unauthorized: your department is not assigned to this request."), { status: 403 });
      }
    }

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
      // Record the forwarder's own status so their column shows the correct status.
      // Approve+Forward (dualDept=true) → "Approved"; plain Forward → "Forwarded".
      // Only applies when the forwarder is from the requestor's dept (not the assigned dept);
      // assigned-dept RM/HOD fields are now reserved for the receiving dept's fresh use.
      if (user.role === "RM" || user.role === "HOD") {
        const isFromAssignedDept = user.dept === existing.assignedDept && user.dept !== existing.dept;
        if (!isFromAssignedDept) {
          const statusVal = body.dualDept ? "Approved" : "Forwarded";
          if (user.role === "RM") { updateData.rmStatus = statusVal; updateData.rmDate = now; }
          else                    { updateData.hodStatus = statusVal; updateData.hodDate = now; }
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
      if (decision === "Approved" && body.assignedPersonEmpId && (user.role === "DeptHOD" || isAssignedDeptUser)) {
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

    const isDualPopupForward = decision === "Forwarded" && body.dualDept && (user.role === "DeptHOD" || user.role === "HOD" || user.role === "RM");

    const isInternalAssign = decision === "Approved" && body.assignedPersonName &&
      (user.role === "DeptHOD" || user.role === "HOD" || user.role === "RM");

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
    } else if (isInternalAssign) {
      // Two messages: first Approved, then Assigned — both visible in chat
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
          text:      `Assigned internally to ${body.assignedPersonName}.`,
          status:    "Assigned",
          purpose:   updated.purpose,
          changedDept:  body.assignedPersonName,  // reuse changedDept to carry the names
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
    const stored = await storeFiles(req, files);
    const first  = files[0] ?? null;
    const fUrl   = stored[0]?.url  ?? null;
    const fName  = stored[0]?.name ?? null;
    const isImg  = first ? first.mimetype.startsWith("image/") : false;
    const fUrls  = stored.length > 0 ? JSON.stringify(stored.map(s => s.url))  : null;
    const fNames = stored.length > 0 ? JSON.stringify(stored.map(s => s.name)) : null;

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
      const nextDate = existing.isRecurring ? computeNextRecurringDate(existing.recurringInterval) : null;
      updateData = { acknowledgement: "Resolved", acknowledgedAt: now, isClosed: true, assignedStatus: `${dateStr} (Closed)`, nextRecurringDate: nextDate };
      chatText = existing.isRecurring && nextDate
        ? `✅ Requestor confirmed — ticket resolved. 🔁 Will auto-reopen on ${nextDate.toLocaleDateString("en-IN")} for the next recurring cycle.`
        : "✅ Requestor confirmed — ticket is now officially resolved and closed.";
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

    const newStored = await storeFiles(req, files);
    const newUrls  = newStored.map(s => s.url);
    const newNames = newStored.map(s => s.name);

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
    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw Object.assign(new Error("Request not found."), { status: 404 });
    if (!existing.isRecurring) throw Object.assign(new Error("This request is not recurring."), { status: 400 });

    // Authorized roles:
    // 1. DeptHOD of the assigned dept
    // 2. RM or HOD of the requestor's own dept
    const isAssignedDeptHOD  = user.role === "DeptHOD" && existing.assignedDept === user.dept;
    const isRequestorDeptStaff = (user.role === "RM" || user.role === "HOD") && existing.dept === user.dept;
    if (!isAssignedDeptHOD && !isRequestorDeptStaff) {
      throw Object.assign(new Error("Not authorized to stop recurring."), { status: 403 });
    }

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
        text:      `🔁 Recurring schedule stopped by ${user.name} (${user.role} — ${user.dept}). No further auto-reopening will occur.`,
      },
    });

    return formatRequest(updated, user.empId);
  }

module.exports = { approval, close, acknowledge, attachAfterClose, stopRecurring };
