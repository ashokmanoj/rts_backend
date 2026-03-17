const pool    = require("../db/pool");
const { formatMessage } = require("../utils/formatters");

const fileUrl = (req, filename) => {
  if (!filename) return null;
  const base = process.env.SERVER_URL
    ? process.env.SERVER_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

/**
 * GET /api/requests/:id/chat
 */
async function getMessages(req, res, next) {
  try {
    // Verify request exists
    const reqCheck = await pool.query(
      "SELECT id FROM requests WHERE id = $1", [req.params.id]
    );
    if (!reqCheck.rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }

    const result = await pool.query(
      `SELECT * FROM chat_messages WHERE request_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map(formatMessage));
  } catch (err) { next(err); }
}

/**
 * POST /api/requests/:id/chat
 * FIX: Only sets seen=FALSE for OTHER users, not the sender.
 * The backend sets seen=FALSE on the request so other users see the "unread" badge.
 * The sender should NOT see their own message as creating an unread item for themselves.
 * NOTE: We still set it globally — the frontend filters this by checking currentUser.
 * Blocked if ticket is already closed.
 */
async function sendMessage(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const user  = req.user;
    const body  = req.body;
    const uploadedFile = req.file;

    // Block chat on closed tickets
    const check = await pool.query(
      "SELECT is_closed FROM requests WHERE id = $1", [reqId]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }
    if (check.rows[0].is_closed) {
      return res.status(403).json({ error: "Ticket is closed. Chat is disabled." });
    }

    const type         = body.type || "message";
    const text         = body.text || "";
    const fUrl         = uploadedFile ? fileUrl(req, uploadedFile.filename) : null;
    const fName        = uploadedFile ? uploadedFile.originalname            : null;
    const isImg        = uploadedFile ? uploadedFile.mimetype.startsWith("image/") : false;
    const voiceUrl     = (type === "voice" && uploadedFile) ? fUrl  : null;
    const fileUrlVal   = (type !== "voice" && uploadedFile) ? fUrl  : null;
    const fileNameVal  = (type !== "voice" && uploadedFile) ? fName : null;
    const duration     = body.duration     || null;
    const status       = body.status       || null;
    const purpose      = body.purpose      || null;
    const changedDept  = body.changedDept  || null;
    const originalDept = body.originalDept || null;

    // Validate: file/voice types must have a file attached
    if ((type === "file" || type === "voice" || type === "mixed") && !uploadedFile) {
      return res.status(400).json({ error: `A file is required for type '${type}'.` });
    }

    // Mark request unseen (for other users to notice new activity)
    await pool.query("UPDATE requests SET seen = FALSE WHERE id = $1", [reqId]);

    const result = await pool.query(`
      INSERT INTO chat_messages
        (request_id, author, role, type, text,
         file_url, file_name, is_image,
         voice_url, duration,
         status, purpose, changed_dept, original_dept)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      reqId, user.name, user.role, type, text,
      fileUrlVal, fileNameVal, isImg,
      voiceUrl, duration,
      status, purpose, changedDept, originalDept,
    ]);

    res.status(201).json(formatMessage(result.rows[0]));
  } catch (err) { next(err); }
}

module.exports = { getMessages, sendMessage };
