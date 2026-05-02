"use strict";

const router = require("express").Router({ caseSensitive: true });
const { authenticate, authorizeHODReport } = require("../middleware/auth");
const { getVapidKey, subscribe, unsubscribe, triggerReminder } = require("../controllers/pushController");

router.get("/vapid-public-key",   getVapidKey);
router.post("/subscribe",         authenticate, subscribe);
router.post("/unsubscribe",       authenticate, unsubscribe);
router.post("/trigger-reminder",  authenticate, authorizeHODReport, triggerReminder);

module.exports = router;
