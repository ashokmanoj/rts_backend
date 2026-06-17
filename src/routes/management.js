const router = require("express").Router({ caseSensitive: true });
const ctrl   = require("../controllers/managementController");
const { authenticate, authorize, authorizeRequestAccess } = require("../middleware/auth");

// All routes require a valid session + Management role
router.use(authenticate);
router.use(authorize("Management"));

// GET  /api/management/filter-options
//      Returns distinct names, requestor depts, assigned depts, date range, and statuses
router.get("/filter-options", ctrl.getFilterOptions);

// GET  /api/management/requests
//      ?search=&hodStatus=pending&rmStatus=approved&dept=HR&status=open&page=1&limit=20
router.get("/requests", ctrl.listRequests);

// GET  /api/management/requests/filters  (alias — must be before /:id)
router.get("/requests/filters", ctrl.getFilterOptions);

// GET  /api/management/requests/:id
router.get("/requests/:id", authorizeRequestAccess, ctrl.getRequest);

// PATCH /api/management/requests/:id/approval
//       body: { decision: "Approved" | "Rejected" | "Checking" | "Close", comment: "" }
router.patch("/requests/:id/approval", authorizeRequestAccess, ctrl.takeAction);

module.exports = router;
