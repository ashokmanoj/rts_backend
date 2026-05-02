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
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
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
 * Soft auth for logout — decodes any token (including expired/temp) without
 * rejecting the request. Logout must always succeed client-side.
 */
function authenticateLogout(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    req.user = {};
    return next();
  }
  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    // Decode without verification so empId is available even for expired tokens
    req.user = jwt.decode(token) || {};
  }
  next();
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
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
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

/**
 * Ensures the user has permission to view/interact with a specific request.
 */
async function authorizeRequestAccess(req, res, next) {
  const prisma = require("../config/database");
  const requestId = Number(req.params.id || req.body.requestId);
  if (!requestId) return next();

  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { empId: true, dept: true, assignedDept: true }
    });

    if (!request) return res.status(404).json({ error: "Request not found." });

    const { role, empId, dept: userDept } = req.user;
    
    // Admin and Management see everything
    if (["Admin", "Management"].includes(role)) return next();

    // Owner can see it
    if (request.empId === empId) return next();

    // If user is RM/HOD/DeptHOD of the owner's dept or the assigned dept
    if (["RM", "HOD", "DeptHOD"].includes(role)) {
      if (request.dept === userDept || request.assignedDept === userDept) return next();
    }

    // Team members of the assigned department can see it (if not same dept as owner, they see it as "received")
    if (request.assignedDept === userDept) return next();

    return res.status(403).json({ error: "Access denied to this request." });
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate, authenticateTemp, authenticateLogout, authorize, authorizeHODReport, authorizeRequestAccess };
