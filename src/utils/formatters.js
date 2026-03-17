/**
 * Converts a raw DB requests row into the shape the frontend expects.
 */
function formatRequest(row) {
  const pad = (d) => d ? new Date(d).toLocaleString("en-IN") : null;
  return {
    id:             row.id,
    date:           new Date(row.created_at).toLocaleDateString("en-IN"),
    empId:          row.emp_id,
    name:           row.name          || row.emp_id,
    dept:           row.dept,
    designation:    row.designation   || "—",
    location:       row.location      || "—",
    purpose:        row.purpose,
    description:    row.description,
    fileUrl:        row.file_url      || null,
    fileName:       row.file_name     || null,
    rmStatus:       row.rm_status,
    rmDate:         pad(row.rm_date),
    hodStatus:      row.hod_status,
    hodDate:        pad(row.hod_date),
    deptHodStatus:  row.dept_hod_status || "--",
    deptHodDate:    pad(row.dept_hod_date),
    assignedDept:   row.assigned_dept,
    forwarded:      row.forwarded,
    forwardedBy:    row.forwarded_by  || null,
    forwardedAt:    pad(row.forwarded_at),
    assignedStatus: row.assigned_status,
    isClosed:       row.is_closed     || false,
    resolvedDate:   row.resolved_date || null,
    resolvedBy:     row.resolved_by,
    seen:           row.seen,
  };
}

/**
 * Converts a raw DB chat_messages row into the shape the frontend expects.
 */
function formatMessage(row) {
  return {
    id:           row.id,
    author:       row.author,
    role:         row.role,
    type:         row.type,
    text:         row.text         || "",
    fileUrl:      row.file_url     || null,
    fileName:     row.file_name    || null,
    isImage:      row.is_image     || false,
    voiceUrl:     row.voice_url    || null,
    duration:     row.duration     || null,
    status:       row.status       || null,
    purpose:      row.purpose      || null,
    changedDept:  row.changed_dept || null,
    originalDept: row.original_dept|| null,
    time:         new Date(row.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    date:         new Date(row.created_at).toLocaleDateString("en-IN"),
  };
}

module.exports = { formatRequest, formatMessage };