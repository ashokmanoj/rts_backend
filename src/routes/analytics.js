"use strict";

const router = require("express").Router({ caseSensitive: true });
const { authenticate } = require("../middleware/auth");
const { ping, getDau, getDauByDate } = require("../controllers/analyticsController");

// POST /api/analytics/ping  — mobile app records user is active (JWT required)
router.post("/ping", authenticate, ping);

// GET  /api/analytics/dau          — daily active user counts (SuperUser/Admin/Management)
router.get("/dau", authenticate, getDau);

// GET  /api/analytics/dau/:date    — active users for one specific date
router.get("/dau/:date", authenticate, getDauByDate);

module.exports = router;
