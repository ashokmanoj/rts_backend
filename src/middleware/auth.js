const jwt  = require("jsonwebtoken");

/**
 * Verifies a full Bearer JWT (rejects temp tokens used for role selection).
 * Attaches decoded user payload to req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided." });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === "temp") {
      return res.status(401).json({ error: "Role selection required." });
    }
    req.user = payload;   // { userId, empId, name, role, dept, location }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Accepts ONLY the short-lived temp token issued when a user has multiple roles.
 * Used exclusively by POST /auth/select-role.
 */
function authenticateTemp(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided." });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "temp") {
      return res.status(401).json({ error: "Invalid token type." });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Role guard factory — use after authenticate.
 * Example: authorize("RM", "HOD", "Admin")
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied." });
    }
    next();
  };
}

/**
 * Allows only DeptHOD of HR or DeptHOD of Food Committee.
 * Used for food report/download endpoints.
 */
function authorizeHODReport(req, res, next) {
  const { role, dept } = req.user || {};
  const allowed = role === 'DeptHOD' && ['HR', 'Food Committee'].includes(dept);
  if (!allowed) return res.status(403).json({ error: 'Access denied.' });
  next();
}

module.exports = { authenticate, authenticateTemp, authorize, authorizeHODReport };
