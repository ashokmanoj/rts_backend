const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const pool   = require("../db/pool");

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Find user
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Sign JWT
    const payload = {
      userId: user.id,   // user UUID — renamed to avoid clash with request.id
      empId:  user.emp_id,
      name:  user.name,
      role:  user.role,
      dept:  user.dept,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns logged-in user info from JWT (no DB hit needed).
 */
function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };