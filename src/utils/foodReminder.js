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
 *   Friday 5:00 PM IST → "30 11 * * 5"
 */
function startFoodReminderCron() {
  cron.schedule("30 11 * * 5", () => fireReminder("Friday"), { timezone: "UTC" });

  console.log("✅ Food reminder scheduled — Friday at 5 PM IST");
}

module.exports = { startFoodReminderCron, REMINDER_PAYLOAD };
