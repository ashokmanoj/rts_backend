/**
 * src/controllers/foodController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Handlers for Food Subscription.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const foodService = require("../services/foodService");

async function subscribe(req, res, next) {
  try {
    await foodService.subscribe(req.user.empId, req.body.isActive);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const status = await foodService.getStatus(req.user.empId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function bulkDisableFromNextWeek(req, res, next) {
  try {
    await foodService.bulkDisableFromNextWeek(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function undoBulkDisable(req, res, next) {
  try {
    await foodService.undoBulkDisable(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function enableNextWeekOnly(req, res, next) {
  try {
    await foodService.enableNextWeekOnly(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function enableYear(req, res, next) {
  try {
    await foodService.enableYear(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function disableYear(req, res, next) {
  try {
    await foodService.disableYear(req.user.empId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function getCalendar(req, res, next) {
  try {
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const year  = parseInt(req.query.year) || new Date().getFullYear();
    const data = await foodService.getCalendar(req.user.empId, month, year);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getReport(req, res, next) {
  try {
    const { role, dept } = req.user;
    const filterDept = (role === 'DeptHOD' && dept === 'HR') ? null : dept;
    const report = await foodService.getReport(filterDept, req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function downloadReport(req, res, next) {
  try {
    const { role, dept } = req.user;
    const filterDept = (role === 'DeptHOD' && dept === 'HR') ? null : dept;
    const report = await foodService.getReport(filterDept, req.query);

    let csv = "Name,Emp ID,Dept,Location,Period,Working Days,Total Amount\n";
    report.data.forEach(u => {
      csv += `"${u.name}","${u.empId}","${u.dept}","${u.location || ""}","${u.period}","${u.workingDays}","${u.totalAmount}"\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=food-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  subscribe, getStatus, bulkDisableFromNextWeek, undoBulkDisable,
  enableNextWeekOnly, enableYear, disableYear, getCalendar, getReport, downloadReport
};
