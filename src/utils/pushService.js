"use strict";

const webpush          = require("web-push");
const prisma           = require("../config/database");
const { sendFcmToUser } = require("./fcmService");

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
  const [subs] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { empId } }),
    sendFcmToUser(empId, payload), // fire FCM in parallel — mobile devices
  ]);

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
    where: { isActive: true, suspendedFrom: null, user: { location: "Bangalore" } },
    select: { empId: true },
  });

  await Promise.allSettled(
    activeSubs.map(({ empId }) => sendPushToUser(empId, payload))
  );
}

const GN_MANAGERS = ["GN-01", "GN-02"];

/**
 * Fire push notifications to all users who should see a newly-created request.
 * Runs fire-and-forget — caller should not await this.
 */
async function sendNewRequestNotification(request) {
  const owner = request.owner;
  if (!owner) return;

  const purpose = (request.purpose || "New request").substring(0, 70);
  const payload = {
    title: "📋 New Request",
    body:  `${owner.name} (${owner.dept}) — ${purpose}`,
    icon:  "/rtsLogo.png",
    badge: "/rtsLogo.png",
    tag:   `request-${request.id}`,
    renotify: true,
    requireInteraction: false,
    type:  "new_request",
    url:   `/?openRequest=${request.id}`,
    data:  { action: "new_request", requestId: request.id, channel_id: "new_request_channel" },
  };

  const recipients = new Set();

  if (owner.rmEmpId)  recipients.add(owner.rmEmpId);
  if (owner.hodEmpId) recipients.add(owner.hodEmpId);

  // DeptHOD + HOD + RM of the assigned department
  const deptTeam = await prisma.user.findMany({
    where:  { role: { in: ["DeptHOD", "HOD", "RM"] }, dept: request.assignedDept },
    select: { empId: true },
  });
  deptTeam.forEach(u => recipients.add(u.empId));

  if (request.assignedPersonEmpId) {
    request.assignedPersonEmpId.split(",").forEach(id => {
      const trimmed = id.trim();
      if (trimmed) recipients.add(trimmed);
    });
  }

  const isGnRoute = GN_MANAGERS.includes(owner.rmEmpId) || GN_MANAGERS.includes(owner.hodEmpId);
  if (isGnRoute) {
    const mgmt = await prisma.user.findMany({
      where:  { role: "Management" },
      select: { empId: true },
    });
    mgmt.forEach(u => recipients.add(u.empId));
  }

  recipients.delete(request.empId);

  await Promise.allSettled(
    [...recipients].map(empId => sendPushToUser(empId, payload))
  );
}

module.exports = { sendPushToUser, sendPushToAllFoodSubscribers, sendNewRequestNotification };
