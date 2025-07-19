const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class SettingsModel extends BaseModel {
  constructor() {
    super('settings');
  }

  // Get setting by key
  async get(key) {
    const result = await query(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Parse JSON values if applicable
    try {
      return JSON.parse(result.rows[0].value);
    } catch {
      return result.rows[0].value;
    }
  }

  // Set setting value
  async set(key, value, adminId = null) {
    // Convert value to string (JSON if object/array)
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    const result = await query(
      `INSERT INTO settings (key, value, updated_by) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [key, stringValue, adminId]
    );
    
    return result.rows[0];
  }

  // Get all settings
  async getAll() {
    const result = await query(
      'SELECT key, value, updated_at, updated_by FROM settings ORDER BY key'
    );
    
    // Parse values and create object
    const settings = {};
    result.rows.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });
    
    return settings;
  }

  // Get scanner state
  async getScannerState() {
    const state = await this.get('scanner_state');
    return state === 'on';
  }

  // Set scanner state
  async setScannerState(state, adminId) {
    return this.set('scanner_state', state ? 'on' : 'off', adminId);
  }

  // Get evening enabled state
  async getEveningEnabled() {
    const state = await this.get('evening_enabled');
    return state === 'true';
  }

  // Set evening enabled state
  async setEveningEnabled(enabled, adminId) {
    return this.set('evening_enabled', enabled ? 'true' : 'false', adminId);
  }

  // Get present cutoff time
  async getPresentCutoffTime() {
    const time = await this.get('present_cutoff_time');
    return time || '07:31';
  }

  // Set present cutoff time
  async setPresentCutoffTime(time, adminId) {
    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new Error('Invalid time format. Use HH:MM');
    }
    return this.set('present_cutoff_time', time, adminId);
  }

  // Get attendance cooldown minutes
  async getAttendanceCooldownMinutes() {
    const minutes = await this.get('attendance_cooldown_minutes');
    return parseInt(minutes) || 15;
  }

  // Set attendance cooldown minutes
  async setAttendanceCooldownMinutes(minutes, adminId) {
    return this.set('attendance_cooldown_minutes', parseInt(minutes), adminId);
  }

  // Get allowed IPs
  async getAllowedIPs() {
    const ips = await this.get('allowed_ips');
    return Array.isArray(ips) ? ips : [];
  }

  // Set allowed IPs
  async setAllowedIPs(ips, adminId) {
    if (!Array.isArray(ips)) {
      throw new Error('IPs must be an array');
    }
    return this.set('allowed_ips', ips, adminId);
  }

  // Add allowed IP
  async addAllowedIP(ip, adminId) {
    const currentIPs = await this.getAllowedIPs();
    if (!currentIPs.includes(ip)) {
      currentIPs.push(ip);
      return this.setAllowedIPs(currentIPs, adminId);
    }
    return null;
  }

  // Remove allowed IP
  async removeAllowedIP(ip, adminId) {
    const currentIPs = await this.getAllowedIPs();
    const filteredIPs = currentIPs.filter(allowedIP => allowedIP !== ip);
    if (filteredIPs.length !== currentIPs.length) {
      return this.setAllowedIPs(filteredIPs, adminId);
    }
    return null;
  }

  // Get device tokens
  async getDeviceTokens() {
    const tokens = await this.get('device_tokens');
    return Array.isArray(tokens) ? tokens : [];
  }

  // Add device token
  async addDeviceToken(token, adminId) {
    const currentTokens = await this.getDeviceTokens();
    if (!currentTokens.includes(token)) {
      currentTokens.push(token);
      return this.set('device_tokens', currentTokens, adminId);
    }
    return null;
  }

  // Remove device token
  async removeDeviceToken(token, adminId) {
    const currentTokens = await this.getDeviceTokens();
    const filteredTokens = currentTokens.filter(t => t !== token);
    if (filteredTokens.length !== currentTokens.length) {
      return this.set('device_tokens', filteredTokens, adminId);
    }
    return null;
  }

  // Get duplicate scan window seconds
  async getDuplicateScanWindowSeconds() {
    const seconds = await this.get('duplicate_scan_window_seconds');
    return parseInt(seconds) || 5;
  }

  // Set duplicate scan window seconds
  async setDuplicateScanWindowSeconds(seconds, adminId) {
    return this.set('duplicate_scan_window_seconds', parseInt(seconds), adminId);
  }

  // Get offline sync interval minutes
  async getOfflineSyncIntervalMinutes() {
    const minutes = await this.get('offline_sync_interval_minutes');
    return parseInt(minutes) || 10;
  }

  // Set offline sync interval minutes
  async setOfflineSyncIntervalMinutes(minutes, adminId) {
    return this.set('offline_sync_interval_minutes', parseInt(minutes), adminId);
  }

  // Get Google Sheets poll interval minutes
  async getGoogleSheetsPollIntervalMinutes() {
    const minutes = await this.get('google_sheets_poll_interval_minutes');
    return parseInt(minutes) || 10;
  }

  // Set Google Sheets poll interval minutes
  async setGoogleSheetsPollIntervalMinutes(minutes, adminId) {
    return this.set('google_sheets_poll_interval_minutes', parseInt(minutes), adminId);
  }

  // Get system configuration
  async getSystemConfig() {
    const settings = await this.getAll();
    
    return {
      scanner: {
        enabled: settings.scanner_state === 'on',
        eveningEnabled: settings.evening_enabled === 'true',
        presentCutoffTime: settings.present_cutoff_time || '07:31',
        cooldownMinutes: parseInt(settings.attendance_cooldown_minutes) || 15,
        duplicateScanWindowSeconds: parseInt(settings.duplicate_scan_window_seconds) || 5
      },
      security: {
        allowedIPs: Array.isArray(settings.allowed_ips) ? settings.allowed_ips : [],
        deviceTokens: Array.isArray(settings.device_tokens) ? settings.device_tokens : []
      },
      sync: {
        offlineSyncIntervalMinutes: parseInt(settings.offline_sync_interval_minutes) || 10,
        googleSheetsPollIntervalMinutes: parseInt(settings.google_sheets_poll_interval_minutes) || 10
      }
    };
  }

  // Update multiple settings at once
  async updateMultiple(settings, adminId) {
    const results = [];
    
    for (const [key, value] of Object.entries(settings)) {
      try {
        const result = await this.set(key, value, adminId);
        results.push({ key, success: true, result });
      } catch (error) {
        logger.error(`Error updating setting ${key}:`, error);
        results.push({ key, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Reset to defaults
  async resetToDefaults(adminId) {
    const defaults = {
      scanner_state: 'off',
      evening_enabled: 'false',
      present_cutoff_time: '07:31',
      attendance_cooldown_minutes: '15',
      allowed_ips: '[]',
      device_tokens: '[]',
      duplicate_scan_window_seconds: '5',
      offline_sync_interval_minutes: '10',
      google_sheets_poll_interval_minutes: '10'
    };
    
    return this.updateMultiple(defaults, adminId);
  }

  // Get settings history (if audit logging is enabled)
  async getSettingsHistory(key = null, limit = 50) {
    let queryText = `
      SELECT 
        al.timestamp,
        al.details,
        a.username as admin_username
      FROM audit_logs al
      LEFT JOIN admin a ON al.admin_id = a.id
      WHERE al.action = 'settings_update'
    `;
    
    const params = [];
    if (key) {
      queryText += ` AND al.details::jsonb->>'key' = $1`;
      params.push(key);
    }
    
    queryText += ` ORDER BY al.timestamp DESC LIMIT ${limit}`;
    
    const result = await query(queryText, params);
    return result.rows;
  }
}

module.exports = new SettingsModel();
