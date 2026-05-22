"use strict";

const admin  = require("../config/firebase");
const prisma = require("../config/database");

/**
 * Send an FCM push notification to all registered devices of a user.
 * Invalid / expired tokens are automatically removed from the database.
 */
async function sendFcmToUser(empId, payload) {
  const rows = await prisma.fcmToken.findMany({ where: { empId } });
  if (!rows.length) return;

  const invalidTokens = [];

  await Promise.allSettled(
    rows.map(async ({ token }) => {
      try {
        await admin.messaging().send({
          token,
          notification: {
            title: payload.title,
            body:  payload.body,
          },
          data: {
            url:  payload.url  || "/",
            type: payload.type || "general",
            tag:  payload.tag  || "",
          },
          android: {
            notification: {
              sound:     "default",
              channelId: "rts_notifications",
            },
          },
          apns: {
            payload: { aps: { sound: "default" } },
          },
        });
      } catch (err) {
        const code = err?.errorInfo?.code || "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(token);
        }
      }
    })
  );

  if (invalidTokens.length) {
    await prisma.fcmToken.deleteMany({ where: { token: { in: invalidTokens } } });
  }
}

module.exports = { sendFcmToUser };
