"use strict";

const prisma = require("../config/database");

/**
 * POST /api/analytics/ping
 * Mobile app calls this to record that the user is active.
 * Body: { timestamp? }  — ISO string; defaults to now if omitted.
 * One row per user per day — upserts on (empId, date).
 */
async function ping(req, res, next) {
  try {
    const empId = req.user?.empId;
    if (!empId) return res.status(401).json({ error: "Invalid token." });

    const raw  = req.body?.timestamp;
    const when = raw ? new Date(raw) : new Date();
    if (isNaN(when.getTime())) {
      return res.status(400).json({ error: "Invalid timestamp." });
    }

    // date in IST (UTC+5:30) so the day boundary matches India time
    const ist  = new Date(when.getTime() + 5.5 * 60 * 60 * 1000);
    const date = ist.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const platform    = req.body?.platform    || "mobile";
    const appVersion  = Number.isInteger(req.body?.appVersion) ? req.body.appVersion : 0;
    const versionName = typeof req.body?.versionName === "string" ? req.body.versionName.trim() : "";

    await prisma.appSession.upsert({
      where:  { empId_date: { empId, date } },
      update: { lastPing: when, appVersion, versionName },
      create: { empId, date, lastPing: when, platform, appVersion, versionName },
    });

    // Fetch user details to return in response
    const user = await prisma.user.findUnique({
      where:  { empId },
      select: { name: true, dept: true, designation: true, role: true },
    });

    return res.json({
      success:   true,
      message:   "Activity recorded successfully",
      recorded: {
        empId,
        name:        user?.name        || empId,
        dept:        user?.dept        || "",
        designation: user?.designation || "",
        role:        user?.role        || "",
        date,
        lastPing:     when.toISOString(),
        platform,
        appVersion,
        versionName,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/dau
 * Returns daily active user counts (and optionally the user list).
 * Query params:
 *   from      — "YYYY-MM-DD"  (default: 30 days ago)
 *   to        — "YYYY-MM-DD"  (default: today)
 *   detail    — "true"        — include empId + name list per day
 *   platform  — filter by platform string (default: all)
 * Only SuperUser / Admin / Management can call this.
 */
async function getDau(req, res, next) {
  try {
    const { role } = req.user || {};
    if (!["SuperUser", "Admin", "Management"].includes(role)) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Date range
    const today   = new Date();
    const todayIST = new Date(today.getTime() + 5.5 * 60 * 60 * 1000);
    const todayStr = todayIST.toISOString().slice(0, 10);

    const thirtyAgo = new Date(todayIST);
    thirtyAgo.setDate(thirtyAgo.getDate() - 29);
    const thirtyAgoStr = thirtyAgo.toISOString().slice(0, 10);

    const from     = (req.query.from || thirtyAgoStr).slice(0, 10);
    const to       = (req.query.to   || todayStr).slice(0, 10);
    const detail   = req.query.detail === "true";
    const platform = req.query.platform || null;

    const where = {
      date: { gte: from, lte: to },
      ...(platform ? { platform } : {}),
    };

    if (detail) {
      // Return per-day list of users
      const rows = await prisma.appSession.findMany({
        where,
        select: {
          date: true,
          empId: true,
          lastPing: true,
          platform: true,
          appVersion: true,
          versionName: true,
          user: { select: { name: true, dept: true } },
        },
        orderBy: [{ date: "desc" }, { empId: "asc" }],
      });

      // Group by date
      const map = {};
      for (const r of rows) {
        if (!map[r.date]) map[r.date] = { date: r.date, count: 0, users: [] };
        map[r.date].count++;
        map[r.date].users.push({
          empId:       r.empId,
          name:        r.user?.name || r.empId,
          dept:        r.user?.dept || "",
          lastPing:    r.lastPing,
          platform:    r.platform,
          appVersion:  r.appVersion,
          versionName: r.versionName,
        });
      }
      return res.json({ from, to, days: Object.values(map).sort((a, b) => b.date.localeCompare(a.date)) });
    }

    // Summary only — group by date in DB
    const grouped = await prisma.appSession.groupBy({
      by:     ["date"],
      where,
      _count: { empId: true },
      orderBy: { date: "desc" },
    });

    const days = grouped.map(g => ({ date: g.date, count: g._count.empId }));
    return res.json({ from, to, days });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/dau/:date
 * Returns the active user list for a single specific date.
 * Only SuperUser / Admin / Management.
 */
async function getDauByDate(req, res, next) {
  try {
    const { role } = req.user || {};
    if (!["SuperUser", "Admin", "Management"].includes(role)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const date = (req.params.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Date must be YYYY-MM-DD." });
    }

    const rows = await prisma.appSession.findMany({
      where:  { date },
      select: {
        empId: true, lastPing: true, platform: true, appVersion: true, versionName: true,
        user:  { select: { name: true, dept: true, designation: true } },
      },
      orderBy: { lastPing: "desc" },
    });

    const users = rows.map(r => ({
      empId:       r.empId,
      name:        r.user?.name || r.empId,
      dept:        r.user?.dept || "",
      designation: r.user?.designation || "",
      lastPing:    r.lastPing,
      platform:    r.platform,
      appVersion:  r.appVersion,
      versionName: r.versionName,
    }));

    return res.json({ date, count: users.length, users });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/has-app
 * Returns whether the current user has ever pinged from the mobile app.
 * Used by the frontend to hide the "App Available" install prompt once installed.
 */
async function hasApp(req, res, next) {
  try {
    const empId = req.user?.empId;
    if (!empId) return res.status(401).json({ error: "Invalid token." });

    const session = await prisma.appSession.findFirst({ where: { empId } });
    return res.json({ hasApp: !!session });
  } catch (err) {
    next(err);
  }
}

module.exports = { ping, getDau, getDauByDate, hasApp };
