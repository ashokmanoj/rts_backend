const router = require("express").Router();
const ctrl   = require("../controllers/requestController");
const chatCtrl = require("../controllers/chatController");
const { authenticate } = require("../middleware/auth");
const upload = require("../middleware/upload");

// All routes require a valid JWT
router.use(authenticate);

// ── Request CRUD ─────────────────────────────────────────────
// GET  /api/requests
router.get("/",         ctrl.getAll);

// POST /api/requests          (multipart — optional file)
router.post("/",        upload.single("file"), ctrl.create);

// PATCH /api/requests/:id/approval
router.patch("/:id/approval", ctrl.approval);

// PATCH /api/requests/:id/seen
router.patch("/:id/seen",   ctrl.markSeen);

// PATCH /api/requests/:id/unread
router.patch("/:id/unread", ctrl.markUnread);

// PATCH /api/requests/:id/close  (multipart — optional file)
router.patch("/:id/close",  upload.single("file"), ctrl.close);

// ── Chat (nested under request) ──────────────────────────────
// GET  /api/requests/:id/chat
router.get("/:id/chat",  chatCtrl.getMessages);

// POST /api/requests/:id/chat  (multipart — optional file/voice)
router.post("/:id/chat", upload.single("file"), chatCtrl.sendMessage);

module.exports = router;
