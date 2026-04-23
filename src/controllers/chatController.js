/**
 * src/controllers/chatController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const chatService = require("../services/chatService");

async function getMessages(req, res, next) {
  try {
    const messages = await chatService.getMessages(Number(req.params.id));
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

module.exports = { getMessages, sendMessage };
