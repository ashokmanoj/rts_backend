"use strict";

const prisma = require("../config/database");
const { sendPushToUser, sendPushToAllFoodSubscribers } = require("../utils/pushService");
const { sendFcmToUser } = require("../utils/fcmService");

const REMINDER_PAYLOAD = {
  title:              "🍱 Food Reminder",
  body:               "Have you sorted next week's food? Tap 'Yes' if you're all set, or 'No' to update your preference now.",
  icon:               "/icon-192.png",
  badge:              "/icon-192.png",
  tag:                "food-weekly-reminder",
  requireInteraction: true,
  actions: [
    { action: "yes", title: "Yes, I'm done ✓" },
    { action: "no",  title: "No, take me there →" },
  ],
  url:  "/?tab=food",
  data: { action: "food_reminder", channel_id: "food_reminder_channel" },
};

/** GET /api/push/vapid-public-key  — client needs this to subscribe */
function getVapidKey(req, res) {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}

/** POST /api/push/subscribe  — save or refresh a push subscription */
async function subscribe(req, res, next) {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription object." });
    }

    // Remove all previous subscriptions for this user so only one browser
    // receives notifications at a time (prevents duplicates across browsers).
    await prisma.pushSubscription.deleteMany({ where: { empId: req.user.empId } });
    await prisma.pushSubscription.create({
      data: { empId: req.user.empId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/push/unsubscribe  — remove a push subscription */
async function unsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required." });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, empId: req.user.empId },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/push/trigger-reminder
 * Restricted to DeptHOD of HR or Food Committee (via authorizeHODReport middleware).
 * Sends the weekly food reminder to ALL active food subscribers immediately.
 */
async function triggerReminder(req, res, next) {
  try {
    await sendPushToAllFoodSubscribers(REMINDER_PAYLOAD);
    res.json({ success: true, target: "all" });
  } catch (err) {
    next(err);
  }
}

/** POST /api/push/fcm-test  — any authenticated user can test their own device;
 *  SuperUser/Admin can also specify a different empId to test any user.        */
async function fcmTest(req, res, next) {
  try {
    const { title, body } = req.body;
    const isAdminLike = ["SuperUser", "Admin", "Management"].includes(req.user.role) ||
                        (req.user.role === "DeptHOD" && req.user.dept === "HR");

    // Non-admins can only test themselves
    let empId = req.body.empId || req.user.empId;
    if (!isAdminLike) empId = req.user.empId;

    const tokens = await prisma.fcmToken.findMany({ where: { empId } });
    if (!tokens.length) return res.status(404).json({ error: `No FCM tokens registered for ${empId}. Open the Flutter app and log in first.` });

    await sendFcmToUser(empId, {
      title: title || "🔔 Test Notification",
      body:  body  || "This is a test notification from RTS.",
      url:   "/",
      type:  "test",
      tag:   "rts-test",
    });

    res.json({ success: true, empId, tokenCount: tokens.length });
  } catch (err) {
    next(err);
  }
}

/** POST /api/push/fcm-register  — Flutter sends its FCM token after login */
async function fcmRegister(req, res, next) {
  try {
    // Accept any common field name the Flutter dev might use
    const token = req.body.token || req.body.fcmToken || req.body.fcm_token || req.body.deviceToken || req.body.device_token;
    if (!token) return res.status(400).json({ error: "token required. Send as: { \"token\": \"<fcm_token>\" }" });

    await prisma.fcmToken.upsert({
      where:  { token },
      update: { empId: req.user.empId },
      create: { empId: req.user.empId, token },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/push/fcm-unregister  — Flutter calls this on logout (no auth needed — token is unique) */
async function fcmUnregister(req, res, next) {
  try {
    const token = req.body.token || req.body.fcmToken || req.body.fcm_token || req.body.deviceToken || req.body.device_token;
    if (!token) return res.status(400).json({ error: "token required." });

    await prisma.fcmToken.deleteMany({ where: { token } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getVapidKey, subscribe, unsubscribe, triggerReminder, fcmRegister, fcmUnregister, fcmTest };
