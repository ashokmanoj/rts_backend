const requestService = require("../services/requestService");

/**
 * GET /api/management/requests
 * Query params (all optional):
 *   search     — text search (name, empId, dept, purpose, description)
 *   hodStatus  — pending | approved | rejected | checking | all
 *   rmStatus   — pending | approved | rejected | checking | all
 *   dept       — exact requestor department name
 *   status     — open | closed
 *   page       — page number (default: 1)
 *   limit      — results per page, max 200 (default: all)
 */
async function listRequests(req, res, next) {
  try {
    const result = await requestService.getHodPendingRequests(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/management/requests/:id
 */
async function getRequest(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    const result = await requestService.getById(reqId, req.user);
    if (!result) return res.status(404).json({ error: "Request not found." });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/management/requests/:id/approval
 * Body: { decision: "Approved" | "Rejected" | "Checking" | "Close", comment?: string }
 */
async function takeAction(req, res, next) {
  try {
    const reqId = Number(req.params.id);
    if (!req.body.decision) return res.status(400).json({ error: "decision is required." });
    const result = await requestService.hodApproval(reqId, req.user, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/management/filter-options
 * Returns distinct values for each filterable field — use to populate dropdowns in mobile UI.
 */
async function getFilterOptions(req, res, next) {
  try {
    const result = await requestService.getManagementFilterOptions();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listRequests, getRequest, takeAction, getFilterOptions };
