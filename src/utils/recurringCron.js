"use strict";

const cron   = require("node-cron");
const prisma = require("../config/database");
const { sendNewRequestNotification } = require("./pushService");

function computeNextRecurringDate(interval) {
  const d = new Date();
  switch (interval) {
    case "1m":  d.setMonth(d.getMonth() + 1);       break;
    case "4m":  d.setMonth(d.getMonth() + 4);       break;
    case "6m":  d.setMonth(d.getMonth() + 6);       break;
    case "1y":  d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

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

  const due = await prisma.request.findMany({
    where: {
      isRecurring:        true,
      isClosed:           false,
      nextRecurringDate:  { lte: now },
    },
    include: { owner: true },
  });

  if (!due.length) return;
  console.log(`🔁 Recurring cron: ${due.length} request(s) due`);

  for (const r of due) {
    try {
      const next = computeNextRecurringDate(r.recurringInterval);

      // Create a fresh child request (not itself recurring — the parent drives the schedule)
      const child = await prisma.request.create({
        data: {
          empId:               r.empId,
          purpose:             r.purpose,
          description:         r.description,
          dept:                r.dept,
          assignedDept:        r.assignedDept,
          assignedDepts:       r.assignedDepts,
          requestorRole:       r.requestorRole,
          fileUrl:             r.fileUrl,
          fileName:            r.fileName,
          fileUrls:            r.fileUrls,
          fileNames:           r.fileNames,
          assignedPersonEmpId: r.assignedPersonEmpId,
          assignedPersonName:  r.assignedPersonName,
          recurringParentId:   r.recurringParentId ?? r.id,
          readReceipts:        { create: { empId: r.empId } },
        },
        include: { owner: true },
      });

      // Push the parent's next trigger date forward
      await prisma.request.update({
        where: { id: r.id },
        data:  { nextRecurringDate: next },
      });

      // Notify RM/HOD/DeptHOD for the new child request (non-blocking)
      sendNewRequestNotification(child).catch(() => {});

      console.log(`  ✅ Created child #${child.id} from parent #${r.id} — next: ${next?.toISOString()}`);
    } catch (err) {
      console.error(`  ❌ Failed to recur request #${r.id}:`, err.message);
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
