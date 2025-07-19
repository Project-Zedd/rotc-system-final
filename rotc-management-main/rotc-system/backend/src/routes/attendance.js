const express = require('express');
const router = express.Router();
const AttendanceModel = require('../models/attendance');
const CadetModel = require('../models/cadet');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const ipWhitelistMiddleware = require('../middleware/ipWhitelist');
const { logger } = require('../utils/logger');
const { body, query, validationResult } = require('express-validator');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

// Middleware stack for admin routes
const adminMiddleware = [authenticate, adminOnly, ipWhitelistMiddleware];

// POST /scan - Admin-only QR code scan processing
router.post('/scan', adminMiddleware, [
  body('qrCode').isString().notEmpty(),
  body('action').isIn(['time_in', 'time_out']),
  body('deviceId').optional().isString(),
  body('photo').optional().isString(),
  body('location').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { qrCode, action, deviceId, photo, location } = req.body;

    // Decrypt and parse QR code to get student_number
    // For simplicity, assume qrCode is student_number here
    const studentNumber = qrCode;

    // Find cadet by student_number
    const cadet = await CadetModel.findByStudentNumber(studentNumber);
    if (!cadet) {
      return res.status(404).json({ success: false, message: 'Cadet not found' });
    }

    // Check scanner state and time restrictions (to be implemented)
    // Calculate semester and week number
    const { semester, week_number } = AttendanceModel.calculateSemesterAndWeek(new Date());

    // Get today's attendance for cadet
    const todayAttendance = await AttendanceModel.getTodayAttendance(cadet.id);

    if (action === 'time_in') {
      if (todayAttendance && todayAttendance.time_in) {
        return res.status(400).json({ success: false, message: 'Time-in already recorded' });
      }

      // Create attendance record with time_in
      const attendance = await AttendanceModel.createAttendance({
        cadet_id: cadet.id,
        date: new Date().toISOString().slice(0, 10),
        time_in: new Date(),
        status: 'P', // Default to Present, logic to adjust later
        semester,
        week_number,
        photo,
        location,
        device_id: deviceId
      });

      // TODO: Emit real-time notification via Socket.IO

      return res.json({ success: true, message: 'Time-in recorded', attendance });
    } else if (action === 'time_out') {
      if (!todayAttendance || !todayAttendance.time_in) {
        return res.status(400).json({ success: false, message: 'No time-in record found for today' });
      }
      if (todayAttendance.time_out) {
        return res.status(400).json({ success: false, message: 'Time-out already recorded' });
      }

      // Update time_out and status
      const updatedAttendance = await AttendanceModel.updateTimeOut(todayAttendance.id, new Date(), todayAttendance.status);

      // TODO: Emit real-time notification via Socket.IO

      return res.json({ success: true, message: 'Time-out recorded', attendance: updatedAttendance });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    logger.error('Error processing scan:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /sync-scans - Sync offline scans
router.post('/sync-scans', adminMiddleware, async (req, res) => {
  try {
    const scans = req.body.scans;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({ success: false, message: 'No scans provided' });
    }

    // Batch create attendance records
    const attendanceRecords = await AttendanceModel.batchCreateAttendance(scans);

    // TODO: Emit real-time notifications

    return res.json({ success: true, message: 'Scans synced', count: attendanceRecords.length });
  } catch (error) {
    logger.error('Error syncing scans:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /attendance-logs - Get attendance logs with filters and pagination
router.get('/attendance-logs', adminMiddleware, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('date').optional().isISO8601(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('status').optional().isIn(['P', 'L', 'A']),
  query('semester').optional().isInt({ min: 1, max: 2 }),
  query('weekNumber').optional().isInt({ min: 1, max: 15 }),
  query('search').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const filters = {
      date: req.query.date,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      semester: req.query.semester,
      weekNumber: req.query.weekNumber,
      search: req.query.search
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const logs = await AttendanceModel.getAttendanceLogs(filters, pagination);
    return res.json({ success: true, data: logs.data, pagination: logs.pagination });
  } catch (error) {
    logger.error('Error fetching attendance logs:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /attendance-summary - Get attendance summary for a date
router.get('/attendance-summary', adminMiddleware, [
  query('date').optional().isISO8601()
], async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const summary = await AttendanceModel.getAttendanceSummary(date);
    return res.json({ success: true, summary });
  } catch (error) {
    logger.error('Error fetching attendance summary:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /attendance-map - Get attendance geolocation data for map
router.get('/attendance-map', adminMiddleware, [
  query('date').optional().isISO8601()
], async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const locations = await AttendanceModel.getAttendanceByLocation(date);
    return res.json({ success: true, locations });
  } catch (error) {
    logger.error('Error fetching attendance map data:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /manual-attendance - Manually record event attendance
router.post('/manual-attendance', adminMiddleware, [
  body('cadetId').isInt(),
  body('eventName').isString().notEmpty(),
  body('timeIn').optional().isISO8601(),
  body('timeOut').optional().isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { cadetId, eventName, timeIn, timeOut } = req.body;

    // Calculate semester and week number based on timeIn or current date
    const date = timeIn ? new Date(timeIn) : new Date();
    const { semester, week_number } = AttendanceModel.calculateSemesterAndWeek(date);

    // Determine status based on timeIn and cutoff (to be implemented)
    const status = 'P'; // Default to Present for manual attendance

    const attendance = await AttendanceModel.createAttendance({
      cadet_id: cadetId,
      date: date.toISOString().slice(0, 10),
      time_in: timeIn ? new Date(timeIn) : new Date(),
      time_out: timeOut ? new Date(timeOut) : null,
      event_name: eventName,
      status,
      semester,
      week_number
    });

    return res.json({ success: true, message: 'Manual attendance recorded', attendance });
  } catch (error) {
    logger.error('Error recording manual attendance:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
