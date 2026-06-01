"use strict";

const prisma = require("../config/database");
const { sendPushToUser, sendPushToAllFoodSubscribers } = require("../utils/pushService");
const { sendFcmToUser } = require("../utils/fcmService");
const { REMINDER_PAYLOAD } = require("../utils/foodReminder");

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

/**
 * POST /api/push/broadcast
 * Allowed: HR / Food Committee / RTS Help Desk DeptHOD + SuperUser + Management
 * Body: { title, message, targetDept }
 *   targetDept = "all"  → send to every active user
 *   targetDept = "HR"   → send only to users in that dept
 */
async function broadcastNotification(req, res, next) {
  try {
    const { title, message, targetDepts } = req.body;
    if (!title || !message) return res.status(400).json({ error: "title and message are required." });

    const ALLOWED_DEPTS = ["HR", "Food Committee", "RTS Help Desk"];
    const role = req.user.role;
    const dept = req.user.dept;

    const canBroadcast =
      role === "SuperUser" ||
      role === "Management" ||
      (role === "DeptHOD" && ALLOWED_DEPTS.includes(dept));

    if (!canBroadcast) return res.status(403).json({ error: "Not authorized to send broadcasts." });

    // targetDepts: [] or null = all users, ['HR','Software'] = specific depts
    const depts = Array.isArray(targetDepts) && targetDepts.length > 0 ? targetDepts : null;
    let where = { isActive: true };
    if (depts) where.dept = { in: depts };

    const users = await prisma.user.findMany({ where, select: { empId: true } });
    if (!users.length) return res.status(404).json({ error: "No users found for the selected departments." });

    const payload = {
      title:              title.trim(),
      body:               message.trim(),
      icon:               "/rtsLogo.png",
      badge:              "/rtsLogo.png",
      tag:                `broadcast-${Date.now()}`,
      requireInteraction: false,
      type:               "broadcast",
      url:                "/",
      data:               { action: "broadcast", channel_id: "rts_notifications" },
    };

    await Promise.allSettled(users.map(({ empId }) => sendPushToUser(empId, payload)));

    res.json({ success: true, sentTo: users.length, targetDepts: depts || "all" });
  } catch (err) {
    next(err);
  }
}

module.exports = { getVapidKey, subscribe, unsubscribe, triggerReminder, fcmRegister, fcmUnregister, fcmTest, broadcastNotification };
