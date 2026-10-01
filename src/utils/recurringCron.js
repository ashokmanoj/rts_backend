"use strict";

const cron   = require("node-cron");
const prisma = require("../config/database");
const { computeNextRecurringDate } = require("../services/request/helpers");
const { sendNewRequestNotification } = require("./pushService");

let recurringJobRunning = false;

async function runRecurringJob() {
  if (recurringJobRunning) {
    console.log("🔁 Recurring cron: skipped — previous run still in progress.");
    return;
  }
  recurringJobRunning = true;
  try {
    await _runRecurringJob();
  } finally {
    recurringJobRunning = false;
  }
}

async function _runRecurringJob() {
  const now = new Date();

  // Find closed recurring tickets whose nextRecurringDate has passed — time to reopen them
  const due = await prisma.request.findMany({
    where: {
      isRecurring:       true,
      isClosed:          true,
      nextRecurringDate: { lte: now },
    },
    include: { owner: true },
  });

  if (!due.length) return;
  console.log(`🔁 Recurring cron: ${due.length} ticket(s) due for auto-reopen`);

  for (const r of due) {
    try {
      const reopenedAt = new Date();

      // Reset all approval fields and reopen the same ticket
      await prisma.request.update({
        where: { id: r.id },
        data: {
          isClosed:          false,
          assignedStatus:    "Open",
          acknowledgement:   null,
          acknowledgedAt:    null,
          resolvedDate:      null,
          resolvedBy:        null,
          reopenedAt:        reopenedAt,
          nextRecurringDate: null,        // cleared — will be set again on next acknowledgement
          rmStatus:          "--",
          rmDate:            null,
          hodStatus:         "--",
          hodDate:           null,
          deptHodStatus:     "--",
          deptHodDate:       null,
          assignedRmStatus:  "--",
          assignedRmDate:    null,
          assignedHodStatus: "--",
          assignedHodDate:   null,
          managementStatus:  "--",
          managementDate:    null,
          checkingBy:        null,
          checkingDeadline:  null,
          checkingReason:    null,
        },
      });

      // Remove old close ticket data
      await prisma.closeTicket.deleteMany({ where: { requestId: r.id } });

      // Clear read receipts so it appears unread / at the top for all approvers
      await prisma.requestRead.deleteMany({ where: { requestId: r.id } });
      // Restore a read receipt for the requestor so they don't see it as new-to-them
      await prisma.requestRead.create({ data: { requestId: r.id, empId: r.empId } });

      // Add a system chat message
      await prisma.chatMessage.create({
        data: {
          requestId: r.id,
          authorId:  r.empId,
          author:    "System",
          role:      "System",
          type:      "system",
          text:      `🔁 Recurring ticket auto-reopened on ${reopenedAt.toLocaleDateString("en-IN")}. Approval cycle restarted.`,
        },
      });

      // Re-fetch with owner to send notification
      const reopened = await prisma.request.findUnique({ where: { id: r.id }, include: { owner: true } });
      sendNewRequestNotification(reopened).catch(() => {});

      console.log(`  ✅ Auto-reopened #${r.id} (recurring ${r.recurringInterval})`);
    } catch (err) {
      console.error(`  ❌ Failed to reopen recurring ticket #${r.id}:`, err.message);
    }
  }
}

function startRecurringCron() {
  // Run every day at 00:05 AM
  cron.schedule("5 0 * * *", () => {
    runRecurringJob().catch(err => console.error("Recurring cron error:", err.message));
  });
  console.log("🔁 Recurring request cron started (daily at 00:05)");
}

module.exports = { startRecurringCron };
