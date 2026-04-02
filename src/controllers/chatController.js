/**
 * src/controllers/chatController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Chat messages nested under each request.
 *
 * Routes (all require JWT via authenticate middleware):
 *   GET  /api/requests/:id/chat  → getMessages
 *   POST /api/requests/:id/chat  → sendMessage  (multipart — optional file)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma              = require("../db/prisma");
const { formatMessage }   = require("../utils/formatters");

/** Build absolute URL for an uploaded file. */
const buildFileUrl = (req, filename) => {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/requests/:id/chat
// Returns all messages for a request in chronological order.
// ─────────────────────────────────────────────────────────────────────────────
async function getMessages(req, res, next) {
  try {
    const reqId = Number(req.params.id);

    // Verify request exists
    const reqExists = await prisma.request.findUnique({ where: { id: reqId } });
    if (!reqExists) return res.status(404).json({ error: "Request not found." });

    const messages = await prisma.chatMessage.findMany({
      where:   { requestId: reqId },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages.map(formatMessage));
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests/:id/chat
// Accepts text JSON or multipart (file / voice attachment).
// Blocked if the ticket is already closed.
// ─────────────────────────────────────────────────────────────────────────────
async function sendMessage(req, res, next) {
  try {
    const reqId        = Number(req.params.id);
    const user         = req.user;
    const body         = req.body;
    const uploadedFile = req.file;

    // ── Check ticket exists and is open ─────────────────────────────────────
    const request = await prisma.request.findUnique({ where: { id: reqId } });
    if (!request)         return res.status(404).json({ error: "Request not found." });
    if (request.isClosed) {
      return res.status(403).json({ error: "Ticket is closed. Chat is disabled." });
    }

    // ── Parse message fields ─────────────────────────────────────────────────
    const type         = body.type || "message";
    const text         = body.text || "";

    // Route file URL to correct field based on message type
    const rawUrl       = uploadedFile ? buildFileUrl(req, uploadedFile.filename) : null;
    const rawName      = uploadedFile ? uploadedFile.originalname                : null;
    const isImg        = uploadedFile
      ? uploadedFile.mimetype.startsWith("image/")
      : false;

    // Voice messages use voiceUrl; all other types use fileUrl
    const voiceUrl     = type === "voice"                              ? rawUrl  : null;
    const fileUrl      = type !== "voice" && uploadedFile             ? rawUrl  : null;
    const fileName     = type !== "voice" && uploadedFile             ? rawName : null;

    // ── Validate: file/voice types must have an actual file ──────────────────
    if (["file", "voice", "mixed"].includes(type) && !uploadedFile) {
      return res.status(400).json({
        error: `A file is required for message type '${type}'.`,
      });
    }

    // ── Mark request unseen so other users notice new activity ───────────────
    await prisma.request.update({
      where: { id: reqId },
      data:  { seen: false },
    });

    // ── Persist the message ──────────────────────────────────────────────────
    const message = await prisma.chatMessage.create({
      data: {
        requestId:   reqId,
        authorId:    user.empId,
        author:      user.name,
        role:        user.role,
        type,
        text,
        fileUrl,
        fileName,
        isImage:     isImg,
        voiceUrl,
        duration:    body.duration     || null,
        status:      body.status       || null,
        purpose:     body.purpose      || null,
        changedDept: body.changedDept  || null,
        originalDept:body.originalDept || null,
      },
    });

    res.status(201).json(formatMessage(message));
  } catch (err) { next(err); }
}

module.exports = { getMessages, sendMessage };
