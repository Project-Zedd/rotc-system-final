const { BaseModel } = require('./index');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const { logger } = require('../utils/logger');

class AdminModel extends BaseModel {
  constructor() {
    super('admin');
  }

  // Find admin by username
  async findByUsername(username) {
    const result = await query(
      'SELECT * FROM admin WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  // Find admin by email
  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM admin WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  // Create new admin
  async createAdmin(data) {
    const { username, password, email, role = 'scanner_admin' } = data;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    
    const result = await query(
      `INSERT INTO admin (username, password, email, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, role, created_at`,
      [username, hashedPassword, email, role]
    );
    
    return result.rows[0];
  }

  // Verify password
  async verifyPassword(admin, password) {
    return bcrypt.compare(password, admin.password);
  }

  // Update password
  async updatePassword(adminId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    
    const result = await query(
      'UPDATE admin SET password = $1 WHERE id = $2 RETURNING id',
      [hashedPassword, adminId]
    );
    
    return result.rows[0];
  }

  // Update last login
  async updateLastLogin(adminId) {
    const result = await query(
      'UPDATE admin SET last_login = CURRENT_TIMESTAMP WHERE id = $1 RETURNING last_login',
      [adminId]
    );
    return result.rows[0];
  }

  // Enable/disable 2FA
  async update2FA(adminId, secret, enabled = true) {
    const result = await query(
      'UPDATE admin SET two_fa_secret = $1, two_fa_enabled = $2 WHERE id = $3 RETURNING *',
      [secret, enabled, adminId]
    );
    return result.rows[0];
  }

  // Get 2FA secret
  async get2FASecret(adminId) {
    const result = await query(
      'SELECT two_fa_secret, two_fa_enabled FROM admin WHERE id = $1',
      [adminId]
    );
    return result.rows[0];
  }

  // Update WebAuthn credentials
  async updateWebAuthnCredentials(adminId, credentials) {
    const result = await query(
      'UPDATE admin SET webauthn_credentials = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(credentials), adminId]
    );
    return result.rows[0];
  }

  // Get WebAuthn credentials
  async getWebAuthnCredentials(adminId) {
    const result = await query(
      'SELECT webauthn_credentials FROM admin WHERE id = $1',
      [adminId]
    );
    
    if (result.rows[0] && result.rows[0].webauthn_credentials) {
      return result.rows[0].webauthn_credentials;
    }
    return null;
  }

  // Update admin role
  async updateRole(adminId, newRole) {
    const result = await query(
      'UPDATE admin SET role = $1 WHERE id = $2 RETURNING *',
      [newRole, adminId]
    );
    return result.rows[0];
  }

  // Get all admins (excluding passwords)
  async getAllAdmins() {
    const result = await query(
      `SELECT id, username, email, role, two_fa_enabled, last_login, created_at 
       FROM admin 
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  // Get admins by role
  async getByRole(role) {
    const result = await query(
      `SELECT id, username, email, role, two_fa_enabled, last_login, created_at 
       FROM admin 
       WHERE role = $1 
       ORDER BY username`,
      [role]
    );
    return result.rows;
  }

  // Delete admin (with restrictions)
  async deleteAdmin(adminId, requestingAdminId) {
    // Prevent self-deletion
    if (adminId === requestingAdminId) {
      throw new Error('Cannot delete your own admin account');
    }

    // Check if this is the last super admin
    const superAdminCount = await query(
      'SELECT COUNT(*) FROM admin WHERE role = $1',
      ['super_admin']
    );
    
    const adminToDelete = await this.findById(adminId);
    
    if (adminToDelete.role === 'super_admin' && parseInt(superAdminCount.rows[0].count) <= 1) {
      throw new Error('Cannot delete the last super admin');
    }

    const result = await query(
      'DELETE FROM admin WHERE id = $1 RETURNING id, username',
      [adminId]
    );
    
    return result.rows[0];
  }

  // Check if username exists
  async usernameExists(username, excludeId = null) {
    let queryText = 'SELECT COUNT(*) FROM admin WHERE username = $1';
    const params = [username];
    
    if (excludeId) {
      queryText += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await query(queryText, params);
    return parseInt(result.rows[0].count) > 0;
  }

  // Check if email exists
  async emailExists(email, excludeId = null) {
    let queryText = 'SELECT COUNT(*) FROM admin WHERE email = $1';
    const params = [email];
    
    if (excludeId) {
      queryText += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await query(queryText, params);
    return parseInt(result.rows[0].count) > 0;
  }

  // Get admin statistics
  async getStatistics() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_admins,
        COUNT(CASE WHEN role = 'super_admin' THEN 1 END) as super_admin_count,
        COUNT(CASE WHEN role = 'scanner_admin' THEN 1 END) as scanner_admin_count,
        COUNT(CASE WHEN two_fa_enabled = true THEN 1 END) as two_fa_enabled_count,
        COUNT(CASE WHEN webauthn_credentials IS NOT NULL THEN 1 END) as webauthn_enabled_count
      FROM admin
    `);
    
    return result.rows[0];
  }

  // Validate admin data
  validateAdminData(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate) {
      // Validation for new admin
      if (!data.username || data.username.length < 3) {
        errors.push('Username must be at least 3 characters long');
      }
      
      if (!data.password || data.password.length < 6) {
        errors.push('Password must be at least 6 characters long');
      }
      
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Valid email is required');
      }
    }

    // Validate role
    if (data.role && !['super_admin', 'scanner_admin'].includes(data.role)) {
      errors.push('Invalid role. Must be either super_admin or scanner_admin');
    }

    // Validate username format (alphanumeric and underscore only)
    if (data.username && !/^[a-zA-Z0-9_]+$/.test(data.username)) {
      errors.push('Username can only contain letters, numbers, and underscores');
    }

    return errors;
  }

  // Create password reset token
  async createPasswordResetToken(adminId) {
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    
    // Store token in database (you might want to create a separate table for this)
    await query(
      `INSERT INTO password_reset_tokens (admin_id, token, expires_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (admin_id) 
       DO UPDATE SET token = $2, expires_at = $3`,
      [adminId, token, expires]
    );
    
    return token;
  }

  // Verify password reset token
  async verifyPasswordResetToken(token) {
    const result = await query(
      `SELECT admin_id FROM password_reset_tokens 
       WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Delete the token after verification
    await query(
      'DELETE FROM password_reset_tokens WHERE token = $1',
      [token]
    );
    
    return result.rows[0].admin_id;
  }
}

module.exports = new AdminModel();
