/**
 * src/controllers/chatController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const chatService = require("../services/chatService");
const presence    = require("../utils/presenceService");

async function getMessages(req, res, next) {
  try {
    const messages = await chatService.getMessages(Number(req.params.id), req.user?.empId);
    res.json(messages);
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const saved = await chatService.sendMessage(Number(req.params.id), req.user, req.body, req.file, req);
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
}

// POST /requests/:id/chat/read
// Called when user opens the chat panel — records their last-read timestamp
async function markChatRead(req, res, next) {
  try {
    await chatService.markChatRead(Number(req.params.id), req.user.empId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/users/heartbeat
// Lightweight ping every 30 s to register the user as online
async function heartbeat(req, res) {
  presence.updatePresence(req.user.empId);
  res.json({ ok: true });
}

module.exports = { getMessages, sendMessage, markChatRead, heartbeat };
