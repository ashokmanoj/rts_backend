/**
 * src/services/chatService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma = require("../config/database");

class ChatService {
  buildFileUrl(req, filename) {
    if (!filename) return null;
    const base = process.env.SERVER_URL ? process.env.SERVER_URL.replace(/\/$/, "") : `${req.protocol}://${req.get("host")}`;
    return `${base}/api/files/${filename}`;
  }

  async getMessages(requestId) {
    return prisma.chatMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    });
  }

  async sendMessage(requestId, user, body, uploadedFile, req) {
    const { text, type, duration } = body;
    const isImage = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;
    const isVoice = type === "voice";

    const data = {
      requestId,
      authorId: user.empId,
      author: user.name,
      role: user.role,
      type: type || "message",
      text: text || "",
    };

    if (uploadedFile) {
      const url = this.buildFileUrl(req, uploadedFile.filename);
      if (isVoice) {
        data.voiceUrl = url;
        data.duration = duration;
      } else {
        data.fileUrl = url;
        data.fileName = uploadedFile.originalname;
        data.isImage = isImage;
      }
    }

    const saved = await prisma.chatMessage.create({ data });

    // Mark as unread for others
    await prisma.requestRead.deleteMany({
      where: { requestId, empId: { not: user.empId } }
    });

    return saved;
  }
}

module.exports = new ChatService();
