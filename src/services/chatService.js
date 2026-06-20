/**
 * src/services/chatService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma   = require("../config/database");
const presence = require("../utils/presenceService");

const toDate = (d) => new Date(d).toLocaleDateString("en-IN");
const toTime = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

class ChatService {
  buildFileUrl(req, filename) {
    if (!filename) return null;
    const base = process.env.SERVER_URL ? process.env.SERVER_URL.replace(/\/$/, "") : `${req.protocol}://${req.get("host")}`;
    return `${base}/api/files/${filename}`;
  }

  async getMessages(requestId, viewerEmpId) {
    const [messages, chatReads] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { requestId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.chatRead.findMany({ where: { requestId } }),
    ]);

    // Build a quick lookup: empId → lastReadAt (for non-viewer participants)
    const otherReads = chatReads.filter(r => r.empId !== viewerEmpId);
    const otherEmpIds = otherReads.map(r => r.empId);
    const onlineOthers = presence.whoIsOnline(otherEmpIds);

    return messages.map(m => {
      // Tick status is only relevant on messages the viewer sent
      let tickStatus = null;
      if (viewerEmpId && m.authorId === viewerEmpId) {
        const msgTime = new Date(m.createdAt).getTime();

        // "read" — at least one other participant opened the chat after this message was sent
        const isRead = otherReads.some(r => new Date(r.lastReadAt).getTime() > msgTime);

        if (isRead) {
          tickStatus = "read";
        } else if (onlineOthers.length > 0) {
          // "delivered" — someone else is currently online (heartbeat within 60 s)
          tickStatus = "delivered";
        } else {
          tickStatus = "sent";
        }
      }

      return {
        ...m,
        date: toDate(m.createdAt),
        time: toTime(m.createdAt),
        replyTo: m.replyTo ? JSON.parse(m.replyTo) : null,
        tickStatus,
      };
    });
  }

  async sendMessage(requestId, user, body, uploadedFile, req) {
    const { text, type, duration, replyTo } = body;
    const isImage = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;
    const isVoice = type === "voice";

    const data = {
      requestId,
      authorId: user.empId,
      author:   user.name,
      role:     user.role,
      dept:     user.dept   ?? null,
      type:     type || "message",
      text:     text || "",
      replyTo:  replyTo || null,
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

    // Mark as unread for others (ticket-level)
    await prisma.requestRead.deleteMany({
      where: { requestId, empId: { not: user.empId } }
    });

    return {
      ...saved,
      date: toDate(saved.createdAt),
      time: toTime(saved.createdAt),
      replyTo: saved.replyTo ? JSON.parse(saved.replyTo) : null,
      tickStatus: "sent",
    };
  }

  // Called when a user opens the chat panel for a request
  async markChatRead(requestId, empId) {
    return prisma.chatRead.upsert({
      where:  { requestId_empId: { requestId, empId } },
      update: { lastReadAt: new Date() },
      create: { requestId, empId },
    });
  }
}

module.exports = new ChatService();
