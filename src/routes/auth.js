const router      = require("express").Router({ caseSensitive: true });
const rateLimit   = require("express-rate-limit");
const { login, me, logout, heartbeat, forgotPassword, resetPassword } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// 5 attempts per 15 min per IP — applied only to the password-reset routes
const resetLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: "Too many requests. Please try again in 15 minutes." },
});

// POST /api/auth/login
router.post("/login", login);

// POST /api/auth/logout (protected)
router.post("/logout", authenticate, logout);

// POST /api/auth/heartbeat (protected)
router.post("/heartbeat", authenticate, heartbeat);

// GET  /api/auth/me  (protected)
router.get("/me", authenticate, me);

// POST /api/auth/forgot-password  (public, rate-limited)
router.post("/forgot-password", resetLimiter, forgotPassword);

// POST /api/auth/reset-password/:token  (public, rate-limited)
router.post("/reset-password/:token", resetLimiter, resetPassword);

module.exports = router;
