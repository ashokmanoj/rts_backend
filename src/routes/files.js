const router = require("express").Router({ caseSensitive: true });
const path = require("path");
const fs = require("fs");
const { authenticate } = require("../middleware/auth");
const prisma = require("../config/database");

const UPLOAD_DIR = path.join(__dirname, "../../", process.env.UPLOAD_DIR || "uploads");

/**
 * GET /api/files/:filename
 * Securely serves files only if the user is authorized to see the related request.
 */
router.get("/:filename", authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const { role, empId, dept: userDept } = req.user;

  try {
    // 1. Identify the request associated with this file.
    // Files can be in Request, CloseTicket, or ChatMessage.
    const [request, closeTicket, chatMessage] = await Promise.all([
      prisma.request.findFirst({ where: { fileUrl: { contains: filename } }, select: { id: true, empId: true, dept: true, assignedDept: true } }),
      prisma.closeTicket.findFirst({ where: { fileUrl: { contains: filename } }, select: { requestId: true } }),
      prisma.chatMessage.findFirst({ 
        where: { OR: [{ fileUrl: { contains: filename } }, { voiceUrl: { contains: filename } }] },
        select: { requestId: true }
      })
    ]);

    let targetRequest = request;
    if (!targetRequest && closeTicket) {
      targetRequest = await prisma.request.findUnique({ 
        where: { id: closeTicket.requestId },
        select: { id: true, empId: true, dept: true, assignedDept: true }
      });
    }
    if (!targetRequest && chatMessage) {
      targetRequest = await prisma.request.findUnique({ 
        where: { id: chatMessage.requestId },
        select: { id: true, empId: true, dept: true, assignedDept: true }
      });
    }

    // 2. Authorization Check
    if (!targetRequest) {
      // If not in DB, allow only Admin (might be a system file or orphan)
      if (role !== "Admin") return res.status(404).json({ error: "File not found or unauthorized." });
    } else {
      let authorized = false;
      if (["Admin", "Management"].includes(role)) authorized = true;
      else if (targetRequest.empId === empId) authorized = true;
      else if (["RM", "HOD", "DeptHOD"].includes(role) && (targetRequest.dept === userDept || targetRequest.assignedDept === userDept)) authorized = true;
      else if (targetRequest.assignedDept === userDept) authorized = true;

      if (!authorized) return res.status(403).json({ error: "Access denied to this file." });
    }

    // 3. Serve the file
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk." });

    // Set appropriate content type if possible, or let sendFile handle it
    res.sendFile(filePath);
  } catch (error) {
    console.error("File serving error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
