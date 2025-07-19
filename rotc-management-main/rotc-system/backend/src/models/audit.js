const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class AuditModel extends BaseModel {
  constructor() {
    super('audit_logs');
  }

  // Log audit event
  async log(adminId, action, details = {}, ipAddress = null, userAgent = null) {
    try {
      const result = await query(
        `INSERT INTO audit_logs (admin_id, action, details, ip_address, user_agent) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [adminId, action, JSON.stringify(details), ipAddress, userAgent]
      );
      
      return result.rows[0];
    } catch (error) {
      logger.error('Audit log error:', error);
      // Don't throw error to prevent disrupting main operations
      return null;
    }
  }

  // Get audit logs with filters
  async getAuditLogs(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;

    // Build WHERE clause
    const whereClauses = [];
    
    if (filters.adminId) {
      whereClauses.push(`al.admin_id = $${paramIndex}`);
      queryParams.push(filters.adminId);
      paramIndex++;
    }
    
    if (filters.action) {
      whereClauses.push(`al.action = $${paramIndex}`);
      queryParams.push(filters.action);
      paramIndex++;
    }
    
    if (filters.startDate && filters.endDate) {
      whereClauses.push(`al.timestamp BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      queryParams.push(filters.startDate, filters.endDate);
      paramIndex += 2;
    }
    
    if (filters.ipAddress) {
      whereClauses.push(`al.ip_address = $${paramIndex}`);
      queryParams.push(filters.ipAddress);
      paramIndex++;
    }
    
    if (filters.search) {
      whereClauses.push(`(
        al.action ILIKE $${paramIndex} OR
        al.details::text ILIKE $${paramIndex} OR
        a.username ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      whereClause = `WHERE ${whereClauses.join(' AND ')}`;
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM audit_logs al
      LEFT JOIN admin a ON al.admin_id = a.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    queryParams.push(limit, offset);
    const dataQuery = `
      SELECT 
        al.*,
        a.username as admin_username,
        a.role as admin_role
      FROM audit_logs al
      LEFT JOIN admin a ON al.admin_id = a.id
      ${whereClause}
      ORDER BY al.timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataResult = await query(dataQuery, queryParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  // Get audit logs by admin
  async getByAdmin(adminId, limit = 100) {
    const result = await query(
      `SELECT * FROM audit_logs 
       WHERE admin_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [adminId, limit]
    );
    return result.rows;
  }

  // Get audit logs by action
  async getByAction(action, limit = 100) {
    const result = await query(
      `SELECT al.*, a.username as admin_username 
       FROM audit_logs al
       LEFT JOIN admin a ON al.admin_id = a.id
       WHERE al.action = $1 
       ORDER BY al.timestamp DESC 
       LIMIT $2`,
      [action, limit]
    );
    return result.rows;
  }

  // Get recent security events
  async getSecurityEvents(hours = 24) {
    const securityActions = [
      'login_failed',
      'login_success',
      'password_changed',
      'admin_created',
      'admin_deleted',
      'role_changed',
      'ip_whitelist_changed',
      'scanner_state_changed',
      'unauthorized_access'
    ];
    
    const result = await query(
      `SELECT al.*, a.username as admin_username 
       FROM audit_logs al
       LEFT JOIN admin a ON al.admin_id = a.id
       WHERE al.action = ANY($1) 
       AND al.timestamp > NOW() - INTERVAL '${hours} hours'
       ORDER BY al.timestamp DESC`,
      [securityActions]
    );
    
    return result.rows;
  }

  // Get audit statistics
  async getStatistics(days = 30) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT admin_id) as unique_admins,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        COUNT(CASE WHEN action LIKE '%failed%' THEN 1 END) as failed_actions,
        COUNT(CASE WHEN action LIKE '%success%' THEN 1 END) as successful_actions,
        action,
        COUNT(*) as action_count
      FROM audit_logs
      WHERE timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY action
      ORDER BY action_count DESC
    `);
    
    const stats = result.rows[0] || {};
    const actionBreakdown = result.rows.map(row => ({
      action: row.action,
      count: parseInt(row.action_count)
    }));
    
    return {
      totalEvents: parseInt(stats.total_events) || 0,
      uniqueAdmins: parseInt(stats.unique_admins) || 0,
      activeDays: parseInt(stats.active_days) || 0,
      failedActions: parseInt(stats.failed_actions) || 0,
      successfulActions: parseInt(stats.successful_actions) || 0,
      actionBreakdown
    };
  }

  // Get IP address activity
  async getIPActivity(ipAddress, days = 7) {
    const result = await query(
      `SELECT 
        al.*,
        a.username as admin_username
       FROM audit_logs al
       LEFT JOIN admin a ON al.admin_id = a.id
       WHERE al.ip_address = $1 
       AND al.timestamp > NOW() - INTERVAL '${days} days'
       ORDER BY al.timestamp DESC`,
      [ipAddress]
    );
    
    return result.rows;
  }

  // Clean old audit logs
  async cleanOldLogs(retentionDays = 90) {
    const result = await query(
      `DELETE FROM audit_logs 
       WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned ${result.rowCount} old audit logs`);
    return result.rowCount;
  }

  // Common audit actions
  static ACTIONS = {
    // Authentication
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    LOGOUT: 'logout',
    PASSWORD_CHANGED: 'password_changed',
    PASSWORD_RESET_REQUESTED: 'password_reset_requested',
    TWO_FA_ENABLED: 'two_fa_enabled',
    TWO_FA_DISABLED: 'two_fa_disabled',
    WEBAUTHN_REGISTERED: 'webauthn_registered',
    
    // Admin management
    ADMIN_CREATED: 'admin_created',
    ADMIN_UPDATED: 'admin_updated',
    ADMIN_DELETED: 'admin_deleted',
    ROLE_CHANGED: 'role_changed',
    
    // Cadet management
    CADET_IMPORTED: 'cadet_imported',
    CADET_UPDATED: 'cadet_updated',
    CADET_DELETED: 'cadet_deleted',
    ID_CARD_GENERATED: 'id_card_generated',
    
    // Attendance
    ATTENDANCE_SCANNED: 'attendance_scanned',
    ATTENDANCE_MANUAL: 'attendance_manual',
    ATTENDANCE_BULK_UPLOAD: 'attendance_bulk_upload',
    DUPLICATE_SCAN_REVIEWED: 'duplicate_scan_reviewed',
    
    // Settings
    SETTINGS_UPDATED: 'settings_updated',
    SCANNER_STATE_CHANGED: 'scanner_state_changed',
    IP_WHITELIST_CHANGED: 'ip_whitelist_changed',
    
    // Events
    EVENT_CREATED: 'event_created',
    EVENT_UPDATED: 'event_updated',
    EVENT_DELETED: 'event_deleted',
    
    // Reports
    REPORT_GENERATED: 'report_generated',
    REPORT_EXPORTED: 'report_exported',
    
    // Security
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    
    // Data requests
    DATA_REQUEST_APPROVED: 'data_request_approved',
    DATA_REQUEST_REJECTED: 'data_request_rejected',
    PROFILE_UPDATE_APPROVED: 'profile_update_approved',
    PROFILE_UPDATE_REJECTED: 'profile_update_rejected'
  };

  // Helper method to log common actions
  async logAction(action, adminId, details = {}, req = null) {
    const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
    const userAgent = req ? req.get('user-agent') : null;
    
    return this.log(adminId, action, details, ipAddress, userAgent);
  }

  // Log login attempt
  async logLogin(adminId, success, details = {}, req = null) {
    const action = success ? AuditModel.ACTIONS.LOGIN_SUCCESS : AuditModel.ACTIONS.LOGIN_FAILED;
    return this.logAction(action, adminId, details, req);
  }

  // Log settings change
  async logSettingsChange(adminId, settingKey, oldValue, newValue, req = null) {
    return this.logAction(
      AuditModel.ACTIONS.SETTINGS_UPDATED,
      adminId,
      { settingKey, oldValue, newValue },
      req
    );
  }

  // Log attendance scan
  async logAttendanceScan(adminId, cadetId, studentNumber, status, req = null) {
    return this.logAction(
      AuditModel.ACTIONS.ATTENDANCE_SCANNED,
      adminId,
      { cadetId, studentNumber, status },
      req
    );
  }

  // Get suspicious activities
  async getSuspiciousActivities(hours = 24) {
    const suspiciousPatterns = [
      'login_failed',
      'unauthorized_access',
      'suspicious_activity'
    ];
    
    const result = await query(`
      SELECT 
        al.*,
        a.username as admin_username,
        COUNT(*) OVER (PARTITION BY al.ip_address) as ip_count,
        COUNT(*) OVER (PARTITION BY al.admin_id) as admin_count
      FROM audit_logs al
      LEFT JOIN admin a ON al.admin_id = a.id
      WHERE al.action = ANY($1)
      AND al.timestamp > NOW() - INTERVAL '${hours} hours'
      ORDER BY al.timestamp DESC
    `, [suspiciousPatterns]);
    
    return result.rows;
  }

  // Get failed login attempts
  async getFailedLoginAttempts(hours = 24, threshold = 5) {
    const result = await query(`
      SELECT 
        ip_address,
        COUNT(*) as attempt_count,
        MAX(timestamp) as last_attempt,
        array_agg(DISTINCT details->>'username') as usernames_tried
      FROM audit_logs
      WHERE action = 'login_failed'
      AND timestamp > NOW() - INTERVAL '${hours} hours'
      GROUP BY ip_address
      HAVING COUNT(*) >= $1
      ORDER BY attempt_count DESC
    `, [threshold]);
    
    return result.rows;
  }

  // Export audit logs
  async exportAuditLogs(filters = {}, format = 'json') {
    const logs = await this.getAuditLogs(filters, { limit: 10000 });
    
    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['Timestamp', 'Admin', 'Action', 'Details', 'IP Address', 'User Agent'];
      const rows = logs.data.map(log => [
        log.timestamp,
        log.admin_username || 'System',
        log.action,
        JSON.stringify(log.details),
        log.ip_address || 'N/A',
        log.user_agent || 'N/A'
      ]);
      
      return {
        headers,
        rows,
        format: 'csv'
      };
    }
    
    return {
      data: logs.data,
      format: 'json'
    };
  }
}

module.exports = new AuditModel();
