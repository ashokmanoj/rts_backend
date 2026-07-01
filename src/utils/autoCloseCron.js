"use strict";

/**
 * Auto-Close Cron
 * ───────────────
 * Runs every hour. Finds tickets stuck in "Pending Acknowledgement" for more
 * than 3 days and automatically closes them, posting a system chat message
 * and sending a push notification to the requestor.
 */

const cron   = require("node-cron");
const prisma = require("../config/database");
const { sendPushToUser } = require("./pushService");

const AUTO_CLOSE_DAYS = 3;

async function runAutoCloseJob() {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000);

  const stale = await prisma.request.findMany({
    where: {
      assignedStatus: "Pending Acknowledgement",
      isClosed:       false,
      resolvedDate:   { lte: cutoff },
      assignedDept:   { not: "RTS Help Desk" },
    },
    include: { owner: true },
  });

  if (!stale.length) return;
  console.log(`🤖 Auto-close cron: ${stale.length} ticket(s) pending acknowledgement for 3+ days`);

  for (const req of stale) {
    try {
      const now     = new Date();
      const dateStr = now.toLocaleDateString("en-IN");

      await prisma.$transaction([
        // Close the ticket — same fields as manual "Resolved" acknowledgement
        prisma.request.update({
          where: { id: req.id },
          data: {
            acknowledgement: "Resolved",
            acknowledgedAt:  now,
            isClosed:        true,
            assignedStatus:  `${dateStr} (Closed)`,
          },
        }),

        // System message visible in the ticket chat
        prisma.chatMessage.create({
          data: {
            requestId: req.id,
            authorId:  null,
            author:    "System",
            role:      "System",
            type:      "system",
            text:
              `🤖 This ticket was automatically closed by the system because no response was received within ${AUTO_CLOSE_DAYS} days of the resolution being submitted. The ticket has been marked as resolved.`,
          },
        }),

        // Reset read receipts so the requestor sees the auto-close as unread
        prisma.requestRead.deleteMany({ where: { requestId: req.id } }),
      ]);

      // Push notification to the original requestor (non-blocking)
      sendPushToUser(req.empId, {
        title: `Ticket #${req.id} Auto-Closed`,
        body:  `Your ticket "${req.purpose}" was automatically closed because no acknowledgement was received within ${AUTO_CLOSE_DAYS} days. It has been marked as resolved.`,
        data:  { requestId: req.id },
      }).catch(() => {});

      console.log(`  ✅ Auto-closed ticket #${req.id} (requestor: ${req.empId})`);
    } catch (err) {
      console.error(`  ❌ Failed to auto-close ticket #${req.id}:`, err.message);
    }
  }
}

function startAutoCloseCron() {
  // Run every hour at minute 0
  cron.schedule("0 * * * *", () => {
    runAutoCloseJob().catch(err => console.error("Auto-close cron error:", err.message));
  });
  console.log(`🤖 Auto-close cron started (hourly) — closes tickets unacknowledged for ${AUTO_CLOSE_DAYS}+ days`);
}

module.exports = { startAutoCloseCron };
