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
  adminGetAll,
  adminSubscribe,
  adminToggle,
  adminDelete,
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

// SuperUser admin CRUD
router.get('/admin/subscriptions',     authorize('SuperUser'), adminGetAll);
router.post('/admin/subscribe/:empId', authorize('SuperUser'), adminSubscribe);
router.patch('/admin/toggle/:empId',   authorize('SuperUser'), adminToggle);
router.delete('/admin/unsubscribe/:empId', authorize('SuperUser'), adminDelete);

module.exports = router;
