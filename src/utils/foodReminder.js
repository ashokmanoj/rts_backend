"use strict";

const cron = require("node-cron");
const { sendPushToAllFoodSubscribers } = require("./pushService");

const REMINDER_PAYLOAD = {
  title:              "🍱 Food Reminder",
  body:               "Have you opted for next week's food yet? If not, please update your preference before saturday 6:30 PM.",
  icon:               "/icon-192.png",
  badge:              "/icon-192.png",
  tag:                "food-weekly-reminder",
  requireInteraction: true,
  url:  "/?tab=food",
  data: { action: "food_reminder", channel_id: "food_reminder_channel" },
};

// Saturday 4 PM IST — status check for next week
const SAT_STATUS_PAYLOAD = {
  title:              "📋 Next Week Food Status",
  body:               "Check your food status for next week — confirm or update your preference before saturday 6:30 PM.",
  icon:               "/icon-192.png",
  badge:              "/icon-192.png",
  tag:                "food-sat-status",
  requireInteraction: true,
  url:  "/?tab=food",
  data: { action: "food_reminder", channel_id: "food_reminder_channel" },
};

async function fireReminder(day, payload = REMINDER_PAYLOAD) {
  console.log(`[FoodReminder] Sending ${day} reminder...`);
  try {
    await sendPushToAllFoodSubscribers(payload);
    console.log(`[FoodReminder] ${day} reminder sent.`);
  } catch (err) {
    console.error(`[FoodReminder] ${day} reminder failed:`, err.message);
  }
}

/**
 * Weekly food reminder schedule (all times IST → UTC):
 *   Monday    5:00 PM IST  → "30 11 * * 1"
 *   Wednesday 5:00 PM IST  → "30 11 * * 3"
 *   Saturday  4:00 PM IST  → "30 10 * * 6"  ← next-week status check
 *   Saturday  5:00 PM IST  → "30 11 * * 6"  ← standard reminder
 */
function startFoodReminderCron() {
  cron.schedule("30 11 * * 1", () => fireReminder("Monday"),              { timezone: "UTC" });
  cron.schedule("30 11 * * 3", () => fireReminder("Wednesday"),           { timezone: "UTC" });
  cron.schedule("30 10 * * 6", () => fireReminder("Saturday-4PM", SAT_STATUS_PAYLOAD), { timezone: "UTC" });
  cron.schedule("30 11 * * 6", () => fireReminder("Saturday-5PM"),        { timezone: "UTC" });

  console.log("✅ Food reminders scheduled — Mon / Wed at 5 PM IST | Sat at 4 PM & 5 PM IST");
}

module.exports = { startFoodReminderCron, REMINDER_PAYLOAD, SAT_STATUS_PAYLOAD };
