'use strict';

// Returns current time in IST regardless of server timezone
function getNowIST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function toDateString(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSecondOrFourthSaturday(date) {
  if (date.getDay() !== 6) return false;
  const weekNum = Math.ceil(date.getDate() / 7);
  return weekNum === 2 || weekNum === 4;
}

function isNonWorkingDay(date, holidays = []) {
  const day = date.getDay();
  if (day === 0) return true; // Sunday
  if (isSecondOrFourthSaturday(date)) return true;
  const dateStr = toDateString(date);
  // Holidays are stored as IST midnight (18:30 UTC previous day).
  // Normalise to IST calendar date before comparing so it works on any server timezone.
  return holidays.some(h => {
    const istMs = new Date(h.date).getTime() + 5.5 * 60 * 60 * 1000;
    const ist = new Date(istMs);
    const hStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
    return hStr === dateStr;
  });
}

// Returns Monday of the week containing the given date
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns Monday of NEXT week from any day
function getNextWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilNextMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysInRange(start, end) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  while (d <= endDate) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Returns Monday two weeks from now
function getNextNextWeekStart(date) {
  return getNextWeekStart(getNextWeekStart(date));
}

/**
 * monthStart: when provided (monthly-report mode) the function mirrors the
 * calendar's billing boundaries —
 *   • skips days in "prev month weeks" (weeks whose Monday is before monthStart)
 *   • extends endDate to the end of the last week starting in the month so
 *     next-month overflow days (e.g. Aug 1 when billing July) are counted here.
 */
function calculateWorkingDays(startDate, endDate, holidays = [], cancelledWeekStarts = [], suspendedFrom = null, subStartDate = null, monthStart = null) {
  // Extend range to cover the full last week of the month (next-month overflow).
  // Mirrors getCalendar's displayEnd logic.
  let effectiveEnd = endDate;
  if (monthStart) {
    const lastDow  = new Date(endDate).getDay();
    const extra    = lastDow === 0 ? 0 : 7 - lastDow;
    effectiveEnd   = new Date(endDate);
    effectiveEnd.setDate(effectiveEnd.getDate() + extra);
  }

  const days = getDaysInRange(startDate, effectiveEnd);
  const suspDateStr     = suspendedFrom  ? toDateString(new Date(suspendedFrom))  : null;
  const subStartDateStr = subStartDate   ? toDateString(new Date(subStartDate))   : null;
  const monthStartStr   = monthStart     ? toDateString(new Date(monthStart))     : null;
  let count = 0;

  for (const day of days) {
    if (isNonWorkingDay(day, holidays)) continue;
    // Skip days whose billing week (Monday) falls before the month start
    // — they belong to the previous month (calendar shows them as "other-week").
    if (monthStartStr && toDateString(getWeekStart(day)) < monthStartStr) continue;
    if (subStartDateStr && toDateString(getWeekStart(day)) < subStartDateStr) continue;
    if (suspDateStr && toDateString(day) >= suspDateStr) continue;

    const weekStartStr = toDateString(getWeekStart(day));
    const isCancelled = cancelledWeekStarts.some(
      w => toDateString(new Date(w)) === weekStartStr
    );
    if (isCancelled) continue;

    count++;
  }

  return count;
}

// Window open: Monday through Saturday before 6:30 PM IST
// Closes Saturday at 6:30 PM IST (food already ordered for next week)
function canCancelNow() {
  const now  = getNowIST();
  const day  = now.getDay();   // 0=Sun, 6=Sat
  const hour = now.getHours();
  const min  = now.getMinutes();
  if (day === 0) {
    // Sunday: always closed
    return false;
  }
  if (day === 6) {
    // Saturday: open only before 6:30 PM IST
    return hour < 18 || (hour === 18 && min < 30);
  }
  return true; // Mon–Fri: always open
}

module.exports = {
  getNowIST,
  toDateString,
  isSecondOrFourthSaturday,
  isNonWorkingDay,
  getWeekStart,
  getNextWeekStart,
  getNextNextWeekStart,
  getDaysInRange,
  calculateWorkingDays,
  canCancelNow,
};
