"use strict";

const router = require("express").Router({ caseSensitive: true });
const { authenticate, authorizeHODReport } = require("../middleware/auth");
const { getVapidKey, subscribe, unsubscribe, triggerReminder, fcmRegister, fcmUnregister, fcmTest, broadcastNotification } = require("../controllers/pushController");

router.get("/vapid-public-key",   getVapidKey);
router.post("/subscribe",         authenticate, subscribe);
router.post("/unsubscribe",       authenticate, unsubscribe);
router.post("/trigger-reminder",  authenticate, authorizeHODReport, triggerReminder);
router.post("/fcm-register",      authenticate, fcmRegister);
router.post("/fcm-unregister",    fcmUnregister);           // no auth — token is globally unique
router.post("/fcm-test",          authenticate, fcmTest);
router.post("/broadcast",         authenticate, broadcastNotification);
// Flutter-style aliases (slash separator instead of hyphen)
router.post("/fcm/register",      authenticate, fcmRegister);
router.post("/fcm/unregister",    fcmUnregister);           // no auth — token is globally unique
router.post("/fcm/test",          authenticate, fcmTest);

module.exports = router;
