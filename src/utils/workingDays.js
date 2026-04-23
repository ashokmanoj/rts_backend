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
  return holidays.some(h => toDateString(new Date(h.date)) === dateStr);
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

function calculateWorkingDays(startDate, endDate, holidays = [], cancelledWeekStarts = [], suspendedFrom = null) {
  const days = getDaysInRange(startDate, endDate);
  const suspDateStr = suspendedFrom ? toDateString(new Date(suspendedFrom)) : null;
  let count = 0;

  for (const day of days) {
    if (isNonWorkingDay(day, holidays)) continue;
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

// Window open: Monday through Saturday of next week before 6 PM IST
// Window closes Saturday of the upcoming/next week at 6 PM
// Closed only on: Sunday AND Saturday after 6 PM
function canCancelNow() {
  const now  = getNowIST();
  const day  = now.getDay();
  const hour = now.getHours();
  if (day === 0) return false;               // Sunday — closed
  if (day === 6 && hour >= 18) return false; // Saturday after 6 PM — closed
  return true;                               // Mon–Sat before 6 PM — open
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
