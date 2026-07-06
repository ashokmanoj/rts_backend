'use strict';

const router = require('express').Router({ caseSensitive: true });
const { authenticate, authorize, authorizeHODReport } = require('../middleware/auth');
const {
  subscribe,
  getStatus,
  cancelNextWeek,
  undoCancelNextWeek,
  bulkDisableFromNextWeek,
  undoBulkDisable,
  enableNextWeekOnly,
  undoEnableNextWeek,
  enableYear,
  disableYear,
  getCalendar,
  getReport,
  downloadReport,
  addManualEntry,
  getUsers,
  adminGetAll,
  adminSubscribe,
  adminToggle,
  adminDelete,
  adminCountCancellations,
  adminDeleteCancellations,
  adminPreviewCancelRange,
  adminCancelRange,
} = require('../controllers/foodController');

router.use(authenticate);

router.post('/subscribe',              subscribe);
router.get('/status',                  getStatus);

// Button 1 — cancel / restore next week only
router.post('/cancel-week',            cancelNextWeek);
router.post('/undo-cancel-week',       undoCancelNextWeek);

// Button 2 — cancel this year / restore year
router.post('/cancel',                 bulkDisableFromNextWeek);
router.post('/undo-cancel',            undoBulkDisable);

// Button 3 — enable next week only / undo
router.post('/enable-next-week',       enableNextWeekOnly);
router.post('/undo-enable-next-week',  undoEnableNextWeek);

// Button 4 — enable / disable full year
router.post('/enable-year',            enableYear);
router.post('/disable-year',           disableYear);

router.get('/calendar',                getCalendar);
router.get('/report',                  authorizeHODReport, getReport);
router.get('/report/download',         authorizeHODReport, downloadReport);
router.get('/admin/users',             authorizeHODReport, getUsers);
router.post('/admin/manual-entry',     authorizeHODReport, addManualEntry);

// SuperUser admin CRUD
router.get('/admin/subscriptions',             authorize('SuperUser'), adminGetAll);
router.post('/admin/subscribe/:empId',         authorize('SuperUser'), adminSubscribe);
router.patch('/admin/toggle/:empId',           authorize('SuperUser'), adminToggle);
router.delete('/admin/unsubscribe/:empId',     authorize('SuperUser'), adminDelete);

// SuperUser: clear food cancellation votes
router.get('/admin/cancellations/count',       authorize('SuperUser'), adminCountCancellations);
router.delete('/admin/cancellations',          authorize('SuperUser'), adminDeleteCancellations);

// SuperUser: add cancellations for a date range (remove food for those weeks)
router.get('/admin/cancel-range/count',        authorize('SuperUser'), adminPreviewCancelRange);
router.post('/admin/cancel-range',             authorize('SuperUser'), adminCancelRange);

module.exports = router;
