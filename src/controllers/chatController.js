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
    const { text } = req.body;
    const user = req.user;
    const uploadedFile = req.file;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    if (!text && !uploadedFile) {
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

    const message = await prisma.chatMessage.create({
      data: {
        requestId,
        authorId: user.empId,
        author: user.name,
        role: user.role,
        type: uploadedFile ? "file" : "message",
        text: text || "",
        fileUrl,
        fileName,
        isImage,
      },
    });

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMessages,
  sendMessage,
};