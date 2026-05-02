/**
 * src/services/foodService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic for Food Subscription.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma = require("../config/database");
const {
  getNextWeekStart: getNextMonday,
  getNextNextWeekStart,
  getWeekStart: getMondayOfCurrentWeek,
  toDateString,
  isSecondOrFourthSaturday,
} = require("../utils/workingDays");

class FoodService {

  // ── Opt-in / subscribe ────────────────────────────────────────────────────
  // Subscription always starts from next Monday so the current week's food
  // order is not affected by a mid-week opt-in.
  async subscribe(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const now = getNowIST();
    // Monday = start of week, subscription begins today; Tue–Sun = starts next Monday
    const startDate = now.getDay() === 1 ? getMondayOfCurrentWeek(now) : getNextMonday(now);

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
    const { getNowIST } = require("../utils/workingDays");
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodCancellation.upsert({
      where:  { empId_weekStartDate: { empId, weekStartDate: nextMonday } },
      create: { empId, weekStartDate: nextMonday },
      update: {},
    });
  }

  async undoCancelNextWeek(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodCancellation.deleteMany({
      where: { empId, weekStartDate: nextMonday },
    });
  }

  // ── Button 2: Cancel this year — suspend from next Monday onwards ─────────
  async bulkDisableFromNextWeek(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodSubscription.update({
      where: { empId },
      data:  { suspendedFrom: nextMonday },
    });
  }

  async undoBulkDisable(empId) {
    return prisma.foodSubscription.update({
      where: { empId },
      data:  { suspendedFrom: null },
    });
  }

  // ── Button 3: Enable next week only (when year is suspended) ─────────────
  async enableNextWeekOnly(empId) {
    const { getNowIST } = require("../utils/workingDays");
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
    const { getNowIST } = require("../utils/workingDays");
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
    return prisma.foodSubscription.upsert({
      where:  { empId },
      update: { isActive: true, suspendedFrom: null },
      create: { empId, isActive: true },
    });
  }

  async disableYear(empId) {
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
    const cancellations = await prisma.foodCancellation.findMany({
      where: { empId, weekStartDate: { gte: startDate, lte: endDate } },
    });
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    });

    const days        = [];
    const curr        = new Date(startDate);
    const suspDateStr = sub?.suspendedFrom ? toDateString(new Date(sub.suspendedFrom)) : null;
    const subStartStr = sub?.startDate     ? toDateString(new Date(sub.startDate))     : null;

    while (curr <= endDate) {
      const dateStr    = toDateString(curr);
      const dayOfWeek  = curr.getDay();
      const weekStartStr = toDateString(getMondayOfCurrentWeek(curr));

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
        // Weeks before the subscription start week → inactive
        if (subStartStr && weekStartStr < subStartStr) {
          type = "inactive";
        } else {
          const isCancelled = cancellations.some(
            c => toDateString(new Date(c.weekStartDate)) === weekStartStr
          );
          if (isCancelled) {
            type = "cancelled";
          } else if (!sub?.isActive) {
            type = "inactive";
          } else if (suspDateStr && dateStr >= suspDateStr) {
            type = "inactive";
          }
        }
      }

      days.push({ date: dateStr, type, name });
      curr.setDate(curr.getDate() + 1);
    }

    const workingDaysCount = days.filter(
      d => d.type === "working" || d.type === "working-saturday"
    ).length;

    return {
      isActive:     sub?.isActive || false,
      subscribed:   !!sub,
      suspendedFrom: sub?.suspendedFrom,
      workingDays:  workingDaysCount,
      totalAmount:  workingDaysCount * 30,
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

    return { period: periodName, data: reportData };
  }
}

module.exports = new FoodService();
