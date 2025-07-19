const express = require('express');
const router = express.Router();
const AdminModel = require('../models/admin');
const CadetModel = require('../models/cadet');
const { body, validationResult } = require('express-validator');
const { generateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');

// POST /login - Admin login with 2FA
router.post('/login', [
  body('username').isString().notEmpty(),
  body('password').isString().notEmpty(),
  body('twoFactorToken').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { username, password, twoFactorToken } = req.body;
    const admin = await AdminModel.findByUsername(username);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const passwordValid = await AdminModel.verifyPassword(admin, password);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Check 2FA if enabled
    if (admin.two_fa_enabled) {
      if (!twoFactorToken) {
        return res.status(401).json({ success: false, message: 'Two-factor authentication token required' });
      }
      const verified = speakeasy.totp.verify({
        secret: admin.two_fa_secret,
        encoding: 'base32',
        token: twoFactorToken
      });
      if (!verified) {
        return res.status(401).json({ success: false, message: 'Invalid two-factor authentication token' });
      }
    }

    // Generate JWT token
    const token = generateToken(admin);

    // Update last login
    await AdminModel.updateLastLogin(admin.id);

    return res.json({ success: true, token, admin: { id: admin.id, username: admin.username, role: admin.role } });
  } catch (error) {
    logger.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /cadet-login - Cadet login
router.post('/cadet-login', [
  body('studentNumber').isString().notEmpty(),
  body('password').isString().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { studentNumber, password } = req.body;
    const cadet = await CadetModel.findByStudentNumber(studentNumber);
    if (!cadet) {
      return res.status(401).json({ success: false, message: 'Invalid student number or password' });
    }

    // For simplicity, assume password is dob in DDMMMYY format (e.g., 07Aug04)
    const dobFormatted = cadet.dob.replace(/-/g, '');
    if (password !== dobFormatted) {
      return res.status(401).json({ success: false, message: 'Invalid student number or password' });
    }

    // Generate JWT token
    const token = generateToken({ id: cadet.id, userType: 'cadet', studentNumber: cadet.student_number });

    return res.json({ success: true, token, cadet: { id: cadet.id, studentNumber: cadet.student_number, firstName: cadet.first_name, lastName: cadet.last_name } });
  } catch (error) {
    logger.error('Cadet login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /reset-password - Admin password reset request
router.post('/reset-password', [
  body('email').isEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email } = req.body;
    const admin = await AdminModel.findByEmail(email);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    // Create password reset token
    const token = await AdminModel.createPasswordResetToken(admin.id);

    // Send email with token (using nodemailer)
    const transporter = nodemailer.createTransport({
      // Configure your SMTP or SES here
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'ROTC Admin Password Reset',
      text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
      html: `<p>You requested a password reset. Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });

    return res.json({ success: true, message: 'Password reset email sent' });
  } catch (error) {
    logger.error('Password reset error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
