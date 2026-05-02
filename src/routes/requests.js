const router = require("express").Router({ caseSensitive: true });
const ctrl = require("../controllers/requestController");
const chatCtrl = require("../controllers/chatController");
const { authenticate, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");

// All routes require authentication
router.use(authenticate);

// ================= REQUEST ROUTES =================

// GET all requests
router.get("/", ctrl.getAll);

// GET unique filter options
router.get("/filters", ctrl.getFilterOptions);

// ── Management Portal: HOD-pending requests & HOD-level approval ──────────
router.get("/hod-pending", authorize("Management"), ctrl.getHodPending);
router.patch("/:id/hod-approval", authorize("Management"), ctrl.hodApproval);

// CREATE request (with optional file)
router.post("/", upload.single("file"), ctrl.create);

// APPROVAL flow
router.patch("/:id/approval", ctrl.approval);

// Seen / Unread
router.patch("/:id/seen", ctrl.markSeen);
router.patch("/:id/unread", ctrl.markUnread);

// Close request (optional file)
router.patch("/:id/close", upload.single("file"), ctrl.close);

// ================= CHAT ROUTES =================

// Get messages for request
router.get("/:id/chat", chatCtrl.getMessages);

// Send message (file/voice optional)
router.post("/:id/chat", upload.single("file"), chatCtrl.sendMessage);

module.exports = router;