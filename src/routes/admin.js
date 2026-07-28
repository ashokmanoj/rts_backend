const router = require("express").Router({ caseSensitive: true });
const { getUserLogReport, createUser, bulkCreateUsers, toggleUserStatus, getDeptTrackingReport, updateUser, resetPassword, getUserRoles, addUserRole, updateUserRole, toggleUserRole, deleteUserRole, getDepartments, createDepartment, updateDepartment, deleteDepartment, getLocations, createLocation, updateLocation, deleteLocation } = require("../controllers/adminController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// GET /api/admin/user-log-report
router.get("/user-log-report", getUserLogReport);

// GET /api/admin/dept-tracking-report
router.get("/dept-tracking-report", getDeptTrackingReport);

// POST /api/admin/create-user
router.post("/create-user", createUser);

// POST /api/admin/bulk-create-users
router.post("/bulk-create-users", bulkCreateUsers);

// PATCH /api/admin/toggle-status/:empId
router.patch("/toggle-status/:empId", toggleUserStatus);

// PATCH /api/admin/update-user/:empId
router.patch("/update-user/:empId", updateUser);

// PATCH /api/admin/reset-password/:empId  (SuperUser only)
router.patch("/reset-password/:empId", resetPassword);

// User Roles CRUD (SuperUser + HR DeptHOD)
router.get("/user-roles",               getUserRoles);
router.post("/user-roles",              addUserRole);
router.patch("/user-roles/:id",         updateUserRole);
router.patch("/user-roles/:id/toggle",  toggleUserRole);
router.delete("/user-roles/:id",        deleteUserRole);

// Department CRUD (SuperUser / Admin / Management / HR DeptHOD)
router.get("/departments",        getDepartments);
router.post("/departments",       createDepartment);
router.patch("/departments/:id",  updateDepartment);
router.delete("/departments/:id", deleteDepartment);

// Location CRUD (SuperUser / Admin / Management / HR DeptHOD)
router.get("/locations",        getLocations);
router.post("/locations",       createLocation);
router.patch("/locations/:id",  updateLocation);
router.delete("/locations/:id", deleteLocation);

module.exports = router;
