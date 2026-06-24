/**
 * src/controllers/requestController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const requestService = require("../services/requestService");

async function getAll(req, res, next) {
  try {
    const result = await requestService.getAll(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFilterOptions(req, res, next) {
  try {
    const options = await requestService.getFilterOptions(req.user);
    res.json(options);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.getById(reqId, req.user);
    if (!result) return res.status(404).json({ error: "Request not found." });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.purpose) return res.status(400).json({ error: "purpose is required." });
    const result = await requestService.create(req.user, req.body, req.files || [], req);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function approval(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    if (!req.body.decision) return res.status(400).json({ error: "decision is required." });
    const result = await requestService.approval(reqId, req.user, req.body);
    res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) return res.status(404).json({ error: err.message });
    if (err.message.includes("Unauthorized") || err.message.includes("only be approved by")) return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function markSeen(req, res, next) {
  try {
    await requestService.markSeen(Number(req.params.id), req.user.empId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function markUnread(req, res, next) {
  try {
    await requestService.markUnread(Number(req.params.id), req.user.empId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function close(req, res, next) {
  try {
    const result = await requestService.close(Number(req.params.id), req.user, req.body, req.files, req);
    res.json(result);
  } catch (err) {
    if (err.message.includes("not found"))    return res.status(404).json({ error: err.message });
    if (err.message.includes("already closed") || err.message.includes("Ticket already closed")) return res.status(409).json({ error: err.message });
    if (err.message.toLowerCase().includes("not authorized")) return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function getHodPending(req, res, next) {
  try {
    const result = await requestService.getHodPendingRequests(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function hodApproval(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    if (!req.body.decision) return res.status(400).json({ error: "decision is required." });
    const result = await requestService.hodApproval(reqId, req.user, req.body);
    res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) return res.status(404).json({ error: err.message });
    if (err.message.includes("Unauthorized") || err.message.includes("must be Approved")) return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function acknowledge(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    if (!req.body.status) return res.status(400).json({ error: "status is required." });
    const result = await requestService.acknowledge(reqId, req.user, req.body);
    res.json(result);
  } catch (err) {
    if (err.message.includes("not found"))   return res.status(404).json({ error: err.message });
    if (err.message.includes("not closed") || err.message.includes("Only the requestor"))
      return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function getUsersByDept(req, res, next) {
  try {
    const { depts } = req.query;
    if (!depts) return res.json([]);
    const deptList = depts.split(",").map(d => d.trim()).filter(Boolean);
    const users = await requestService.getUsersByDept(deptList);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getDepartments(req, res, next) {
  try {
    const depts = await requestService.getDepartments();
    res.json({ departments: depts });
  } catch (err) {
    next(err);
  }
}

async function getLocations(req, res, next) {
  try {
    const locations = await requestService.getLocations();
    res.json({ locations });
  } catch (err) {
    next(err);
  }
}

async function deleteRequest(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.deleteRequest(reqId, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function editRequest(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.editRequest(reqId, req.user, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function broadcastUsers(req, res, next) {
  try {
    const users = await requestService.broadcastUsers(req.user);
    res.json(users);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function broadcastSend(req, res, next) {
  try {
    const result = await requestService.broadcastSend(req.user, req.body, req.files || [], req);
    res.json(result);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: err.message });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function attachAfterClose(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.attachAfterClose(reqId, req.user, req.files || [], req);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 403) return res.status(403).json({ error: err.message });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function stopRecurring(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.stopRecurring(reqId, req.user);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 403) return res.status(403).json({ error: err.message });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
}

module.exports = { getAll, getById, getFilterOptions, create, approval, markSeen, markUnread, close, getHodPending, hodApproval, acknowledge, getUsersByDept, getDepartments, getLocations, deleteRequest, editRequest, stopRecurring, broadcastUsers, broadcastSend, attachAfterClose };
