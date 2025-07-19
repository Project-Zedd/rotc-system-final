const { query, transaction } = require('../config/database');
const { logger } = require('../utils/logger');
const bcrypt = require('bcryptjs');

// Initialize database with default data
const initializeDatabase = async () => {
  try {
    // Check if admin exists
    const adminExists = await query('SELECT id FROM admin LIMIT 1');
    
    if (adminExists.rows.length === 0) {
      // Create default admin
      const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123', 10);
      await query(
        'INSERT INTO admin (username, password, email, role) VALUES ($1, $2, $3, $4)',
        [
          process.env.DEFAULT_ADMIN_USERNAME || 'admin',
          hashedPassword,
          process.env.DEFAULT_ADMIN_EMAIL || 'admin@rotc-system.com',
          'super_admin'
        ]
      );
      logger.info('Default admin user created');
    }

    // Refresh materialized view
    await query('REFRESH MATERIALIZED VIEW CONCURRENTLY attendance_summary');
    logger.info('Materialized views refreshed');

    return true;
  } catch (error) {
    logger.error('Database initialization error:', error);
    throw error;
  }
};

// Base model class with common functionality
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  // Find all records
  async findAll(conditions = {}, options = {}) {
    let queryText = `SELECT * FROM ${this.tableName}`;
    const queryParams = [];
    const whereClauses = [];

    // Build WHERE clause
    Object.entries(conditions).forEach(([key, value], index) => {
      whereClauses.push(`${key} = $${index + 1}`);
      queryParams.push(value);
    });

    if (whereClauses.length > 0) {
      queryText += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Add ORDER BY
    if (options.orderBy) {
      queryText += ` ORDER BY ${options.orderBy}`;
    }

    // Add LIMIT and OFFSET
    if (options.limit) {
      queryText += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      queryText += ` OFFSET ${options.offset}`;
    }

    const result = await query(queryText, queryParams);
    return result.rows;
  }

  // Find one record
  async findOne(conditions) {
    const records = await this.findAll(conditions, { limit: 1 });
    return records[0] || null;
  }

  // Find by ID
  async findById(id) {
    return this.findOne({ id });
  }

  // Create a new record
  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`);

    const queryText = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await query(queryText, values);
    return result.rows[0];
  }

  // Update a record
  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);

    const queryText = `
      UPDATE ${this.tableName}
      SET ${setClauses.join(', ')}
      WHERE id = $${keys.length + 1}
      RETURNING *
    `;

    const result = await query(queryText, [...values, id]);
    return result.rows[0];
  }

  // Delete a record
  async delete(id) {
    const queryText = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *`;
    const result = await query(queryText, [id]);
    return result.rows[0];
  }

  // Count records
  async count(conditions = {}) {
    let queryText = `SELECT COUNT(*) FROM ${this.tableName}`;
    const queryParams = [];
    const whereClauses = [];

    Object.entries(conditions).forEach(([key, value], index) => {
      whereClauses.push(`${key} = $${index + 1}`);
      queryParams.push(value);
    });

    if (whereClauses.length > 0) {
      queryText += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await query(queryText, queryParams);
    return parseInt(result.rows[0].count);
  }

  // Batch insert
  async batchInsert(records) {
    if (records.length === 0) return [];

    const keys = Object.keys(records[0]);
    const values = [];
    const placeholders = [];

    records.forEach((record, recordIndex) => {
      const recordPlaceholders = keys.map((key, keyIndex) => {
        const paramIndex = recordIndex * keys.length + keyIndex + 1;
        values.push(record[key]);
        return `$${paramIndex}`;
      });
      placeholders.push(`(${recordPlaceholders.join(', ')})`);
    });

    const queryText = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await query(queryText, values);
    return result.rows;
  }

  // Execute raw query
  async raw(queryText, params = []) {
    const result = await query(queryText, params);
    return result.rows;
  }

  // Transaction helper
  async transaction(callback) {
    return transaction(callback);
  }
}

// Import model instances (they will use BaseModel from this file)
const CadetModel = require('./cadet');
const AdminModel = require('./admin');
const AttendanceModel = require('./attendance');
const SettingsModel = require('./settings');
const EventModel = require('./event');
const AuditModel = require('./audit');
const PendingUpdateModel = require('./pendingUpdate');
const DataRequestModel = require('./dataRequest');
const DuplicateScanModel = require('./duplicateScan');
const OfflineSyncModel = require('./offlineSync');

// Export models and utilities
module.exports = {
  BaseModel,
  CadetModel,
  AdminModel,
  AttendanceModel,
  SettingsModel,
  EventModel,
  AuditModel,
  PendingUpdateModel,
  DataRequestModel,
  DuplicateScanModel,
  OfflineSyncModel,
  initializeDatabase
};
