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
 * SuperUser always passes.
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (req.user?.role === "SuperUser") return next();
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied." });
    }
    next();
  };
}

/**
 * Allows only DeptHOD of HR or DeptHOD of Food Committee.
 * Used for food report/download endpoints.
 * SuperUser always passes.
 */
function authorizeHODReport(req, res, next) {
  const { role, dept } = req.user || {};
  if (role === "SuperUser") return next();
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
      select: { empId: true, dept: true, assignedDept: true, assignedDepts: true, assignedPersonEmpId: true, rmStatus: true, hodStatus: true, deptHodStatus: true, checkingBy: true }
    });

    if (!request) return res.status(404).json({ error: "Request not found." });

    const role     = (req.user.role     || "").trim();
    const empId    = (req.user.empId    || "").trim();
    const userDept = (req.user.dept     || "").trim();
    const userName = (req.user.name     || "").trim();

    if (!empId || !role) return res.status(401).json({ error: "Invalid token payload." });

    const reqDept      = (request.dept             || "").trim();
    const reqAssigned  = (request.assignedDept     || "").trim();
    const reqOwner     = (request.empId            || "").trim();
    const reqPersonIds = (request.assignedPersonEmpId || "").trim();
    const reqCheckedBy = (request.checkingBy       || "").trim();
    const rmStatus     = (request.rmStatus         || "").trim();
    const hodStatus    = (request.hodStatus        || "").trim();
    const deptHodStatus= (request.deptHodStatus    || "").trim();
    // assignedDepts is a comma-separated list of depts that can see this request (dual-visibility)
    const assignedDeptsArr = (request.assignedDepts || "").split(",").map(s => s.trim()).filter(Boolean);

    // SuperUser, Admin, and Management see everything
    if (["SuperUser", "Admin", "Management"].includes(role)) return next();

    // Owner can always see their own request
    if (reqOwner && reqOwner === empId) return next();

    // RM / HOD / DeptHOD: allow if dept matches, OR already acted, OR directly manages the owner
    if (["RM", "HOD", "DeptHOD"].includes(role)) {
      let deptMatch = false;
      if (role === "DeptHOD") {
        // External incoming OR self-targeted OR forwarding chain — NOT outgoing from their dept
        deptMatch = userDept && (
          (reqAssigned === userDept) ||                // external incoming + self-targeted
          assignedDeptsArr.includes(userDept)          // forwarding chain
        );
      } else {
        deptMatch = userDept && (reqDept === userDept || reqAssigned === userDept || assignedDeptsArr.includes(userDept));
      }
      if (deptMatch) return next();
      // Already acted — allow continued access even if request was forwarded away from their dept
      const hasActed =
        (role === "RM"      && rmStatus      && rmStatus      !== "--") ||
        (role === "HOD"     && hodStatus     && hodStatus     !== "--") ||
        (role === "DeptHOD" && deptHodStatus && deptHodStatus !== "--") ||
        (reqCheckedBy && userName && reqCheckedBy.includes(userName));
      if (hasActed) return next();
      // RM/HOD: also allow if they are the direct manager of the request owner (mirrors getAll filter)
      if (reqOwner && (role === "RM" || role === "HOD")) {
        const owner = await prisma.user.findUnique({
          where: { empId: reqOwner },
          select: { rmEmpId: true, hodEmpId: true },
        });
        if (owner) {
          if (role === "RM"  && owner.rmEmpId  === empId && reqDept === userDept) return next();
          if (role === "HOD" && owner.hodEmpId === empId && reqDept === userDept) return next();
        }
      }
    }

    // Specifically assigned person — can access regardless of dept
    if (reqPersonIds) {
      const ids = reqPersonIds.split(",").map(s => s.trim()).filter(Boolean);
      if (ids.includes(empId)) return next();
    }

    // Only non-restricted regular staff can see incoming requests assigned to their dept
    const deptOwnOnly = ["Academic", "Animation", "Software"];
    if (userDept && !deptOwnOnly.includes(userDept) && reqAssigned === userDept && reqDept !== userDept && !reqPersonIds) return next();

    // Tracking: non-restricted staff can access requests where their dept is in the forwarding chain
    if (userDept && !deptOwnOnly.includes(userDept) && assignedDeptsArr.includes(userDept)) return next();

    return res.status(403).json({ error: "Access denied to this request." });
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate, authenticateTemp, authenticateLogout, authorize, authorizeHODReport, authorizeRequestAccess };
