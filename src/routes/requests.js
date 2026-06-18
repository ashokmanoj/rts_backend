const router = require("express").Router({ caseSensitive: true });
const ctrl = require("../controllers/requestController");
const chatCtrl = require("../controllers/chatController");
const { authenticate, authorize, authorizeRequestAccess } = require("../middleware/auth");
const upload = require("../middleware/upload");

// All routes require authentication
router.use(authenticate);

// ================= REQUEST ROUTES =================

// GET all requests
router.get("/", ctrl.getAll);

// GET unique filter options
router.get("/filters", ctrl.getFilterOptions);

// GET employees by dept(s) — used when creating a request / forward
router.get("/users-by-dept", ctrl.getUsersByDept);

// GET all active departments list
router.get("/departments", ctrl.getDepartments);

// GET all active locations list
router.get("/locations", ctrl.getLocations);

// Broadcast Send — DeptHOD of HR / Food Committee / TA Committee / RTS Help Desk
router.get("/broadcast-users", ctrl.broadcastUsers);
router.post("/broadcast-send", ctrl.broadcastSend);

// ── Management Portal: HOD-pending requests & HOD-level approval ──────────
router.get("/hod-pending", authorize("Management"), ctrl.getHodPending);
router.patch("/:id/hod-approval", authorize("Management"), authorizeRequestAccess, ctrl.hodApproval);

// GET single request by ID
router.get("/:id", authorizeRequestAccess, ctrl.getById);

// CREATE request (with optional files — up to 10)
router.post("/", upload.array("files", 10), ctrl.create);

// APPROVAL flow
router.patch("/:id/approval", authorizeRequestAccess, ctrl.approval);

// Seen / Unread
router.patch("/:id/seen", authorizeRequestAccess, ctrl.markSeen);
router.patch("/:id/unread", authorizeRequestAccess, ctrl.markUnread);

// Requestor acknowledgement after close
router.patch("/:id/acknowledge", authorizeRequestAccess, ctrl.acknowledge);

// DeptHOD: stop recurring schedule
router.patch("/:id/stop-recurring", authorizeRequestAccess, ctrl.stopRecurring);

// Close request (optional file)
router.patch("/:id/close", upload.single("file"), authorizeRequestAccess, ctrl.close);

// SuperUser only: edit or delete a request
router.patch("/:id/edit",   authorize("SuperUser"), ctrl.editRequest);
router.delete("/:id",       authorize("SuperUser"), ctrl.deleteRequest);

// ================= CHAT ROUTES =================

// Get messages for request
router.get("/:id/chat", authorizeRequestAccess, chatCtrl.getMessages);

// Send message (file/voice optional)
router.post("/:id/chat", upload.single("file"), authorizeRequestAccess, chatCtrl.sendMessage);

module.exports = router;