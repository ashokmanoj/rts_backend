'use strict';

const router = require('express').Router();
const { authenticate, authorizeHODReport } = require('../middleware/auth');
const {
  subscribe,
  getStatus,
  bulkDisableFromNextWeek,
  undoBulkDisable,
  enableNextWeekOnly,
  enableYear,
  disableYear,
  getCalendar,
  getReport,
  downloadReport,
} = require('../controllers/foodController');

router.use(authenticate);

router.post('/subscribe',         subscribe);
router.get('/status',             getStatus);
router.post('/cancel',            bulkDisableFromNextWeek);
router.post('/undo-cancel',       undoBulkDisable);
router.post('/enable-next-week',  enableNextWeekOnly);
router.post('/enable-year',       enableYear);
router.post('/disable-year',      disableYear);
router.get('/calendar',           getCalendar);
router.get('/report',             authorizeHODReport, getReport);
router.get('/report/download',    authorizeHODReport, downloadReport);

module.exports = router;
