/**
 * src/services/foodService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Food Subscription.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma = require("../config/database");

function foodLockError() {
  const err = new Error("Food changes are locked from Saturday 6:30 PM until Monday.");
  err.status = 400;
  return err;
}

const {
  getNextWeekStart: getNextMonday,
  getNextNextWeekStart,
  getWeekStart: getMondayOfCurrentWeek,
  toDateString,
  isSecondOrFourthSaturday,
} = require("../utils/workingDays");

class FoodService {

  // ── Opt-in / subscribe ────────────────────────────────────────────────────
  // Subscription always starts from NEXT Monday — current week is never affected.
  async subscribe(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const now = getNowIST();
    // Always start from next Monday, regardless of which day the user opts in
    const startDate = getNextMonday(now);

    const existing = await prisma.foodSubscription.findUnique({ where: { empId } });
    if (existing) {
      return prisma.foodSubscription.update({
        where: { empId },
        data: { isActive: true, suspendedFrom: null, startDate },
      });
    }
    return prisma.foodSubscription.create({
      data: { empId, isActive: true, startDate },
    });
  }

  // ── Get status ────────────────────────────────────────────────────────────
  async getStatus(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    const sub = await prisma.foodSubscription.findUnique({
      where: { empId },
      include: { user: true },
    });

    if (!sub) return { subscribed: false, isActive: false, isCancelledNextWeek: false };

    const now          = getNowIST();
    const nextMonday   = getNextMonday(now);
    const weekAfterNext = getNextNextWeekStart(now);

    const cancellation = await prisma.foodCancellation.findUnique({
      where: { empId_weekStartDate: { empId, weekStartDate: nextMonday } },
    });

    const nextWeekDateStr   = toDateString(nextMonday);
    const weekAfterNextStr  = toDateString(weekAfterNext);
    const suspDateStr       = sub.suspendedFrom ? toDateString(new Date(sub.suspendedFrom)) : null;
    const isSuspended       = !!sub.suspendedFrom;

    // suspended starting exactly from next Monday (bulk "cancel year" action)
    const isBulkSuspendedNextWeek = isSuspended && suspDateStr === nextWeekDateStr;
    // suspended starting from week-after-next (result of "enable next week only")
    const isEnabledNextWeekOnly   = isSuspended && suspDateStr === weekAfterNextStr;

    const nextWeekSuspended = !!cancellation || (isSuspended && suspDateStr <= nextWeekDateStr);

    return {
      subscribed:              true,
      isActive:                sub.isActive,
      isCancelledNextWeek:     !!cancellation,
      nextWeekSuspended,
      isBulkSuspendedNextWeek,
      isEnabledNextWeekOnly,
      suspendedFrom:           sub.suspendedFrom,
      canCancelNow:            canCancelNow(),
      subscription: {
        optedInAt: sub.createdAt,
        startDate: sub.startDate || sub.createdAt,
      },
    };
  }

  // ── Button 1: Cancel next week only (single-week FoodCancellation) ────────
  async cancelNextWeek(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodCancellation.upsert({
      where:  { empId_weekStartDate: { empId, weekStartDate: nextMonday } },
      create: { empId, weekStartDate: nextMonday },
      update: {},
    });
  }

  async undoCancelNextWeek(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodCancellation.deleteMany({
      where: { empId, weekStartDate: nextMonday },
    });
  }

  // ── Button 2: Cancel this year — suspend from next Monday onwards ─────────
  async bulkDisableFromNextWeek(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodSubscription.update({
      where: { empId },
      data:  { suspendedFrom: nextMonday },
    });
  }

  async undoBulkDisable(empId) {
    const { canCancelNow } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    return prisma.foodSubscription.update({
      where: { empId },
      data:  { suspendedFrom: null },
    });
  }

  // ── Button 3: Enable next week only (when year is suspended) ─────────────
  async enableNextWeekOnly(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    const nextMonday    = getNextMonday(getNowIST());
    const weekAfterNext = getNextNextWeekStart(getNowIST());

    await prisma.$transaction([
      prisma.foodSubscription.update({
        where: { empId },
        data:  { isActive: true, suspendedFrom: weekAfterNext },
      }),
      prisma.foodCancellation.deleteMany({
        where: { empId, weekStartDate: nextMonday },
      }),
    ]);
  }

  // Undo "enable next week only" — restore suspension back to next Monday
  async undoEnableNextWeek(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    const nextMonday = getNextMonday(getNowIST());
    await prisma.$transaction([
      prisma.foodSubscription.update({
        where: { empId },
        data:  { suspendedFrom: nextMonday },
      }),
      prisma.foodCancellation.deleteMany({
        where: { empId, weekStartDate: nextMonday },
      }),
    ]);
  }

  // ── Button 4: Enable / disable entire year ────────────────────────────────
  async enableYear(empId) {
    const { canCancelNow } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    return prisma.foodSubscription.upsert({
      where:  { empId },
      update: { isActive: true, suspendedFrom: null },
      create: { empId, isActive: true },
    });
  }

  async disableYear(empId) {
    const { canCancelNow } = require("../utils/workingDays");
    if (!canCancelNow()) throw foodLockError();
    return prisma.foodSubscription.upsert({
      where:  { empId },
      update: { isActive: false },
      create: { empId, isActive: false },
    });
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  async getCalendar(empId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0);

    const sub = await prisma.foodSubscription.findUnique({ where: { empId } });

    // Expand the lookup start by 6 days so weeks whose Monday falls in the
    // previous month are still caught (a week spans at most 6 days across a boundary).
    const weekQueryStart = new Date(startDate);
    weekQueryStart.setDate(weekQueryStart.getDate() - 6);

    // Extend to show the full last week of the month (billing clarity).
    // If the month ends on e.g. Tuesday, we show Wed–Sun of the next month too
    // because those days are billed to THIS month (week's Monday is in this month).
    const lastDow     = endDate.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const extraDays   = lastDow === 0 ? 0 : 7 - lastDow;
    const displayEnd  = new Date(endDate);
    displayEnd.setDate(displayEnd.getDate() + extraDays);

    const cancellations = await prisma.foodCancellation.findMany({
      where: { empId, weekStartDate: { gte: weekQueryStart, lte: displayEnd } },
    });
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: displayEnd } },
    });

    // Manual entries — expanded range covers cross-month weeks in both directions
    let manualEntries = [];
    if (prisma.foodManualEntry) {
      try {
        manualEntries = await prisma.foodManualEntry.findMany({
          where: { empId, weekStartDate: { gte: weekQueryStart, lte: displayEnd } },
        });
      } catch { /* table not yet migrated */ }
    }
    const manualWeeks = new Set(manualEntries.map(e => toDateString(new Date(e.weekStartDate))));

    const days           = [];
    const curr           = new Date(startDate);
    const suspDateStr    = sub?.suspendedFrom ? toDateString(new Date(sub.suspendedFrom)) : null;
    const subStartStr    = sub?.startDate     ? toDateString(new Date(sub.startDate))     : null;
    const monthStartStr  = toDateString(startDate);

    while (curr <= displayEnd) {
      const dateStr      = toDateString(curr);
      const dayOfWeek    = curr.getDay();
      const weekStartStr = toDateString(getMondayOfCurrentWeek(curr));

      // Days from the next calendar month whose Monday is still in THIS month
      // → they're billed to this month, shown with "next-week" style.
      const isNextMonthDay  = curr > endDate;
      // Days at the start of this month whose Monday was in the PREVIOUS month
      // → billed to the previous month, shown with "other-week" style.
      const isPrevMonthWeek = weekStartStr < monthStartStr;

      let type = "working";
      let name = null;

      const holiday = holidays.find(h => toDateString(new Date(h.date)) === dateStr);
      if (holiday) {
        type = "holiday";
        name = holiday.name;
      } else if (dayOfWeek === 0) {
        type = "weekend";
        name = "Sunday";
      } else if (dayOfWeek === 6) {
        type = isSecondOrFourthSaturday(curr) ? "weekend" : "working-saturday";
        if (type === "weekend") name = "2nd/4th Saturday";
      }

      if (type === "working" || type === "working-saturday") {
        if (subStartStr && weekStartStr < subStartStr) {
          type = manualWeeks.has(weekStartStr) ? "manual" : "inactive";
        } else {
          const isCancelled = cancellations.some(
            c => toDateString(new Date(c.weekStartDate)) === weekStartStr
          );
          if (isCancelled) {
            type = "cancelled";
          } else if (!sub?.isActive || (suspDateStr && dateStr >= suspDateStr)) {
            type = manualWeeks.has(weekStartStr) ? "manual" : "inactive";
          } else if (isPrevMonthWeek) {
            type = "other-week";
          } else if (isNextMonthDay) {
            type = "next-week";
          }
        }
      }

      days.push({ date: dateStr, type, name });
      curr.setDate(curr.getDate() + 1);
    }

    // Count working days for THIS month: regular + next-week overflow (both billed here)
    // "other-week" days are excluded (billed to previous month)
    const workingDaysCount = days.filter(
      d => d.type === "working" || d.type === "working-saturday" || d.type === "next-week"
    ).length;

    // Only count the amount for manual entries whose week STARTS in this month.
    // Cross-month weeks (weekStart in prev month) show green days here but their
    // amount belongs to that previous month's calendar — don't double-count.
    const thisMonthManualEntries = manualEntries.filter(
      e => new Date(e.weekStartDate) >= startDate
    );
    const manualAmount = thisMonthManualEntries.reduce((sum, e) => sum + e.amount, 0);

    return {
      isActive:      sub?.isActive || false,
      subscribed:    !!sub || manualEntries.length > 0,
      suspendedFrom: sub?.suspendedFrom,
      workingDays:   workingDaysCount,
      totalAmount:   workingDaysCount * 30 + manualAmount,
      hasManual:     thisMonthManualEntries.length > 0,
      days,
    };
  }

  // ── Report ────────────────────────────────────────────────────────────────
  async getReport(deptFilter, query) {
    const { type, month, year, weekStart } = query;
    const holidays = await prisma.holiday.findMany();

    let startDate, endDate, periodName;

    if (type === "week" && weekStart) {
      startDate  = getMondayOfCurrentWeek(new Date(weekStart));
      endDate    = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      periodName = `Week of ${toDateString(startDate)}`;
    } else {
      const m = parseInt(month) || (new Date().getMonth() + 1);
      const y = parseInt(year)  || new Date().getFullYear();
      startDate  = new Date(y, m - 1, 1);
      endDate    = new Date(y, m, 0);
      periodName = startDate.toLocaleString("default", { month: "long", year: "numeric" });
    }

    const users = await prisma.user.findMany({
      where: deptFilter ? { dept: deptFilter } : {},
      include: { foodSubscription: true, foodCancellations: true },
    });

    const { calculateWorkingDays } = require("../utils/workingDays");

    const reportData = users
      .map(u => {
        if (!u.foodSubscription?.isActive && !u.foodCancellations.length) return null;

        const workingDays = calculateWorkingDays(
          startDate,
          endDate,
          holidays,
          u.foodCancellations.map(c => c.weekStartDate),
          u.foodSubscription?.suspendedFrom,
          u.foodSubscription?.startDate   // respect subscription start date
        );

        if (workingDays === 0) return null;

        return {
          name:        u.name,
          empId:       u.empId,
          dept:        u.dept,
          location:    u.location,
          period:      periodName,
          workingDays,
          totalAmount: workingDays * 30,
        };
      })
      .filter(Boolean);

    // Merge manual entries (guarded — safe until migration + prisma generate are run)
    if (prisma.foodManualEntry) {
      try {
        const manualEntries = await prisma.foodManualEntry.findMany({
          where: {
            weekStartDate: { gte: startDate, lte: endDate },
            ...(deptFilter ? { user: { dept: deptFilter } } : {}),
          },
          include: { user: true },
        });

        for (const entry of manualEntries) {
          const idx = reportData.findIndex(r => r.empId === entry.empId);
          if (idx >= 0) {
            reportData[idx].totalAmount += entry.amount;
            reportData[idx].hasManual   = true;
          } else {
            reportData.push({
              name:        entry.user.name,
              empId:       entry.empId,
              dept:        entry.user.dept,
              location:    entry.user.location,
              period:      periodName,
              workingDays: null,
              totalAmount: entry.amount,
              isManual:    true,
            });
          }
        }
      } catch { /* table not yet created — run SQL migration */ }
    }

    return { period: periodName, data: reportData };
  }

  // ── Manual entry — add user to food for a specific week ──────────────────

  async addManualEntry(adder, { empId, weekDate, amount, note }) {
    const user = await prisma.user.findUnique({ where: { empId } });
    if (!user) throw Object.assign(new Error("User not found."), { status: 404 });

    const d    = new Date(weekDate);
    d.setHours(0, 0, 0, 0);
    const day  = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    if (!prisma.foodManualEntry) throw Object.assign(new Error("Manual entry not available — run SQL migration and npx prisma generate."), { status: 503 });

    await prisma.foodManualEntry.upsert({
      where:  { empId_weekStartDate: { empId, weekStartDate: monday } },
      update: { amount: parseFloat(amount), note: note || null, addedByEmpId: adder.empId, addedByName: adder.name },
      create: { empId, weekStartDate: monday, amount: parseFloat(amount), note: note || null, addedByEmpId: adder.empId, addedByName: adder.name },
    });

    return { success: true, weekStart: toDateString(monday), userName: user.name };
  }

  async getUsers() {
    return prisma.user.findMany({
      where:   { isActive: true },
      select:  { empId: true, name: true, dept: true },
      orderBy: { name: "asc" },
    });
  }

  // ── SuperUser admin CRUD ──────────────────────────────────────────────────

  async getAllSubscriptions() {
    const subs = await prisma.foodSubscription.findMany({
      include: { user: { select: { name: true, dept: true, designation: true } } },
      orderBy: { createdAt: "desc" },
    });
    return subs.map(s => ({
      empId:         s.empId,
      name:          s.user?.name        || s.empId,
      dept:          s.user?.dept        || "—",
      designation:   s.user?.designation || "—",
      isActive:      s.isActive,
      startDate:     s.startDate     ? new Date(s.startDate).toLocaleDateString("en-IN")     : "—",
      suspendedFrom: s.suspendedFrom ? new Date(s.suspendedFrom).toLocaleDateString("en-IN") : null,
      createdAt:     new Date(s.createdAt).toLocaleDateString("en-IN"),
    }));
  }

  async adminSubscribe(empId, period = "permanent", periodDate = null) {
    const user = await prisma.user.findUnique({ where: { empId } });
    if (!user) throw new Error("User not found.");

    const { getNowIST } = require("../utils/workingDays");
    const now          = getNowIST();
    const defaultStart = getNextMonday(now);

    let startDate    = defaultStart;
    let suspendedFrom = null;

    if (period === "weekly" && periodDate) {
      const d   = new Date(periodDate);
      d.setHours(0, 0, 0, 0);
      const day  = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      const nextMon = new Date(monday);
      nextMon.setDate(monday.getDate() + 7);
      startDate    = monday >= now ? monday : defaultStart;
      suspendedFrom = nextMon;
    } else if (period === "monthly" && periodDate) {
      const [y, m]    = periodDate.split("-").map(Number);
      const first     = new Date(y, m - 1, 1);
      const offset    = (8 - first.getDay()) % 7;
      const firstMon  = new Date(y, m - 1, 1 + offset);
      const nxtFirst  = new Date(y, m, 1);
      const nxtOffset = (8 - nxtFirst.getDay()) % 7;
      const nxtMon    = new Date(y, m, 1 + nxtOffset);
      startDate    = firstMon >= now ? firstMon : defaultStart;
      suspendedFrom = nxtMon;
    }

    const existing = await prisma.foodSubscription.findUnique({ where: { empId } });
    if (existing) {
      return prisma.foodSubscription.update({
        where: { empId },
        data: { isActive: true, startDate, suspendedFrom },
      });
    }
    return prisma.foodSubscription.create({
      data: { empId, isActive: true, startDate, suspendedFrom },
    });
  }

  async adminToggle(empId, isActive) {
    return prisma.foodSubscription.update({ where: { empId }, data: { isActive } });
  }

  async adminDelete(empId) {
    await prisma.$transaction([
      prisma.foodCancellation.deleteMany({ where: { empId } }),
      prisma.foodSubscription.delete({ where: { empId } }),
    ]);
    return { success: true };
  }
}

module.exports = new FoodService();
