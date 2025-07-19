const express = require('express');
const router = express.Router();
const AdminModel = require('../models/admin');
const SettingsModel = require('../models/settings');
const EventModel = require('../models/event');
const AuditModel = require('../models/audit');
const { authenticate } = require('../middleware/auth');
const { superAdminOnly, adminOnly } = require('../middleware/roleCheck');
const ipWhitelistMiddleware = require('../middleware/ipWhitelist');
const { body, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

// Middleware stack for super admin routes
const superAdminMiddleware = [authenticate, superAdminOnly, ipWhitelistMiddleware];
// Middleware stack for any admin routes
const adminMiddleware = [authenticate, adminOnly, ipWhitelistMiddleware];

// POST /toggle-scanner - Toggle scanner state (on/off)
router.post('/toggle-scanner', superAdminMiddleware, [
  body('state').isIn(['on', 'off'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const { state } = req.body;
    await SettingsModel.updateSetting('scanner_state', state);
    await AuditModel.logAction(req.user.id, 'toggle_scanner', `Scanner state set to ${state}`);
    return res.json({ success: true, message: `Scanner state set to ${state}` });
  } catch (error) {
    logger.error('Error toggling scanner state:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /toggle-evening - Toggle evening scanning (on/off)
router.post('/toggle-evening', superAdminMiddleware, [
  body('enabled').isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const { enabled } = req.body;
    await SettingsModel.updateSetting('evening_enabled', enabled.toString());
    await AuditModel.logAction(req.user.id, 'toggle_evening', `Evening scanning set to ${enabled}`);
    return res.json({ success: true, message: `Evening scanning set to ${enabled}` });
  } catch (error) {
    logger.error('Error toggling evening scanning:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /manage-roles - Manage admin roles (assign roles)
router.post('/manage-roles', superAdminMiddleware, [
  body('adminId').isInt(),
  body('role').isIn(['super_admin', 'scanner_admin'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const { adminId, role } = req.body;
    const updatedAdmin = await AdminModel.updateRole(adminId, role);
    await AuditModel.logAction(req.user.id, 'manage_roles', `Set admin ${adminId} role to ${role}`);
    return res.json({ success: true, message: 'Admin role updated', admin: updatedAdmin });
  } catch (error) {
    logger.error('Error managing admin roles:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /manage-ips - Manage IP whitelisting (add/remove IPs)
router.post('/manage-ips', superAdminMiddleware, [
  body('allowedIPs').isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const { allowedIPs } = req.body;
    await SettingsModel.updateSetting('allowed_ips', JSON.stringify(allowedIPs));
    await AuditModel.logAction(req.user.id, 'manage_ips', `Updated allowed IPs`);
    return res.json({ success: true, message: 'Allowed IPs updated' });
  } catch (error) {
    logger.error('Error managing IP whitelist:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /schedule-event - Schedule an event
router.post('/schedule-event', adminMiddleware, [
  body('eventName').isString().notEmpty(),
  body('eventDate').isISO8601(),
  body('autoEnableScanner').isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const { eventName, eventDate, autoEnableScanner } = req.body;
    const event = await EventModel.createEvent({
      event_name: eventName,
      event_date: eventDate,
      auto_enable_scanner: autoEnableScanner
    });
    await AuditModel.logAction(req.user.id, 'schedule_event', `Scheduled event ${eventName} on ${eventDate}`);
    // TODO: Send push notifications to cadets about upcoming event
    return res.json({ success: true, message: 'Event scheduled', event });
  } catch (error) {
    logger.error('Error scheduling event:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
