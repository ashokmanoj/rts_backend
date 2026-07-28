"use strict";

const prisma = require("../../config/database");
const { formatRequest } = require("../../utils/formatters");
const { WITH_OWNER } = require("./helpers");

async function getHodPendingRequests(user, query = {}) {
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

async function getManagementFilterOptions() {
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

async function hodApproval(reqId, user, body) {
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

module.exports = { getHodPendingRequests, getManagementFilterOptions, hodApproval };
