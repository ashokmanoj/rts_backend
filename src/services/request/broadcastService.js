"use strict";

const prisma = require("../../config/database");
const { buildFileUrl, stripHtml } = require("./helpers");
const { sendPushToUser } = require("../../utils/pushService");

async function broadcastUsers(user) {
    const ALLOWED_DEPTS = ["HR", "Food Committee", "TA Committee", "RTS Help Desk"];
    if (user.role !== "DeptHOD" || !ALLOWED_DEPTS.includes(user.dept)) {
      throw Object.assign(new Error("Not authorized."), { status: 403 });
    }
    const users = await prisma.user.findMany({
      where:   {
        isActive: true,
        empId:    { not: user.empId },
        OR: [
          { role: "Requestor" },
          { userRoles: { some: { role: "Requestor", isActive: true } } },
        ],
      },
      select:  { empId: true, name: true, dept: true, location: true },
      orderBy: [{ dept: "asc" }, { name: "asc" }],
    });
    return users;
  }

async function broadcastSend(user, body, uploadedFiles = [], req) {
    const ALLOWED_DEPTS = ["HR", "Food Committee", "TA Committee", "RTS Help Desk"];
    if (user.role !== "DeptHOD" || !ALLOWED_DEPTS.includes(user.dept)) {
      throw Object.assign(new Error("Not authorized."), { status: 403 });
    }

    // Normalize FormData fields (values may come as strings or arrays from multipart)
    const normArr  = v => !v ? [] : Array.isArray(v) ? v : [v];
    const title       = Array.isArray(body.title)       ? body.title[0]       : body.title;
    const description = Array.isArray(body.description) ? body.description[0] : body.description;
    const sendToAll   = body.sendToAll === "true" || body.sendToAll === true;
    const targetDepts     = normArr(body.targetDepts);
    const targetLocations = normArr(body.targetLocations);
    const targetEmpIds    = normArr(body.targetEmpIds);

    if (!title?.trim()) throw Object.assign(new Error("Title is required."), { status: 400 });

    // Users with Requestor role (primary or secondary) receive broadcasts
    const baseWhere = {
      isActive: true,
      empId:    { not: user.empId },
      OR: [
        { role: "Requestor" },
        { userRoles: { some: { role: "Requestor", isActive: true } } },
      ],
    };

    if (!sendToAll) {
      if (!targetDepts.length && !targetLocations.length && !targetEmpIds.length)
        throw Object.assign(new Error("Select at least one target."), { status: 400 });

      // Dept + location are AND'd (intersection): e.g. Software dept in Bangalore only.
      // Individual empIds are always OR'd in on top, so explicitly chosen users are always included.
      const deptLocFilter = {};
      if (targetDepts.length)     deptLocFilter.dept     = { in: targetDepts };
      if (targetLocations.length) deptLocFilter.location = { in: targetLocations };

      if (targetEmpIds.length) {
        // (dept AND location) OR specific users
        const clauses = [];
        if (Object.keys(deptLocFilter).length) clauses.push(deptLocFilter);
        clauses.push({ empId: { in: targetEmpIds } });
        baseWhere.OR = clauses;
      } else {
        // Dept and/or location only — both applied as AND via top-level merge
        Object.assign(baseWhere, deptLocFilter);
      }
    }

    const targets = await prisma.user.findMany({
      where:  baseWhere,
      select: { empId: true, dept: true, name: true },
    });

    if (!targets.length) throw Object.assign(new Error("No users matched the selection."), { status: 400 });

    const now   = new Date();
    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    const first = files[0] ?? null;
    const fUrl   = first ? buildFileUrl(req, first.filename)                             : null;
    const fName  = first ? first.originalname                                                  : null;
    const fUrls  = files.length > 0 ? JSON.stringify(files.map(f => buildFileUrl(req, f.filename))) : null;
    const fNames = files.length > 0 ? JSON.stringify(files.map(f => f.originalname))         : null;

    // Save exactly ONE record — the sender's copy — so the broadcaster sees it in their list
    const broadcast = await prisma.request.create({
      data: {
        empId:               user.empId,
        purpose:             title.trim(),
        description:         description?.trim() || null,
        dept:                user.dept,
        requestorRole:       "broadcast",
        isClosed:            true,
        resolvedDate:        now,
        resolvedBy:          `${user.name} (Broadcast)`,
        assignedStatus:      "Broadcast",
        deptHodStatus:       "Approved",
        deptHodDate:         now,
        fileUrl:             fUrl,
        fileName:            fName,
        fileUrls:            fUrls,
        fileNames:           fNames,
        assignedDept:        user.dept,
        assignedPersonEmpId: user.empId,
        assignedPersonName:  user.name,
        ccDepts:             sendToAll ? "ALL" : null,
        ccEmpIds:            !sendToAll ? targets.map(t => t.empId).join(",") : null,
        readReceipts:        { create: { empId: user.empId } },
      },
    });

    // Notify all matched Requestors via push — deep-link directly to the broadcast ticket
    const pushPayload = {
      title:              title.trim(),
      body:               stripHtml(description) || `Broadcast from ${user.dept} Department`,
      tag:                `broadcast-${broadcast.id}`,
      requireInteraction: false,
      type:               "broadcast",
      url:                `/?openRequest=${broadcast.id}`,
      data:               { action: "broadcast", channel_id: "rts_notifications", senderDept: user.dept, requestId: broadcast.id },
    };
    Promise.allSettled(targets.map(t => sendPushToUser(t.empId, pushPayload))).catch(() => {});

    return { success: true, sentTo: targets.length };
  }

module.exports = { broadcastUsers, broadcastSend };
