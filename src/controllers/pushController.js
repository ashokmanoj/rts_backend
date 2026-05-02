"use strict";

const prisma = require("../config/database");
const { sendPushToUser, sendPushToAllFoodSubscribers } = require("../utils/pushService");

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
  url: "/?tab=food",
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

module.exports = { getVapidKey, subscribe, unsubscribe, triggerReminder };
