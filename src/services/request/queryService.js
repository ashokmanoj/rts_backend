"use strict";

const prisma = require("../../config/database");
const { formatRequest } = require("../../utils/formatters");
const { parsePagination, buildPageResponse } = require("../../utils/paginate");
const { WITH_OWNER, isRestrictedRequestorDept } = require("./helpers");

function buildRoleFilter(user) {
  const { role, empId, dept: userDept } = user;
  const isAccountsDept = userDept?.startsWith("Accounts-");
  if (role === "SuperUser" || role === "Management" || role === "Admin") return {};
  if (role === "Requestor") {
    if (isRestrictedRequestorDept(userDept)) {
      return { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] }] };
    }
    return { OR: [{ empId }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { assignedPersonEmpId: { contains: empId } }, { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] }, ...(isAccountsDept ? [{ ccDepts: { contains: userDept } }] : [])] };
  }
  if (role === "DeptHOD") return { OR: [{ AND: [{ empId }, { dept: userDept }] }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { AND: [{ dept: userDept }, { assignedDept: userDept }, { isDirectAssign: false }] }, { AND: [{ assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }] };
  if (role === "RM") return { OR: [{ AND: [{ empId }, { dept: userDept }] }, { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }, { assignedDept: { not: "Management" } }] }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }] };
  if (role === "HOD") return { OR: [{ AND: [{ empId }, { dept: userDept }] }, { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }, { assignedDept: { not: "Management" } }] }, { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] }, { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }] };
  if (role === "ViewCloseTicket") return { OR: [{ AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] }, { assignedDepts: { contains: userDept } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] }] };
  if (role === "ProjectView") return { OR: [{ dept: userDept }, { assignedDept: userDept }, { assignedDepts: { contains: userDept } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] }] };
  return { OR: [{ empId }, { assignedPersonEmpId: { contains: empId } }, { ccDepts: { contains: userDept } }, { ccEmpIds: { contains: empId } }, { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] }] };
}

async function getCounts(user) {
  const roleFilter = buildRoleFilter(user);
  const rf = Object.keys(roleFilter).length > 0 ? [roleFilter] : [];
  const [open, closed, ackPending, broadcast] = await Promise.all([
    prisma.request.count({ where: { AND: [...rf, { isClosed: false }, { assignedStatus: { not: "Pending Acknowledgement" } }] } }),
    prisma.request.count({ where: { AND: [...rf, { isClosed: true }] } }),
    prisma.request.count({ where: { AND: [...rf, { assignedStatus: "Pending Acknowledgement" }] } }),
    prisma.request.count({ where: { AND: [...rf, { requestorRole: "broadcast" }] } }),
  ]);
  return { open, closed, ackPending, broadcast };
}

async function getAll(user, query) {
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
    if (status === "open")        closureFilter = { isClosed: false, assignedStatus: { not: "Pending Acknowledgement" } };
    if (status === "closed")      closureFilter = { isClosed: true };
    if (status === "ack_pending") closureFilter = { assignedStatus: "Pending Acknowledgement" };
    if (status === "broadcast")   closureFilter = { requestorRole: "broadcast" };

    const roleFilter = buildRoleFilter(user);

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
      const notAckPending = { assignedStatus: { not: "Pending Acknowledgement" } };
      if (role === "RM") {
        if (hasOpen)                clauses.push({ AND: [{ rmStatus: "--" }, notAckPending] });
        if (hasNotApproved)         clauses.push({ rmStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ rmStatus: others[0] });
        if (others.length  > 1)     clauses.push({ rmStatus: { in: others } });
      } else if (role === "HOD") {
        if (hasOpen)                clauses.push({ AND: [{ hodStatus: "--" }, notAckPending] });
        if (hasNotApproved)         clauses.push({ hodStatus: { not: "Approved" } });
        if (others.length === 1)    clauses.push({ hodStatus: others[0] });
        if (others.length  > 1)     clauses.push({ hodStatus: { in: others } });
      } else {
        if (hasOpen)                clauses.push({ AND: [{ rmStatus: "--" }, { hodStatus: "--" }, notAckPending] });
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

    // Default sort: unread tickets for this user float to the top, then newest first.
    // Uses two queries so unread-first works correctly across pagination pages.
    if (!sortOrder || sortOrder === "default") {
      const unreadWhere = { AND: [...andClauses.filter(f => Object.keys(f).length > 0), { readReceipts: { none: { empId } } }] };
      const readWhere   = { AND: [...andClauses.filter(f => Object.keys(f).length > 0), { readReceipts: { some: { empId } } }] };
      const dateOrder   = [{ createdAt: "desc" }];

      const [unreadTotal, readTotal] = await Promise.all([
        prisma.request.count({ where: unreadWhere }),
        prisma.request.count({ where: readWhere }),
      ]);
      const total = unreadTotal + readTotal;

      let rows = [];
      if (skip < unreadTotal) {
        const unreadTake = Math.min(take, unreadTotal - skip);
        const unreadRows = await prisma.request.findMany({ where: unreadWhere, include: WITH_OWNER, orderBy: dateOrder, skip, take: unreadTake });
        rows.push(...unreadRows);
        if (rows.length < take) {
          const readRows = await prisma.request.findMany({ where: readWhere, include: WITH_OWNER, orderBy: dateOrder, skip: 0, take: take - rows.length });
          rows.push(...readRows);
        }
      } else {
        rows = await prisma.request.findMany({ where: readWhere, include: WITH_OWNER, orderBy: dateOrder, skip: skip - unreadTotal, take });
      }

      return buildPageResponse(rows.map(r => formatRequest(r, empId)), total, page, limit);
    }

    const order = sortOrder === "asc" ? "asc" : "desc";

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include:  WITH_OWNER,
        orderBy:  [{ createdAt: order }],
        skip,
        take,
      }),
      prisma.request.count({ where }),
    ]);

    return buildPageResponse(requests.map(r => formatRequest(r, empId)), total, page, limit);
  }

async function getFilterOptions(user) {
    const { role, empId, dept: userDept } = user;

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
        { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
      ] };
    } else if (role === "RM") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { rmEmpId: empId } }, { dept: userDept }, { assignedDept: { not: "Management" } }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { rmEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
          { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
        ],
      };
    } else if (role === "HOD") {
      roleFilter = {
        OR: [
          { AND: [{ empId }, { dept: userDept }] },
          { AND: [{ owner: { hodEmpId: empId } }, { dept: userDept }, { assignedDept: { not: "Management" } }] },
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ assignedDepts: { contains: userDept } }, { dept: { not: userDept } }, { isDirectAssign: false }] },
          { AND: [{ owner: { hodEmpId: empId } }, { assignedDepts: { contains: userDept } }, { isDirectAssign: false }] },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
          { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
        ],
      };
    } else if (role === "ViewCloseTicket") {
      roleFilter = {
        OR: [
          { AND: [{ assignedDept: userDept }, { dept: { not: userDept } }] },
          { assignedDepts: { contains: userDept } },
          { ccDepts: { contains: userDept } },
          { ccEmpIds: { contains: empId } },
          { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
        ],
      };
    } else if (role === "ProjectView") {
      roleFilter = {
        OR: [
          { dept: userDept },
          { assignedDept: userDept },
          { assignedDepts: { contains: userDept } },
          { ccDepts: { contains: userDept } },
          { ccEmpIds: { contains: empId } },
          { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
        ],
      };
    } else {
      roleFilter = {
        OR: [
          { empId },
          { assignedPersonEmpId: { contains: empId } },
          { ccDepts:  { contains: userDept } },
          { ccEmpIds: { contains: empId } },
          { AND: [{ requestorRole: 'broadcast' }, { ccDepts: "ALL" }] },
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

async function getById(reqId, user) {
    const row = await prisma.request.findUnique({ where: { id: reqId }, include: WITH_OWNER });
    if (!row) return null;
    return formatRequest(row, user.empId);
  }

async function getThread(requestId, viewerEmpId) {
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

module.exports = { getAll, getFilterOptions, getById, getThread, getCounts };