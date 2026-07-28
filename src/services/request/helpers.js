"use strict";

const WITH_OWNER = { owner: true, closeTicket: true, chatMessages: true, readReceipts: true, _count: { select: { threadReplies: true } } };

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function computeNextRecurringDate(interval) {
  const d = new Date();
  switch (interval) {
    case "1w":  d.setDate(d.getDate() + 7);        break;
    case "2w":  d.setDate(d.getDate() + 14);       break;
    case "1m":  d.setMonth(d.getMonth() + 1);      break;
    case "6m":  d.setMonth(d.getMonth() + 6);      break;
    case "1y":  d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

function buildFileUrl(req, filename) {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/api/files/${filename}`;
}

const RESTRICTED_REQUESTOR_PREFIXES = ["Operations-", "Academics-", "Stores-"];
const RESTRICTED_REQUESTOR_EXACT    = new Set(["Game Development", "Software", "Animation", "Management", "Purchase", "HR"]);
function isRestrictedRequestorDept(dept) {
  return RESTRICTED_REQUESTOR_PREFIXES.some(p => dept?.startsWith(p)) ||
    RESTRICTED_REQUESTOR_EXACT.has(dept);
}

module.exports = { WITH_OWNER, stripHtml, computeNextRecurringDate, buildFileUrl, isRestrictedRequestorDept };
