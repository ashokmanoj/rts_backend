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
const { sendNewRequestNotification, sendPushToUser } = require("../utils/pushService");

const WITH_OWNER = { owner: true, closeTicket: true, chatMessages: true, readReceipts: true, _count: { select: { threadReplies: true } } };

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function computeNextRecurringDate(interval) {
  const d = new Date();
  switch (interval) {
    case "1w":  d.setDate(d.getDate() + 7);        break;
    case "2w":  d.setDate(d.getDate() + 14);       break;
    case "1m":  d.setMonth(d.getMonth() + 1);      break;
    case "6m":  d.setMonth(d.getMonth() + 6);      break;
    case "1y":  d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

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

    // Requestor depts where visibility is restricted to own + assigned only
    const RESTRICTED_REQUESTOR_PREFIXES = ["Operations-", "Academics-", "Stores-"];
    const RESTRICTED_REQUESTOR_EXACT    = new Set(["Game Development", "Software", "Animation", "Management", "Purchase", "HR"]);
    const isRestrictedRequestorDept = (dept) =>
      RESTRICTED_REQUESTOR_PREFIXES.some(p => dept?.startsWith(p)) ||
      RESTRICTED_REQUESTOR_EXACT.has(dept);

    let roleFilter = {};
    if (role === "SuperUser" || role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (role === "Requestor") {
      if (isRestrictedRequestorDept(userDept)) {
        // Restricted depts (Operations, Academics, Game Development, Software, Animation):
        // own requests + specifically assigned only — no dept-wide visibility
        // CC dept visibility is limited to RM/HOD; Requestors only see explicit personal CC
        roleFilter = {
          OR: [
            { empId },
            { assignedPersonEmpId: { contains: empId } },
            { ccEmpIds: { contains: empId } },
            { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
          ],
        };
      } else {
        // Other depts: own + incoming to their dept (cross-dept + same-dept) + assigned + forwarding chain
        // CC dept visibility is limited to RM/HOD; Requestors only see explicit personal CC
        roleFilter = {
          OR: [
            { empId },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { assignedPersonEmpId: { contains: empId } },
            { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccEmpIds: { contains: empId } },
            { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
          ],
        };
      }
    } else if (role === "DeptHOD") {
      roleFilter = { OR: [
        { AND: [{ empId }, { dept: userDept }] },
        { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
        { AND: [{ dept: userDept }, { assignedDept: userDept }, { isDirectAssign: false }] },
        { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
        { ccDepts:  { contains: userDept } },
        { ccEmpIds: { contains: empId } },
      ] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else if (role === "ViewCloseTicket") {
      // Only requests assigned to this user's specific dept
      roleFilter = {
        OR: [
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { assignedDepts: { contains: userDept } },
          { ccDepts: { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else {
      // Interns and any other non-privileged roles: own + assigned only
      roleFilter = {
        OR: [
          { empId },
          { assignedPersonEmpId: { contains: empId } },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
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

    // "closed" is a special value that maps to isClosed:true, not a status field.
    // Strip it out first so the status-clause handlers only see real status values.
    const rmHasClosed      = rmStatuses.includes("closed");
    const deptHodHasClosed = deptHodStatuses.includes("closed");
    const rmActive         = rmStatuses.filter(s => s !== "closed");
    const deptHodActive    = deptHodStatuses.filter(s => s !== "closed");
    const hasClosed        = rmHasClosed || deptHodHasClosed;
    const hasOtherStatuses = rmActive.length > 0 || deptHodActive.length > 0;

    // isClosed guard: only-closed → show closed; only-open filters → show open; mixed → no restriction
    if (hasClosed && !hasOtherStatuses) {
      extraFilters.push({ isClosed: true });
    } else if (!hasClosed && (rmStatuses.length > 0 || deptHodStatuses.length > 0)) {
      extraFilters.push({ isClosed: false });
    }

    // Requestor Dept Status — role-aware:
    //   RM      → filters only rmStatus
    //   HOD     → filters only hodStatus
    //   others  → filters across both rmStatus + hodStatus
    if (rmActive.length > 0) {
      const hasOpen        = rmActive.includes("--");
      const hasAckPending  = rmActive.includes("ack_pending");
      const hasNotApproved = rmActive.includes("not_approved");
      const others         = rmActive.filter(s => s !== "--" && s !== "ack_pending" && s !== "not_approved");
      const clauses        = [];
      if (role === "RM") {
        if (hasOpen)                clauses.push({ rmStatus: "--" });
        if (hasNotApproved)         clauses.push({ rmStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ rmStatus: others[0] });
        if (others.length  > 1)     clauses.push({ rmStatus: { in: others } });
      } else if (role === "HOD") {
        if (hasOpen)                clauses.push({ hodStatus: "--" });
        if (hasNotApproved)         clauses.push({ hodStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ hodStatus: others[0] });
        if (others.length  > 1)     clauses.push({ hodStatus: { in: others } });
      } else {
        if (hasOpen)                clauses.push({ AND: [{ rmStatus: "--" }, { hodStatus: "--" }] });
        if (hasNotApproved)         clauses.push({ AND: [{ rmStatus: { not: "Approved" } }, { hodStatus: { not: "Approved" } }] });
        if (others.length === 1)    clauses.push({ OR: [{ rmStatus: others[0] }, { hodStatus: others[0] }] });
        if (others.length  > 1)     clauses.push({ OR: [{ rmStatus: { in: others } }, { hodStatus: { in: others } }] });
      }
      if (hasAckPending) clauses.push({ assignedStatus: "Pending Acknowledgement" });
      extraFilters.push(clauses.length === 1 ? clauses[0] : { OR: clauses });
    }

    // Assigned Dept Status — role-aware:
    //   RM      → filters only assignedRmStatus
    //   HOD     → filters only assignedHodStatus
    //   DeptHOD → filters only deptHodStatus
    //   others  → filters across all three (assignedRmStatus, assignedHodStatus, deptHodStatus)
    if (deptHodActive.length > 0) {
      const hasOpen        = deptHodActive.includes("--");
      const hasAckPending  = deptHodActive.includes("ack_pending");
      const hasNotApproved = deptHodActive.includes("not_approved");
      const others         = deptHodActive.filter(s => s !== "--" && s !== "ack_pending" && s !== "not_approved");
      const clauses        = [];
      if (role === "RM") {
        if (hasOpen)                clauses.push({ assignedRmStatus: "--" });
        if (hasNotApproved)         clauses.push({ assignedRmStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ assignedRmStatus: others[0] });
        if (others.length  > 1)     clauses.push({ assignedRmStatus: { in: others } });
      } else if (role === "HOD") {
        if (hasOpen)                clauses.push({ assignedHodStatus: "--" });
        if (hasNotApproved)         clauses.push({ assignedHodStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ assignedHodStatus: others[0] });
        if (others.length  > 1)     clauses.push({ assignedHodStatus: { in: others } });
      } else if (role === "DeptHOD") {
        if (hasOpen)                clauses.push({ deptHodStatus: "--" });
        if (hasNotApproved)         clauses.push({ deptHodStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ deptHodStatus: others[0] });
        if (others.length  > 1)     clauses.push({ deptHodStatus: { in: others } });
      } else {
        if (hasOpen)                clauses.push({ AND: [{ assignedRmStatus: "--" }, { assignedHodStatus: "--" }, { deptHodStatus: "--" }] });
        if (hasNotApproved)         clauses.push({ AND: [{ assignedRmStatus: { not: "Approved" } }, { assignedHodStatus: { not: "Approved" } }, { deptHodStatus: { not: "Approved" } }] });
        if (others.length === 1)    clauses.push({ OR: [{ assignedRmStatus: others[0] }, { assignedHodStatus: others[0] }, { deptHodStatus: others[0] }] });
        if (others.length  > 1)     clauses.push({ OR: [{ assignedRmStatus: { in: others } }, { assignedHodStatus: { in: others } }, { deptHodStatus: { in: others } }] });
      }
      if (hasAckPending) clauses.push({ assignedStatus: "Pending Acknowledgement" });
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
      const term    = search.trim();
      const hashId  = /^#(\d+)$/.test(term) ? parseInt(term.slice(1), 10) : null;
      const numId   = hashId === null && /^\d+$/.test(term) ? parseInt(term, 10) : null;
      if (hashId !== null) {
        // #23 → exact ticket only
        searchFilter = { id: hashId };
      } else if (numId !== null) {
        // 23 → exact ticket only
        searchFilter = { id: numId };
      } else {
        searchFilter = {
          OR: [
            { purpose:     { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
            { empId:       { contains: term, mode: "insensitive" } },
            { owner: { name: { contains: term, mode: "insensitive" } } },
          ],
        };
      }
    }

    const andClauses = [roleFilter, closureFilter, ...extraFilters];
    if (Object.keys(searchFilter).length > 0) andClauses.push(searchFilter);
    const where = { AND: andClauses.filter(f => Object.keys(f).length > 0) };

    const order = sortOrder === "asc" ? "asc" : "desc";

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include:  WITH_OWNER,
        orderBy:  [
          { reopenedAt: { sort: "desc", nulls: "last" } },
          { createdAt:  order },
        ],
        skip,
        take,
      }),
      prisma.request.count({ where }),
    ]);

    return buildPageResponse(requests.map(r => formatRequest(r, empId)), total, page, limit);
  }

  async getFilterOptions(user) {
    const { role, empId, dept: userDept } = user;
    const RESTRICTED_REQUESTOR_PREFIXES = ["Operations-", "Academics-", "Stores-"];
    const RESTRICTED_REQUESTOR_EXACT    = new Set(["Game Development", "Software", "Animation", "Management", "HR", "Purchase"]);
    const isRestrictedRequestorDept = (dept) =>
      RESTRICTED_REQUESTOR_PREFIXES.some(p => dept?.startsWith(p)) ||
      RESTRICTED_REQUESTOR_EXACT.has(dept);

    let roleFilter = {};
    if (role === "SuperUser" || role === "Management" || role === "Admin") {
      roleFilter = {};
    } else if (role === "Requestor") {
      if (isRestrictedRequestorDept(userDept)) {
        roleFilter = {
          OR: [
            { empId },
            { assignedPersonEmpId: { contains: empId } },
            { ccDepts:  { contains: userDept } },
            { ccEmpIds: { contains: empId } },
            { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
          ],
        };
      } else {
        roleFilter = {
          OR: [
            { empId },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { assignedPersonEmpId: { contains: empId } },
            { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts:  { contains: userDept } },
            { ccEmpIds: { contains: empId } },
            { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
          ],
        };
      }
    } else if (role === "DeptHOD") {
      roleFilter = { OR: [
        { AND: [{ empId }, { dept: userDept }] },
        { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
        { AND: [{ dept: userDept }, { assignedDept: userDept }, { isDirectAssign: false }] },
        { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
        { ccDepts:  { contains: userDept } },
        { ccEmpIds: { contains: empId } },
      ] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else if (role === "ViewCloseTicket") {
      roleFilter = {
        OR: [
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { assignedDepts: { contains: userDept } },
          { ccDepts: { contains: userDept } },
          { ccEmpIds: { contains: empId } },
        ],
      };
    } else {
      roleFilter = {
        OR: [
          { empId },
          { assignedPersonEmpId: { contains: empId } },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
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

  async getThread(requestId, viewerEmpId) {
    const current = await prisma.request.findUnique({ where: { id: requestId }, select: { threadParentId: true } });
    if (!current) throw Object.assign(new Error("Request not found."), { status: 404 });

    // Chase up to the true root — handles chains where a child's threadParentId points
    // to another child instead of the root (e.g. legacy data before the root-resolution fix)
    let rootId = current.threadParentId ?? requestId;
    if (current.threadParentId) {
      const parent = await prisma.request.findUnique({ where: { id: current.threadParentId }, select: { threadParentId: true } });
      if (parent?.threadParentId) rootId = parent.threadParentId;
    }

    // All thread members except the current request (root + all replies)
    const members = await prisma.request.findMany({
      where: { OR: [{ id: rootId }, { threadParentId: rootId }], NOT: { id: requestId } },
      include: WITH_OWNER,
      orderBy: { id: "asc" },
    });

    return {
      rootId,
      isReply:     current.threadParentId != null,
      replyCount:  members.length + 1, // total members including self
      members:     members.map(m => formatRequest(m, viewerEmpId)),
    };
  }

  async create(user, data, uploadedFiles, req) {
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

  async close(reqId, user, body, uploadedFiles, req) {
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
    const fUrl   = first ? this.buildFileUrl(req, first.filename)  : null;
    const fName  = first ? first.originalname                      : null;
    const isImg  = first ? first.mimetype.startsWith("image/")     : false;
    const fUrls  = files.length > 0 ? JSON.stringify(files.map(f => this.buildFileUrl(req, f.filename))) : null;
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

  async getHodPendingRequests(user, query = {}) {
    const { search, hodStatus, rmStatus, dept, status, startDate, endDate, page, limit } = query;

    const GN_FILTER = {
      owner: {
        OR: [
          { rmEmpId:  { in: ["GN-01", "GN-02"] } },
          { hodEmpId: { in: ["GN-01", "GN-02"] } },
        ],
      },
    };

    const extra = [];

    // Open / closed
    if (status === "open")   extra.push({ isClosed: false });
    if (status === "closed") extra.push({ isClosed: true  });

    // Date range filter on createdAt
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate)   dateFilter.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
      if (dateFilter.gte || dateFilter.lte) extra.push({ createdAt: dateFilter });
    }

    // Management HOD-status filter (their own decision column)
    if (hodStatus && hodStatus !== "all") {
      if (hodStatus === "pending")  extra.push({ hodStatus: "--" });
      else if (hodStatus === "approved") extra.push({ hodStatus: "Approved" });
      else if (hodStatus === "rejected") extra.push({ hodStatus: "Rejected" });
      else if (hodStatus === "checking") extra.push({ hodStatus: "Checking" });
    }

    // RM status filter
    if (rmStatus && rmStatus !== "all") {
      if (rmStatus === "pending")  extra.push({ rmStatus: "--" });
      else if (rmStatus === "approved") extra.push({ rmStatus: "Approved" });
      else if (rmStatus === "rejected") extra.push({ rmStatus: "Rejected" });
      else if (rmStatus === "checking") extra.push({ rmStatus: "Checking" });
    }

    // Requestor department filter
    if (dept && dept !== "all") extra.push({ dept });

    // Full-text search across key fields
    if (search && search.trim()) {
      extra.push({
        OR: [
          { owner:       { name: { contains: search.trim(), mode: "insensitive" } } },
          { empId:       { contains: search.trim(), mode: "insensitive" } },
          { dept:        { contains: search.trim(), mode: "insensitive" } },
          { purpose:     { contains: search.trim(), mode: "insensitive" } },
          { description: { contains: search.trim(), mode: "insensitive" } },
        ],
      });
    }

    const where = extra.length ? { ...GN_FILTER, AND: extra } : GN_FILTER;

    // Optional pagination — omit skip/take when not requested to preserve existing behaviour
    const pageNum  = page  ? Math.max(1, parseInt(page))              : null;
    const limitNum = limit ? Math.min(200, Math.max(1, parseInt(limit))) : null;

    const [total, requests] = await Promise.all([
      prisma.request.count({ where }),
      prisma.request.findMany({
        where,
        include: WITH_OWNER,
        orderBy: { createdAt: "desc" },
        ...(pageNum && limitNum ? { skip: (pageNum - 1) * limitNum, take: limitNum } : {}),
      }),
    ]);

    return {
      data: requests.map(r => formatRequest(r, user.empId)),
      total,
      pagination: pageNum && limitNum
        ? { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
        : null,
    };
  }

  async getManagementFilterOptions() {
    const GN_FILTER = {
      owner: {
        OR: [
          { rmEmpId:  { in: ["GN-01", "GN-02"] } },
          { hodEmpId: { in: ["GN-01", "GN-02"] } },
        ],
      },
    };

    const [names, requestorDepts, assignedDepts, dateRange, hodStatuses, rmStatuses, assignedStatuses] = await Promise.all([
      // Distinct requestor names (empId must be in select when used in distinct)
      prisma.request.findMany({
        where: GN_FILTER,
        select: { empId: true, owner: { select: { name: true } } },
        distinct: ["empId"],
      }),
      // Distinct requestor departments
      prisma.request.findMany({
        where: GN_FILTER,
        select: { dept: true },
        distinct: ["dept"],
      }),
      // Distinct assigned departments (filter nulls in JS — Prisma rejects { not: null })
      prisma.request.findMany({
        where: GN_FILTER,
        select: { assignedDept: true },
        distinct: ["assignedDept"],
      }),
      // Date range — earliest and latest createdAt
      prisma.request.aggregate({
        where: GN_FILTER,
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      // Distinct management decision statuses (hodStatus)
      prisma.request.findMany({
        where: GN_FILTER,
        select: { hodStatus: true },
        distinct: ["hodStatus"],
      }),
      // Distinct RM statuses
      prisma.request.findMany({
        where: GN_FILTER,
        select: { rmStatus: true },
        distinct: ["rmStatus"],
      }),
      // Distinct assigned/ticket statuses
      prisma.request.findMany({
        where: GN_FILTER,
        select: { assignedStatus: true },
        distinct: ["assignedStatus"],
      }),
    ]);

    const STATUS_LABEL = { "--": "pending", "Approved": "approved", "Rejected": "rejected", "Checking": "checking" };

    return {
      names:          names.map(r => r.owner?.name).filter(Boolean).sort(),
      requestorDepts: requestorDepts.map(r => r.dept).filter(Boolean).sort(),
      assignedDepts:  assignedDepts.map(r => r.assignedDept).filter(Boolean).sort(),
      dateRange: {
        min: dateRange._min.createdAt ?? null,
        max: dateRange._max.createdAt ?? null,
      },
      hodStatuses: hodStatuses
        .map(r => r.hodStatus)
        .filter(Boolean)
        .sort()
        .map(s => ({ value: STATUS_LABEL[s] ?? s.toLowerCase(), label: s === "--" ? "Pending" : s })),
      rmStatuses: rmStatuses
        .map(r => r.rmStatus)
        .filter(Boolean)
        .sort()
        .map(s => ({ value: STATUS_LABEL[s] ?? s.toLowerCase(), label: s === "--" ? "Pending" : s })),
      assignedStatuses: assignedStatuses
        .map(r => r.assignedStatus)
        .filter(Boolean)
        .sort(),
    };
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

    // Preserve CC users' read receipts — HOD approval doesn't need to re-alert observers
    const _ccHod = existing.ccEmpIds ? existing.ccEmpIds.split(",").map(s => s.trim()).filter(Boolean) : [];
    await prisma.requestRead.deleteMany({
      where: { requestId: reqId, empId: { notIn: [user.empId, ..._ccHod] } },
    });
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

  async getUsersByDept(depts) {
    const deptList = Array.isArray(depts) ? depts : [depts];
    const ASSIGNABLE_ROLES = ["RM", "HOD", "DeptHOD"];
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { dept: { in: deptList } },
          { userRoles: { some: { dept: { in: deptList }, role: { in: ASSIGNABLE_ROLES } } } },
        ],
      },
      select:  { empId: true, name: true, dept: true, designation: true, role: true, userRoles: { select: { role: true, dept: true } } },
      orderBy: { name: "asc" },
    });
    return users.map(u => ({
      empId:       u.empId,
      name:        u.name,
      dept:        u.dept,
      designation: u.designation,
      role:        u.role,
      roles:       u.userRoles.map(r => ({ role: r.role, dept: r.dept })),
    }));
  }

  async getDepartments() {
    const users = await prisma.user.findMany({
      where:   { isActive: true },
      select:  { dept: true },
      distinct: ["dept"],
      orderBy: { dept: "asc" },
    });
    return users.map(u => u.dept).filter(Boolean).sort();
  }

  async getLocations() {
    const users = await prisma.user.findMany({
      where:   { isActive: true },
      select:  { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    });
    return users.map(u => u.location).filter(Boolean).sort();
  }

  async markSeen(requestId, empId) {
    return prisma.requestRead.upsert({
      where:  { requestId_empId: { requestId, empId } },
      update: { createdAt: new Date() },
      create: { requestId, empId },
    });
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

  async editRequest(reqId, user, body, uploadedFiles = [], req) {
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
      const newUrls  = files.map(f => this.buildFileUrl(req, f.filename));
      const newNames = files.map(f => f.originalname || f.filename);
      const allUrls  = [...existingUrls,  ...newUrls];
      const allNames = [...existingNames, ...newNames];
      updateData.fileUrl   = allUrls[0];
      updateData.fileName  = allNames[0];
      updateData.fileUrls  = JSON.stringify(allUrls);
      updateData.fileNames = JSON.stringify(allNames);
    }

    const [updated] = await prisma.$transaction([
      prisma.request.update({ where: { id: reqId }, data: updateData, include: WITH_OWNER }),
      prisma.chatMessage.deleteMany({ where: { requestId: reqId } }),
    ]);
    return formatRequest(updated, user.empId);
  }

  async broadcastUsers(user) {
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

  async broadcastSend(user, body, uploadedFiles = [], req) {
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
    const fUrl   = first ? this.buildFileUrl(req, first.filename)                             : null;
    const fName  = first ? first.originalname                                                  : null;
    const fUrls  = files.length > 0 ? JSON.stringify(files.map(f => this.buildFileUrl(req, f.filename))) : null;
    const fNames = files.length > 0 ? JSON.stringify(files.map(f => f.originalname))         : null;

    // Save exactly ONE record — the sender's copy — so the broadcaster sees it in their list
    await prisma.request.create({
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

    // Notify all matched Requestors via push — no extra DB records created
    const pushPayload = {
      title:              title.trim(),
      body:               stripHtml(description) || `Broadcast from ${user.dept} Department`,
      icon:               "/rtsLogo.png",
      badge:              "/rtsLogo.png",
      tag:                `broadcast-${Date.now()}`,
      requireInteraction: false,
      type:               "broadcast",
      url:                "/",
      data:               { action: "broadcast", channel_id: "rts_notifications", senderDept: user.dept },
    };
    Promise.allSettled(targets.map(t => sendPushToUser(t.empId, pushPayload))).catch(() => {});

    return { success: true, sentTo: targets.length };
  }

  async attachAfterClose(reqId, user, uploadedFiles, req) {
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

    const newUrls  = files.map(f => this.buildFileUrl(req, f.filename));
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

  async stopRecurring(reqId, user) {
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

  async getRoleCounts(user) {
    const { empId } = user;

    const availableRoles = await prisma.userRole.findMany({
      where:  { empId },
      select: { role: true, dept: true },
    });
    if (!availableRoles.length) return [];

    const RESTRICTED_PREFIXES = ["Operations-", "Academics-", "Stores-"];
    const RESTRICTED_EXACT    = new Set(["Game Development", "Software", "Animation", "Management", "HR", "Purchase"]);
    const isRestricted = (dept) =>
      RESTRICTED_PREFIXES.some(p => dept?.startsWith(p)) || RESTRICTED_EXACT.has(dept);

    const counts = await Promise.all(
      availableRoles.map(async ({ role, dept: userDept }) => {
        let roleFilter = {};

        if (role === "SuperUser" || role === "Management" || role === "Admin") {
          roleFilter = {};
        } else if (role === "Requestor") {
          roleFilter = isRestricted(userDept)
            ? { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: "broadcast" }, { ccDepts: "ALL" }] }] }
            : { OR: [{ empId }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { assignedPersonEmpId: { contains: empId } }, { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: "broadcast" }, { ccDepts: "ALL" }] }] };
        } else if (role === "DeptHOD") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ dept: userDept }, { assignedDept: userDept }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else if (role === "RM") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else if (role === "HOD") {
          roleFilter = { OR: [
            { AND: [{ empId }, { dept: userDept }] },
            { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }] },
            { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
            { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
            { ccDepts: { contains: userDept } },
            { ccEmpIds: { contains: empId } },
          ] };
        } else {
          roleFilter = { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }] };
        }

        const andFilters = [
          { isClosed: false },
          { NOT: { requestorRole: "broadcast" } },
          { readReceipts: { none: { empId } } },
        ];
        if (Object.keys(roleFilter).length > 0) andFilters.unshift(roleFilter);

        const count = await prisma.request.count({ where: { AND: andFilters } });
        return { role, dept: userDept, count };
      })
    );
    return counts;
  }
}

module.exports = new RequestService();
