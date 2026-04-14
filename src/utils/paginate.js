/**
 * src/utils/paginate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared pagination helper used by all list endpoints.
 *
 * Usage:
 *   const { skip, take, page, limit } = parsePagination(req.query);
 *   const [rows, total] = await Promise.all([
 *     prisma.model.findMany({ where, skip, take, orderBy }),
 *     prisma.model.count({ where }),
 *   ]);
 *   res.json(buildPageResponse(rows, total, page, limit));
 *
 * Query params accepted on every paginated endpoint:
 *   ?page=1        → 1-based page number  (default: 1)
 *   ?limit=20      → records per page     (default: 20, max: 100)
 *
 * Response envelope:
 *   {
 *     data:        [...],   // the records for this page
 *     pagination: {
 *       total:       120,   // total matching records
 *       page:        2,     // current page
 *       limit:       20,    // page size
 *       totalPages:  6,     // ceil(total / limit)
 *       hasNext:     true,  // is there a next page?
 *       hasPrev:     true,  // is there a previous page?
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 100;

/**
 * Parse `page` and `limit` from express req.query.
 * Always returns safe, clamped integers.
 *
 * @param {object} query - req.query
 * @returns {{ page: number, limit: number, skip: number, take: number }}
 */
function parsePagination(query = {}) {
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Wrap a page of records with a standard pagination envelope.
 *
 * @param {Array}  data    - the records for this page
 * @param {number} total   - total matching records (from prisma count)
 * @param {number} page    - current page
 * @param {number} limit   - page size
 * @returns {object}
 */
function buildPageResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = { parsePagination, buildPageResponse };