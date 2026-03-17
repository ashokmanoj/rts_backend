const pool    = require("../db/pool");
const { formatRequest } = require("../utils/formatters");

// Build absolute file URL accessible from the frontend
const fileUrl = (req, filename) => {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

const nowISO = () => new Date().toISOString();

/**
 * GET /api/requests
 * Returns requests filtered by role:
 *   Employee  → own requests only
 *   RM / HOD  → own dept requests + own submissions
 *   DeptHOD   → assigned to their dept + own submissions
 *   Admin     → everything
 */
async function getAll(req, res, next) {
  try {
    const { role, empId, dept } = req.user;

    let whereClause = "";
    let values      = [];

    if (role === "Employee") {
      whereClause = "WHERE r.emp_id = $1";
      values      = [empId];
    } else if (role === "RM" || role === "HOD") {
      whereClause = "WHERE (r.dept = $1 OR r.emp_id = $2)";
      values      = [dept, empId];
    } else if (role === "DeptHOD") {
      whereClause = "WHERE (r.assigned_dept = $1 OR r.emp_id = $2)";
      values      = [dept, empId];
    }
    // Admin — no filter, sees everything

    const result = await pool.query(`
      SELECT
        r.id,
        r.emp_id,
        r.purpose,
        r.description,
        r.file_url,
        r.file_name,
        r.dept,
        r.assigned_dept,
        r.rm_status,
        r.rm_date,
        r.hod_status,
        r.hod_date,
        r.dept_hod_status,
        r.dept_hod_date,
        r.forwarded,
        r.forwarded_by,
        r.forwarded_at,
        r.assigned_status,
        r.is_closed,
        r.resolved_date,
        r.resolved_by,
        r.seen,
        r.created_at,
        u.name,
        u.designation,
        u.location
      FROM   requests r
      JOIN   users    u ON u.emp_id = r.emp_id
      ${whereClause}
      ORDER  BY r.created_at DESC
    `, values);

    res.json(result.rows.map(formatRequest));
  } catch (err) { next(err); }
}

/**
 * POST /api/requests  (multipart: purpose, dept, description, file?)
 */
async function create(req, res, next) {
  try {
    const { purpose, dept, description } = req.body;
    if (!purpose || !dept) {
      return res.status(400).json({ error: "purpose and dept are required." });
    }

    const user         = req.user;
    const uploadedFile = req.file;

    const result = await pool.query(`
      INSERT INTO requests
        (emp_id, purpose, description, file_url, file_name, dept, assigned_dept)
      VALUES ($1,$2,$3,$4,$5,$6,$6)
      RETURNING *
    `, [
      user.empId,
      purpose,
      description || "",
      uploadedFile ? fileUrl(req, uploadedFile.filename) : null,
      uploadedFile ? uploadedFile.originalname            : null,
      dept,
    ]);

    const userRow = await pool.query(
      "SELECT name, designation, location FROM users WHERE emp_id = $1", [user.empId]
    );
    const row = { ...result.rows[0], ...userRow.rows[0] };
    res.status(201).json(formatRequest(row));
  } catch (err) { next(err); }
}

/**
 * PATCH /api/requests/:id/approval
 * Step 1 — RM:      sets rm_status
 * Step 2 — HOD:     sets hod_status
 * Step 3 — DeptHOD: sets dept_hod_status
 * Any role — Forwarded: updates assigned_dept
 */
async function approval(req, res, next) {
  try {
    const reqId    = Number(req.params.id);
    const { decision, comment, newDept } = req.body;
    const user     = req.user;
    const now      = nowISO();

    if (!decision) {
      return res.status(400).json({ error: "decision is required." });
    }

    const allowed = ["Approved", "Rejected", "Checking", "Forwarded"];
    if (!allowed.includes(decision)) {
      return res.status(400).json({ error: `decision must be one of: ${allowed.join(", ")}` });
    }

    // Check request exists and is not already closed
    const check = await pool.query(
      "SELECT id, is_closed, purpose, assigned_dept FROM requests WHERE id = $1",
      [reqId]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }
    if (check.rows[0].is_closed) {
      return res.status(403).json({ error: "Cannot update a closed ticket." });
    }

    let setClauses = [];
    let values     = [];
    let idx        = 1;

    if (decision === "Forwarded") {
      if (!newDept) {
        return res.status(400).json({ error: "newDept is required when forwarding." });
      }
      setClauses.push(`forwarded = TRUE`, `forwarded_by = $${idx++}`, `forwarded_at = $${idx++}`, `assigned_dept = $${idx++}`);
      values.push(user.name, now, newDept);
    } else if (user.role === "RM") {
      setClauses.push(`rm_status = $${idx++}`, `rm_date = $${idx++}`);
      values.push(decision, now);
    } else if (user.role === "HOD") {
      setClauses.push(`hod_status = $${idx++}`, `hod_date = $${idx++}`);
      values.push(decision, now);
    } else if (user.role === "DeptHOD") {
      setClauses.push(`dept_hod_status = $${idx++}`, `dept_hod_date = $${idx++}`);
      values.push(decision, now);
    } else if (user.role === "Admin") {
      return res.status(403).json({ error: "Admin has read-only access." });
    } else {
      return res.status(403).json({ error: "Your role cannot approve requests." });
    }

    setClauses.push(`seen = FALSE`);
    values.push(reqId);

    const sql = `
      UPDATE requests
      SET    ${setClauses.join(", ")}
      WHERE  id = $${idx}
      RETURNING *
    `;
    const result = await pool.query(sql, values);

    // Log approval card in chat
    await pool.query(`
      INSERT INTO chat_messages
        (request_id, author, role, type, text, status, purpose, changed_dept, original_dept)
      VALUES ($1,$2,$3,'approval',$4,$5,$6,$7,$8)
    `, [
      reqId,
      user.name,
      user.role,
      comment || `${decision} the request.`,
      decision,
      result.rows[0].purpose,
      decision === "Forwarded" ? newDept : null,
      check.rows[0].assigned_dept,
    ]);

    const userRow = await pool.query(
      "SELECT name, designation, location FROM users WHERE emp_id = $1",
      [result.rows[0].emp_id]
    );
    res.json(formatRequest({ ...result.rows[0], ...userRow.rows[0] }));
  } catch (err) { next(err); }
}

/**
 * PATCH /api/requests/:id/seen
 */
async function markSeen(req, res, next) {
  try {
    const result = await pool.query(
      "UPDATE requests SET seen = TRUE WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Request not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/requests/:id/unread
 */
async function markUnread(req, res, next) {
  try {
    const result = await pool.query(
      "UPDATE requests SET seen = FALSE WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Request not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/requests/:id/close  (DeptHOD or Admin only)
 * FIX: checks is_closed before proceeding to prevent double-close
 */
async function close(req, res, next) {
  try {
    const reqId        = Number(req.params.id);
    const { note }     = req.body;
    const user         = req.user;
    const uploadedFile = req.file;

    if (user.role !== "DeptHOD" && user.role !== "Admin") {
      return res.status(403).json({ error: "Only DeptHOD can close tickets." });
    }

    // FIX: Check if already closed
    const check = await pool.query(
      "SELECT id, is_closed FROM requests WHERE id = $1",
      [reqId]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }
    if (check.rows[0].is_closed) {
      return res.status(409).json({ error: "Ticket is already closed." });
    }

    const now      = new Date();
    const dateStr  = now.toLocaleDateString("en-IN");
    const closedLabel = `${dateStr} (Closed)`;

    const result = await pool.query(`
      UPDATE requests
      SET    assigned_status = $1,
             is_closed       = TRUE,
             resolved_date   = NOW(),
             resolved_by     = $2,
             seen            = FALSE
      WHERE  id = $3
      RETURNING *
    `, [closedLabel, user.name, reqId]);

    // Insert system closure message in chat
    const fUrl  = uploadedFile ? fileUrl(req, uploadedFile.filename) : null;
    const fName = uploadedFile ? uploadedFile.originalname            : null;
    const isImg = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;

    await pool.query(`
      INSERT INTO chat_messages
        (request_id, author, role, type, text, file_url, file_name, is_image)
      VALUES ($1,$2,$3,'system',$4,$5,$6,$7)
    `, [
      reqId,
      user.name,
      user.role,
      note
        ? `🔒 Ticket closed by ${user.name} — ${note}`
        : `🔒 Ticket closed by ${user.name}`,
      fUrl, fName, isImg,
    ]);

    const userRow = await pool.query(
      "SELECT name, designation, location FROM users WHERE emp_id = $1",
      [result.rows[0].emp_id]
    );
    res.json(formatRequest({ ...result.rows[0], ...userRow.rows[0] }));
  } catch (err) { next(err); }
}

module.exports = { getAll, create, approval, markSeen, markUnread, close };
