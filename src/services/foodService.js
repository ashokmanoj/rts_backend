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
  getWeekStart: getMondayOfCurrentWeek,
  toDateString,
  isSecondOrFourthSaturday
} = require("../utils/workingDays");

class FoodService {
  async subscribe(empId, isActive) {
    return prisma.foodSubscription.upsert({
      where: { empId },
      update: { isActive: isActive !== undefined ? isActive : true, suspendedFrom: null },
      create: { empId, isActive: isActive !== undefined ? isActive : true },
    });
  }

  async getStatus(empId) {
    const { canCancelNow, getNowIST } = require("../utils/workingDays");
    const sub = await prisma.foodSubscription.findUnique({ 
      where: { empId },
      include: { user: true }
    });
    
    if (!sub) return { subscribed: false, isActive: false, isCancelledNextWeek: false };

    const nextMonday = getNextMonday(getNowIST());
    const cancellation = await prisma.foodCancellation.findUnique({
      where: { empId_weekStartDate: { empId, weekStartDate: nextMonday } },
    });

    const isSuspended = !!sub.suspendedFrom;
    const nextWeekDateStr = toDateString(nextMonday);
    const suspDateStr = sub.suspendedFrom ? toDateString(new Date(sub.suspendedFrom)) : null;

    // Next week is suspended if there's a manual cancellation OR if suspendedFrom is <= next Monday
    const nextWeekSuspended = !!cancellation || (isSuspended && suspDateStr <= nextWeekDateStr);

    return { 
      subscribed: true,
      isActive: sub.isActive, 
      isCancelledNextWeek: !!cancellation,
      nextWeekSuspended,
      suspendedFrom: sub.suspendedFrom,
      canCancelNow: canCancelNow(),
      subscription: {
        startDate: sub.createdAt || new Date()
      }
    };
  }

  async bulkDisableFromNextWeek(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const nextMonday = getNextMonday(getNowIST());
    return prisma.foodSubscription.update({
      where: { empId },
      data: { suspendedFrom: nextMonday }
    });
  }

  async undoBulkDisable(empId) {
    return prisma.foodSubscription.update({
      where: { empId },
      data: { suspendedFrom: null }
    });
  }

  async enableNextWeekOnly(empId) {
    const { getNowIST } = require("../utils/workingDays");
    const nextMonday = getNextMonday(getNowIST());
    const weekAfterNext = new Date(nextMonday);
    weekAfterNext.setDate(weekAfterNext.getDate() + 7);

    await prisma.$transaction([
      prisma.foodSubscription.update({ 
        where: { empId }, 
        data: { isActive: true, suspendedFrom: weekAfterNext } 
      }),
      prisma.foodCancellation.deleteMany({ 
        where: { empId, weekStartDate: nextMonday } 
      }),
    ]);
  }

  async enableYear(empId) {
    return prisma.foodSubscription.upsert({ where: { empId }, update: { isActive: true }, create: { empId, isActive: true } });
  }

  async disableYear(empId) {
    return prisma.foodSubscription.upsert({ where: { empId }, update: { isActive: false }, create: { empId, isActive: false } });
  }

  async getCalendar(empId, month, year) {
    const sub = await prisma.foodSubscription.findUnique({ where: { empId } });
    const cancellations = await prisma.foodCancellation.findMany({ where: { empId } });
    const holidays = await prisma.holiday.findMany();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    
    const days = [];
    const curr = new Date(startDate);
    const suspDateStr = sub?.suspendedFrom ? toDateString(new Date(sub.suspendedFrom)) : null;

    while (curr <= endDate) {
      const dateStr = toDateString(curr);
      const dayOfWeek = curr.getDay(); // 0=Sun, 6=Sat
      const weekStartStr = toDateString(getMondayOfCurrentWeek(curr));

      let type = "working";
      let name = null;

      // 1. Check if it's a holiday
      const holiday = holidays.find(h => toDateString(new Date(h.date)) === dateStr);
      if (holiday) {
        type = "holiday";
        name = holiday.name;
      } 
      // 2. Check Weekends
      else if (dayOfWeek === 0) {
        type = "weekend";
        name = "Sunday";
      } else if (dayOfWeek === 6) {
        if (isSecondOrFourthSaturday(curr)) {
          type = "weekend";
          name = "2nd/4th Saturday";
        } else {
          type = "working-saturday";
        }
      }

      // 3. Check Subscription Status
      if (type === "working" || type === "working-saturday") {
        const isCancelled = cancellations.some(c => toDateString(new Date(c.weekStartDate)) === weekStartStr);
        if (isCancelled) {
          type = "cancelled";
        } else if (!sub?.isActive) {
          type = "inactive";
        } else if (suspDateStr && dateStr >= suspDateStr) {
          type = "inactive";
        }
      }

      days.push({ date: dateStr, type, name });
      curr.setDate(curr.getDate() + 1);
    }

    // Calculate summary
    const workingDaysCount = days.filter(d => d.type === "working" || d.type === "working-saturday").length;

    return {
      isActive: sub?.isActive || false,
      subscribed: !!sub,
      suspendedFrom: sub?.suspendedFrom,
      workingDays: workingDaysCount,
      totalAmount: workingDaysCount * 30,
      days
    };
  }

  async getReport(deptFilter, query) {
    const { type, month, year, weekStart } = query;
    const holidays = await prisma.holiday.findMany();

    let startDate, endDate, periodName;

    if (type === "week" && weekStart) {
      startDate = getMondayOfCurrentWeek(new Date(weekStart));
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      periodName = `Week of ${toDateString(startDate)}`;
    } else {
      const m = parseInt(month) || (new Date().getMonth() + 1);
      const y = parseInt(year) || new Date().getFullYear();
      startDate = new Date(y, m - 1, 1);
      endDate = new Date(y, m, 0);
      periodName = startDate.toLocaleString("default", { month: "long", year: "numeric" });
    }

    const users = await prisma.user.findMany({
      where: deptFilter ? { dept: deptFilter } : {},
      include: {
        foodSubscription: true,
        foodCancellations: true,
      },
    });

    const { calculateWorkingDays } = require("../utils/workingDays");

    const reportData = users
      .map((u) => {
        if (!u.foodSubscription?.isActive && !u.foodCancellations.length) return null;

        const workingDays = calculateWorkingDays(
          startDate,
          endDate,
          holidays,
          u.foodCancellations.map((c) => c.weekStartDate),
          u.foodSubscription?.suspendedFrom
        );

        if (workingDays === 0) return null;

        return {
          name: u.name,
          empId: u.empId,
          dept: u.dept,
          location: u.location,
          period: periodName,
          workingDays,
          totalAmount: workingDays * 30,
        };
      })
      .filter(Boolean);

    return {
      period: periodName,
      data: reportData,
    };
  }
}

module.exports = new FoodService();
