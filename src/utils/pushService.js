"use strict";

const webpush = require("web-push");
const prisma   = require("../config/database");

webpush.setVapidDetails(
  `mailto:${process.env.MAILER_USER || "noreply@example.com"}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send a push notification to all active subscriptions for a given empId.
 * Expired subscriptions (410) are automatically cleaned up.
 */
async function sendPushToUser(empId, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { empId } });
  if (!subs.length) return;

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}

/**
 * Send push notifications to all users with an active food subscription.
 * Used by the Sunday cron reminder.
 */
async function sendPushToAllFoodSubscribers(payload) {
  const activeSubs = await prisma.foodSubscription.findMany({
    where: { isActive: true, suspendedFrom: null },
    select: { empId: true },
  });

  await Promise.allSettled(
    activeSubs.map(({ empId }) => sendPushToUser(empId, payload))
  );
}

module.exports = { sendPushToUser, sendPushToAllFoodSubscribers };
