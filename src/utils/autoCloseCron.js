"use strict";

/**
 * Auto-Close Cron
 * ───────────────
 * Runs every hour. Finds tickets stuck in "Pending Acknowledgement" and
 * automatically closes them based on dept-specific thresholds:
 *   - RTS Help Desk: 5 days
 *   - All other depts: 3 days
 */

const cron   = require("node-cron");
const prisma = require("../config/database");
const { sendPushToUser } = require("./pushService");

const AUTO_CLOSE_DAYS         = 3;
const RTS_HELPDESK_CLOSE_DAYS = 5;
const RTS_HELPDESK_DEPT       = "RTS Help Desk";

async function closeStaleTickets(tickets, days) {
  for (const req of tickets) {
    try {
      const now     = new Date();
      const dateStr = now.toLocaleDateString("en-IN");

      await prisma.$transaction([
        prisma.request.update({
          where: { id: req.id },
          data: {
            acknowledgement: "Resolved",
            acknowledgedAt:  now,
            isClosed:        true,
            assignedStatus:  `${dateStr} (Closed)`,
          },
        }),

        prisma.chatMessage.create({
          data: {
            requestId: req.id,
            authorId:  null,
            author:    "System",
            role:      "System",
            type:      "system",
            text:      `🤖 This ticket was automatically closed by the system because no response was received within ${days} days of the resolution being submitted. The ticket has been marked as resolved.`,
          },
        }),

        prisma.requestRead.deleteMany({ where: { requestId: req.id } }),
      ]);

      sendPushToUser(req.empId, {
        title: `Ticket #${req.id} Auto-Closed`,
        body:  `Your ticket "${req.purpose}" was automatically closed because no acknowledgement was received within ${days} days. It has been marked as resolved.`,
        data:  { requestId: req.id },
      }).catch(() => {});

      console.log(`  ✅ Auto-closed ticket #${req.id} (requestor: ${req.empId})`);
    } catch (err) {
      console.error(`  ❌ Failed to auto-close ticket #${req.id}:`, err.message);
    }
  }
}

let autoCloseJobRunning = false;

async function runAutoCloseJob() {
  if (autoCloseJobRunning) {
    console.log("🤖 Auto-close cron: skipped — previous run still in progress.");
    return;
  }
  autoCloseJobRunning = true;
  try {
    await _runAutoCloseJob();
  } finally {
    autoCloseJobRunning = false;
  }
}

async function _runAutoCloseJob() {
  const cutoff3 = new Date(Date.now() - AUTO_CLOSE_DAYS         * 24 * 60 * 60 * 1000);
  const cutoff5 = new Date(Date.now() - RTS_HELPDESK_CLOSE_DAYS * 24 * 60 * 60 * 1000);

  // All depts except RTS Help Desk — 3-day threshold
  const stale = await prisma.request.findMany({
    where: {
      assignedStatus: "Pending Acknowledgement",
      isClosed:       false,
      resolvedDate:   { lte: cutoff3 },
      assignedDept:   { not: RTS_HELPDESK_DEPT },
    },
    include: { owner: true },
  });

  // RTS Help Desk only — 5-day threshold
  const staleHelpdesk = await prisma.request.findMany({
    where: {
      assignedStatus: "Pending Acknowledgement",
      isClosed:       false,
      resolvedDate:   { lte: cutoff5 },
      assignedDept:   RTS_HELPDESK_DEPT,
    },
    include: { owner: true },
  });

  const total = stale.length + staleHelpdesk.length;
  if (!total) return;

  console.log(`🤖 Auto-close cron: ${stale.length} ticket(s) at 3-day threshold, ${staleHelpdesk.length} at 5-day threshold`);

  await closeStaleTickets(stale,         AUTO_CLOSE_DAYS);
  await closeStaleTickets(staleHelpdesk, RTS_HELPDESK_CLOSE_DAYS);
}

function startAutoCloseCron() {
  cron.schedule("0 * * * *", () => {
    runAutoCloseJob().catch(err => console.error("Auto-close cron error:", err.message));
  });
  console.log(`🤖 Auto-close cron started (hourly) — ${AUTO_CLOSE_DAYS}-day default, ${RTS_HELPDESK_CLOSE_DAYS}-day for ${RTS_HELPDESK_DEPT}`);
}

module.exports = { startAutoCloseCron };
