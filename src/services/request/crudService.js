"use strict";

const prisma = require("../../config/database");
const { formatRequest } = require("../../utils/formatters");
const { WITH_OWNER, buildFileUrl, computeNextRecurringDate } = require("./helpers");
const { sendNewRequestNotification } = require("../../utils/pushService");

async function create(user, data, uploadedFiles, req) {
    const { purpose, description, assignedDept, assignedDepts, dueDate, assignedPersonEmpId, assignedPersonName, ccDepts, ccEmpIds, ccPersonNames, isRecurring, recurringInterval, threadParentId } = data;

    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    const first = files[0] ?? null;

    const recurring = isRecurring === true || isRecurring === "true";
    const nextDate  = recurring ? computeNextRecurringDate(recurringInterval) : null;

    // If parent is itself a reply, resolve to the root so all thread members
    // always point to the same root request (enables chain tracking)
    let resolvedThreadParentId = threadParentId ? Number(threadParentId) : null;
    if (resolvedThreadParentId) {
      const parent = await prisma.request.findUnique({
        where:  { id: resolvedThreadParentId },
        select: { threadParentId: true },
      });
      if (parent?.threadParentId) resolvedThreadParentId = parent.threadParentId;
    }

    const request = await prisma.request.create({
      data: {
        empId:               user.empId,
        purpose,
        description:         description || "",
        fileUrl:             first ? buildFileUrl(req, first.filename) : null,
        fileName:            first ? first.originalname : null,
        fileUrls:            files.length > 0 ? JSON.stringify(files.map(f => buildFileUrl(req, f.filename))) : null,
        fileNames:           files.length > 0 ? JSON.stringify(files.map(f => f.originalname)) : null,
        dept:                user.dept,
        assignedDept:        (Array.isArray(assignedDept) ? assignedDept[0] : assignedDept) || user.dept,
        assignedDepts:       (Array.isArray(assignedDepts) ? assignedDepts[0] : assignedDepts) || null,
        requestorRole:       user.role,
        dueDate:             dueDate ? new Date(dueDate) : null,
        assignedPersonEmpId: assignedPersonEmpId || null,
        assignedPersonName:  Array.isArray(assignedPersonName) ? (assignedPersonName[0] || null) : (assignedPersonName || null),
        isDirectAssign:      !!(assignedPersonEmpId),
        ccDepts:      ccDepts      || null,
        ccEmpIds:     ccEmpIds     || null,
        ccPersonNames: ccPersonNames || null,
        isRecurring:         recurring,
        recurringInterval:   recurring ? (recurringInterval || null) : null,
        nextRecurringDate:   nextDate,
        threadParentId:      resolvedThreadParentId,
        readReceipts:        { create: { empId: user.empId } },
      },
      include: WITH_OWNER,
    });

    // Fire push notifications to RM, HOD, DeptHOD (non-blocking)
    sendNewRequestNotification(request).catch(() => {});

    return formatRequest(request, user.empId);
  }

async function deleteRequest(reqId, user) {
    if (user.role !== "SuperUser") throw new Error("Only SuperUser can delete requests.");
    const existing = await prisma.request.findUnique({ where: { id: reqId } });
    if (!existing) throw new Error("Request not found.");
    // Cascade: chat messages, read records, close ticket records deleted via DB relations
    await prisma.request.delete({ where: { id: reqId } });
    return { success: true };
  }

async function editRequest(reqId, user, body, uploadedFiles = [], req) {
    if (user.role !== "SuperUser") throw new Error("Only SuperUser can edit requests.");
    const existing = await prisma.request.findUnique({ where: { id: reqId }, include: WITH_OWNER });
    if (!existing) throw new Error("Request not found.");

    const { purpose, description, assignedDept, assignedDepts, dueDate,
            assignedPersonEmpId, assignedPersonName,
            ccDepts, ccEmpIds, ccPersonNames } = body;
    const updateData = {};
    if (purpose             !== undefined) updateData.purpose             = purpose;
    if (description         !== undefined) updateData.description         = description;
    if (assignedDept        !== undefined) updateData.assignedDept        = assignedDept;
    if (assignedDepts       !== undefined) updateData.assignedDepts       = assignedDepts || null;
    if (assignedPersonEmpId !== undefined) updateData.assignedPersonEmpId = assignedPersonEmpId || null;
    if (assignedPersonName  !== undefined) updateData.assignedPersonName  = assignedPersonName  || null;
    if (dueDate             !== undefined) updateData.dueDate             = dueDate ? new Date(dueDate) : null;
    if (ccDepts             !== undefined) updateData.ccDepts             = ccDepts      || null;
    if (ccEmpIds            !== undefined) updateData.ccEmpIds            = ccEmpIds     || null;
    if (ccPersonNames       !== undefined) updateData.ccPersonNames       = ccPersonNames || null;

    // Append new uploaded files to existing ones
    const files = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
    if (files.length > 0) {
      let existingUrls = [];
      let existingNames = [];
      if (existing.fileUrls) {
        try { existingUrls = JSON.parse(existing.fileUrls); } catch { existingUrls = []; }
      } else if (existing.fileUrl) {
        existingUrls = [existing.fileUrl];
      }
      if (existing.fileNames) {
        try { existingNames = JSON.parse(existing.fileNames); } catch { existingNames = []; }
      } else if (existing.fileName) {
        existingNames = [existing.fileName];
      }
      const newUrls  = files.map(f => buildFileUrl(req, f.filename));
      const newNames = files.map(f => f.originalname || f.filename);
      const allUrls  = [...existingUrls,  ...newUrls];
      const allNames = [...existingNames, ...newNames];
      updateData.fileUrl   = allUrls[0];
      updateData.fileName  = allNames[0];
      updateData.fileUrls  = JSON.stringify(allUrls);
      updateData.fileNames = JSON.stringify(allNames);
    }

    const updated = await prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER });

    // Log the edit so the chat trail records who changed what
    await prisma.chatMessage.create({
      data: {
        requestId: reqId,
        authorId:  user.empId,
        author:    user.name,
        role:      user.role,
        dept:      user.dept,
        type:      "system",
        text:      `Request edited by ${user.name} (SuperUser).`,
        status:    "Edited",
        purpose:   updated.purpose,
      },
    });

    return formatRequest(updated, user.empId);
  }

module.exports = { create, editRequest, deleteRequest };
