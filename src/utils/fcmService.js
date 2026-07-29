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
  const channelId = payload.data?.channel_id || "rts_notifications";

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
            url:        payload.url                     || "/",
            type:       payload.type                    || "general",
            tag:        payload.tag                     || "",
            action:     payload.data?.action            || "general",
            channel_id: channelId,
            request_id: String(payload.data?.requestId || ""),
            deepLink:   payload.data?.requestId
                          ? `${process.env.FRONTEND_URL || ""}/?openRequest=${payload.data.requestId}`
                          : (process.env.FRONTEND_URL || "/"),
          },
          android: {
            priority: "high",
            notification: {
              sound:     "default",
              channelId,
              sticky:    true,
            },
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
        });
      } catch (err) {
        const code = err?.errorInfo?.code || "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(token);
        } else {
          // Log unexpected FCM errors so they appear in server logs
          console.error(`[FCM] Failed to send to ${empId} (${code || err.message})`);
        }
      }
    })
  );

  if (invalidTokens.length) {
    await prisma.fcmToken.deleteMany({ where: { token: { in: invalidTokens } } });
  }
}

module.exports = { sendFcmToUser };
