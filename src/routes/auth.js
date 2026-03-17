const router = require("express").Router();
const { login, me } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", login);

// GET  /api/auth/me  (protected)
router.get("/me", authenticate, me);

module.exports = router;
