const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { getCadetByStudentNumber, updateCadetPassword } = require('../models/cadet');
const { getAdminByUsername, updateAdminPassword } = require('../models/admin');
const { logger } = require('../utils/logger');
const { sendEmail } = require('../utils/emailService');

class AuthService {
  constructor() {
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  }

  // Cadet Authentication
  async cadetLogin(studentNumber, password) {
    try {
      const cadet = await getCadetByStudentNumber(studentNumber);
      if (!cadet) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Check if this is the first login (password needs reset)
      const isFirstLogin = cadet.password_reset_required || false;
      
      // Verify password (default password is last name + birth year)
      const isValidPassword = await this.verifyPassword(password, cadet.password);
      
      if (!isValidPassword) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Check if password reset is required
      if (isFirstLogin) {
        return {
          success: true,
          token: null,
          requiresPasswordReset: true,
          message: 'Please reset your password for security'
        };
      }

      // Generate JWT token
      const token = this.generateCadetToken(cadet);
      
      return {
        success: true,
        token,
        cadet: {
          id: cadet.id,
          studentNumber: cadet.student_number,
          name: `${cadet.first_name} ${cadet.last_name}`,
          email: cadet.email,
          course: cadet.course
        },
        message: 'Login successful'
      };

    } catch (error) {
      logger.error('Error in cadet login:', error);
      throw error;
    }
  }

  async cadetResetPassword(studentNumber, newPassword, confirmPassword) {
    try {
      if (newPassword !== confirmPassword) {
        return { success: false, message: 'Passwords do not match' };
      }

      if (!this.validatePassword(newPassword)) {
        return { success: false, message: 'Password does not meet requirements' };
      }

      const cadet = await getCadetByStudentNumber(studentNumber);
      if (!cadet) {
        return { success: false, message: 'Cadet not found' };
      }

      const hashedPassword = await this.hashPassword(newPassword);
      
      await updateCadetPassword(cadet.id, hashedPassword, false);

      return {
        success: true,
        message: 'Password reset successfully'
      };

    } catch (error) {
      logger.error('Error resetting cadet password:', error);
      throw error;
    }
  }

  // Admin Authentication
  async adminLogin(username, password, twoFactorToken = null) {
    try {
      const admin = await getAdminByUsername(username);
      if (!admin) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, admin.password);
      if (!isValidPassword) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Check 2FA if enabled
      if (admin.two_fa_enabled) {
        if (!twoFactorToken) {
          return { success: false, requiresTwoFactor: true, message: 'Two-factor authentication required' };
        }

        const isValidToken = this.verifyTwoFactorToken(admin.two_fa_secret, twoFactorToken);
        if (!isValidToken) {
          return { success: false, message: 'Invalid two-factor token' };
        }
      }

      // Generate JWT token
      const token = this.generateAdminToken(admin);
      
      return {
        success: true,
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role
        },
        message: 'Login successful'
      };

    } catch (error) {
      logger.error('Error in admin login:', error);
      throw error;
    }
  }

  async adminResetPassword(adminId, newPassword, confirmPassword) {
    try {
      if (newPassword !== confirmPassword) {
        return { success: false, message: 'Passwords do not match' };
      }

      if (!this.validatePassword(newPassword)) {
        return { success: false, message: 'Password does not meet requirements' };
      }

      const hashedPassword = await this.hashPassword(newPassword);
      
      await updateAdminPassword(adminId, hashedPassword);

      return {
        success: true,
        message: 'Password reset successfully'
      };

    } catch (error) {
      logger.error('Error resetting admin password:', error);
      throw error;
    }
  }

  // Password Management
  async generateDefaultPassword(cadet) {
    // Default password: last name + 4-digit birth year
    const birthYear = cadet.dob ? cadet.dob.slice(-4) : '2000';
    const defaultPassword = `${cadet.last_name.toLowerCase()}${birthYear}`;
    return defaultPassword;
  }

  async setDefaultPassword(cadetId) {
    try {
      const cadet = await getCadetById(cadetId);
      if (!cadet) {
        throw new Error('Cadet not found');
      }

      const defaultPassword = await this.generateDefaultPassword(cadet);
      const hashedPassword = await this.hashPassword(defaultPassword);

      await updateCadetPassword(cadetId, hashedPassword, true);

      return {
        success: true,
        defaultPassword,
        message: 'Default password set successfully'
      };

    } catch (error) {
      logger.error('Error setting default password:', error);
      throw error;
    }
  }

  // Password Validation
  validatePassword(password) {
    if (!password || password.length < 8) {
      return false;
    }

    // Check for complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  }

  // Token Generation
  generateCadetToken(cadet) {
    return jwt.sign(
      {
        id: cadet.id,
        studentNumber: cadet.student_number,
        email: cadet.email
      },
      this.jwtSecret,
      { expiresIn: '24h' }
    );
  }

  generateAdminToken(admin) {
    return jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      },
      this.jwtSecret,
      { expiresIn: '8h' }
    );
  }

  // Password Utilities
  async hashPassword(password) {
    return await bcrypt.hash(password, this.bcryptRounds);
  }

  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Two-Factor Authentication
  generateTwoFactorSecret() {
    return speakeasy.generateSecret({
      name: 'ROTC System',
      issuer: 'ROTC Attendance'
    });
  }

  verifyTwoFactorToken(secret, token) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });
  }

  // Email Notifications
  async sendPasswordResetEmail(email, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const emailContent = `
      <h2>ROTC Password Reset</h2>
      <p>You have requested a password reset for your ROTC account.</p>
      <p>Please click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>If you did not request this, please ignore this email.</p>
    `;

    await sendEmail(email, 'ROTC Password Reset', emailContent);
  }

  async sendWelcomeEmail(email, studentNumber, defaultPassword) {
    const emailContent = `
      <h2>Welcome to ROTC Attendance System</h2>
      <p>Your account has been created successfully.</p>
      <p><strong>Student Number:</strong> ${studentNumber}</p>
      <p><strong>Default Password:</strong> ${defaultPassword}</p>
      <p>Please log in and change your password immediately for security.</p>
      <a href="${process.env.FRONTEND_URL}/login">Login Now</a>
    `;

    await sendEmail(email, 'Welcome to ROTC System', emailContent);
  }
}

module.exports = new AuthService();
