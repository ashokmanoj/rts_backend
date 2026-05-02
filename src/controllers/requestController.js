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

async function create(req, res, next) {
  try {
    if (!req.body.purpose) return res.status(400).json({ error: "purpose is required." });
    const result = await requestService.create(req.user, req.body, req.file, req);
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
    const result = await requestService.close(Number(req.params.id), req.user, req.body, req.file, req);
    res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) return res.status(404).json({ error: err.message });
    if (err.message.includes("already closed")) return res.status(409).json({ error: err.message });
    if (err.message.includes("not authorized")) return res.status(403).json({ error: err.message });
    next(err);
  }
}

async function getHodPending(req, res, next) {
  try {
    const result = await requestService.getHodPendingRequests(req.user);
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

module.exports = { getAll, getFilterOptions, create, approval, markSeen, markUnread, close, getHodPending, hodApproval };
