"use strict";

const prisma = require("../db/prisma");

// Build file URL (same as requestController)
const buildFileUrl = (req, filename) => {
  if (!filename) return null;

  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;

  return `${base}/uploads/${filename}`;
};

// ================= GET MESSAGES =================
const getMessages = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
};

// ================= SEND MESSAGE =================
const sendMessage = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { text, type, duration, status, purpose, changedDept, originalDept } = req.body;
    const user = req.user;
    const uploadedFile = req.file;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    if (!text && !uploadedFile && type !== "approval") {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const fileUrl = uploadedFile
      ? buildFileUrl(req, uploadedFile.filename)
      : null;

    const fileName = uploadedFile
      ? uploadedFile.originalname
      : null;

    const isImage = uploadedFile
      ? uploadedFile.mimetype.startsWith("image/")
      : false;

    // Determine type: if not provided, fallback to file or message
    let finalType = type || (uploadedFile ? "file" : "message");

    const [message] = await Promise.all([
      prisma.chatMessage.create({
        data: {
          requestId,
          authorId:     user.empId,
          author:       user.name,
          role:         user.role,
          type:         finalType,
          text:         text || "",
          fileUrl:      finalType === "voice" ? null : fileUrl,
          fileName:     finalType === "voice" ? null : fileName,
          isImage:      finalType === "voice" ? false : isImage,
          voiceUrl:     finalType === "voice" ? fileUrl : null,
          duration:     duration     || null,
          status:       status       || null,
          purpose:      purpose      || null,
          changedDept:  changedDept  || null,
          originalDept: originalDept || null,
        },
      }),
      // Mark request as unread
      prisma.request.update({
        where: { id: requestId },
        data:  { seen: false },
      }),
    ]);

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMessages,
  sendMessage,
};