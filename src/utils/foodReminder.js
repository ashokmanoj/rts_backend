"use strict";

const cron = require("node-cron");
const { sendPushToAllFoodSubscribers } = require("./pushService");

// Payload is identical on all 3 days — users decide by clicking Yes / No.
const REMINDER_PAYLOAD = {
  title:              "🍱 Food Reminder",
  body:               "Have you sorted next week's food? Tap 'Yes' if you're all set, or 'No' to update your preference now.",
  icon:               "/icon-192.png",
  badge:              "/icon-192.png",
  tag:                "food-weekly-reminder",
  requireInteraction: true,          // stays on screen until the user acts
  actions: [
    { action: "yes", title: "Yes, I'm done ✓" },
    { action: "no",  title: "No, take me there →" },
  ],
  url: "/?tab=food",
};

async function fireReminder(day) {
  console.log(`[FoodReminder] Sending ${day} 5 PM reminder...`);
  try {
    await sendPushToAllFoodSubscribers(REMINDER_PAYLOAD);
    console.log(`[FoodReminder] ${day} reminder sent.`);
  } catch (err) {
    console.error(`[FoodReminder] ${day} reminder failed:`, err.message);
  }
}

/**
 * Schedule 3 weekly reminders at 5:00 PM IST (11:30 AM UTC):
 *   Monday    → cron  "30 11 * * 1"
 *   Wednesday → cron  "30 11 * * 3"
 *   Saturday  → cron  "30 11 * * 6"
 */
function startFoodReminderCron() {
  cron.schedule("30 11 * * 1", () => fireReminder("Monday"),    { timezone: "UTC" });
  cron.schedule("30 11 * * 3", () => fireReminder("Wednesday"), { timezone: "UTC" });
  cron.schedule("30 11 * * 6", () => fireReminder("Saturday"),  { timezone: "UTC" });

  console.log("✅ Food reminders scheduled — Mon / Wed / Sat at 5:00 PM IST");
}

module.exports = { startFoodReminderCron };
