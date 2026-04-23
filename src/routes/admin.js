const router = require("express").Router({ caseSensitive: true });
const { getUserLogReport, createUser, toggleUserStatus, getDeptTrackingReport, updateUser } = require("../controllers/adminController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// GET /api/admin/user-log-report
router.get("/user-log-report", getUserLogReport);

// GET /api/admin/dept-tracking-report
router.get("/dept-tracking-report", getDeptTrackingReport);

// POST /api/admin/create-user
router.post("/create-user", createUser);

// PATCH /api/admin/toggle-status/:empId
router.patch("/toggle-status/:empId", toggleUserStatus);

// PATCH /api/admin/update-user/:empId
router.patch("/update-user/:empId", updateUser);

module.exports = router;
