const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const CryptoJS = require('crypto-js');

class OfflineSyncModel extends BaseModel {
  constructor() {
    super('offline_sync_queue');
  }

  // Add encrypted data to sync queue
  async addToQueue(deviceId, encryptedData) {
    const result = await query(
      `INSERT INTO offline_sync_queue (device_id, encrypted_data) 
       VALUES ($1, $2) 
       RETURNING *`,
      [deviceId, encryptedData]
    );
    
    return result.rows[0];
  }

  // Get pending sync items for a device
  async getPendingByDevice(deviceId, limit = 100) {
    const result = await query(
      `SELECT * FROM offline_sync_queue 
       WHERE device_id = $1 AND sync_status = 'pending'
       ORDER BY created_at ASC
       LIMIT $2`,
      [deviceId, limit]
    );
    
    return result.rows;
  }

  // Get all pending sync items
  async getAllPending(limit = 1000) {
    const result = await query(
      `SELECT * FROM offline_sync_queue 
       WHERE sync_status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }

  // Process sync item
  async processSyncItem(syncId, attendanceModel, duplicateScanModel, settingsModel) {
    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the sync item
      const syncResult = await client.query(
        `SELECT * FROM offline_sync_queue 
         WHERE id = $1 AND sync_status = 'pending'
         FOR UPDATE`,
        [syncId]
      );
      
      if (syncResult.rows.length === 0) {
        throw new Error('Sync item not found or already processed');
      }
      
      const syncItem = syncResult.rows[0];
      
      // Update status to processing
      await client.query(
        `UPDATE offline_sync_queue 
         SET sync_status = 'processing' 
         WHERE id = $1`,
        [syncId]
      );
      
      // Decrypt the data
      const decryptedData = this.decryptData(syncItem.encrypted_data);
      const scans = JSON.parse(decryptedData);
      
      // Process each scan
      const results = [];
      for (const scan of scans) {
        try {
          // Check for duplicates within the window
          const duplicateWindowSeconds = await settingsModel.getDuplicateScanWindowSeconds();
          const existingScans = await attendanceModel.checkDuplicateScan(
            scan.cadet_id,
            new Date(scan.time_in),
            duplicateWindowSeconds
          );
          
          let attendanceRecord;
          let isDuplicate = false;
          
          if (existingScans.length > 0) {
            // Mark as duplicate but still record
            isDuplicate = true;
            attendanceRecord = await attendanceModel.createAttendance({
              ...scan,
              is_duplicate: true,
              duplicate_of: existingScans[0].id,
              sync_status: 'synced',
              device_id: syncItem.device_id
            });
            
            // Record in duplicate_scans table
            const timeDifference = Math.abs(
              new Date(scan.time_in) - new Date(existingScans[0].time_in)
            ) / 1000; // Convert to seconds
            
            await duplicateScanModel.recordDuplicate(
              existingScans[0].id,
              attendanceRecord.id,
              Math.round(timeDifference)
            );
          } else {
            // Normal attendance record
            attendanceRecord = await attendanceModel.createAttendance({
              ...scan,
              sync_status: 'synced',
              device_id: syncItem.device_id
            });
          }
          
          results.push({
            success: true,
            attendanceId: attendanceRecord.id,
            isDuplicate,
            originalScanId: scan.id
          });
        } catch (error) {
          logger.error('Error processing scan:', error);
          results.push({
            success: false,
            error: error.message,
            originalScanId: scan.id
          });
        }
      }
      
      // Update sync status to completed
      await client.query(
        `UPDATE offline_sync_queue 
         SET sync_status = 'completed', synced_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [syncId]
      );
      
      await client.query('COMMIT');
      
      return {
        syncId,
        deviceId: syncItem.device_id,
        totalScans: scans.length,
        results
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Update sync status to failed
      await query(
        `UPDATE offline_sync_queue 
         SET sync_status = 'failed' 
         WHERE id = $1`,
        [syncId]
      );
      
      logger.error('Error processing sync item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Batch process sync items
  async batchProcess(limit = 100, attendanceModel, duplicateScanModel, settingsModel) {
    const pendingItems = await this.getAllPending(limit);
    const results = [];
    
    for (const item of pendingItems) {
      try {
        const result = await this.processSyncItem(
          item.id,
          attendanceModel,
          duplicateScanModel,
          settingsModel
        );
        results.push(result);
      } catch (error) {
        logger.error(`Failed to process sync item ${item.id}:`, error);
        results.push({
          syncId: item.id,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }

  // Encrypt data using AES-256
  encryptData(data) {
    const key = process.env.ENCRYPTION_KEY || 'default-32-character-encryption-key';
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  }

  // Decrypt data using AES-256
  decryptData(encryptedData) {
    const key = process.env.ENCRYPTION_KEY || 'default-32-character-encryption-key';
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Get sync statistics
  async getStatistics(deviceId = null) {
    let whereClause = '';
    const params = [];
    
    if (deviceId) {
      whereClause = 'WHERE device_id = $1';
      params.push(deviceId);
    }
    
    const result = await query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN sync_status = 'processing' THEN 1 END) as processing_count,
        COUNT(CASE WHEN sync_status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_count,
        device_id,
        COUNT(*) as device_count
      FROM offline_sync_queue
      ${whereClause}
      GROUP BY device_id
      ORDER BY device_count DESC
    `, params);
    
    const stats = result.rows[0] || {};
    const deviceBreakdown = result.rows.map(row => ({
      deviceId: row.device_id,
      count: parseInt(row.device_count)
    }));
    
    return {
      totalItems: parseInt(stats.total_items) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      processingCount: parseInt(stats.processing_count) || 0,
      completedCount: parseInt(stats.completed_count) || 0,
      failedCount: parseInt(stats.failed_count) || 0,
      deviceBreakdown
    };
  }

  // Get sync history
  async getSyncHistory(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;

    // Build WHERE clause
    const whereClauses = [];
    
    if (filters.deviceId) {
      whereClauses.push(`device_id = $${paramIndex}`);
      queryParams.push(filters.deviceId);
      paramIndex++;
    }
    
    if (filters.status) {
      whereClauses.push(`sync_status = $${paramIndex}`);
      queryParams.push(filters.status);
      paramIndex++;
    }
    
    if (filters.startDate && filters.endDate) {
      whereClauses.push(`created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      queryParams.push(filters.startDate, filters.endDate);
      paramIndex += 2;
    }

    if (whereClauses.length > 0) {
      whereClause = `WHERE ${whereClauses.join(' AND ')}`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM offline_sync_queue ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    queryParams.push(limit, offset);
    const dataQuery = `
      SELECT 
        id,
        device_id,
        sync_status,
        created_at,
        synced_at,
        CASE 
          WHEN sync_status = 'completed' THEN synced_at - created_at
          ELSE NULL
        END as sync_duration
      FROM offline_sync_queue
      ${whereClause}
      ORDER BY created_at DESC
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

  // Retry failed sync items
  async retryFailed(deviceId = null) {
    let queryText = `
      UPDATE offline_sync_queue 
      SET sync_status = 'pending' 
      WHERE sync_status = 'failed'
    `;
    const params = [];
    
    if (deviceId) {
      queryText += ' AND device_id = $1';
      params.push(deviceId);
    }
    
    queryText += ' RETURNING id';
    
    const result = await query(queryText, params);
    
    logger.info(`Reset ${result.rowCount} failed sync items to pending`);
    return result.rowCount;
  }

  // Clean old completed sync items
  async cleanOldSyncItems(days = 30) {
    const result = await query(
      `DELETE FROM offline_sync_queue 
       WHERE sync_status = 'completed' 
       AND synced_at < NOW() - INTERVAL '${days} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned ${result.rowCount} old sync items`);
    return result.rowCount;
  }

  // Get device sync status
  async getDeviceSyncStatus(deviceId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_syncs,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed,
        MAX(synced_at) as last_sync,
        MIN(CASE WHEN sync_status = 'pending' THEN created_at END) as oldest_pending
      FROM offline_sync_queue
      WHERE device_id = $1
    `, [deviceId]);
    
    const status = result.rows[0];
    
    return {
      deviceId,
      totalSyncs: parseInt(status.total_syncs) || 0,
      pendingCount: parseInt(status.pending) || 0,
      failedCount: parseInt(status.failed) || 0,
      lastSyncAt: status.last_sync,
      oldestPendingAt: status.oldest_pending,
      isInSync: parseInt(status.pending) === 0 && parseInt(status.failed) === 0
    };
  }

  // Validate sync data structure
  validateSyncData(data) {
    const errors = [];
    
    if (!Array.isArray(data)) {
      errors.push('Sync data must be an array of scans');
      return errors;
    }
    
    data.forEach((scan, index) => {
      if (!scan.cadet_id) {
        errors.push(`Scan ${index}: cadet_id is required`);
      }
      if (!scan.date) {
        errors.push(`Scan ${index}: date is required`);
      }
      if (!scan.time_in) {
        errors.push(`Scan ${index}: time_in is required`);
      }
      if (!scan.status || !['P', 'L', 'A'].includes(scan.status)) {
        errors.push(`Scan ${index}: valid status (P/L/A) is required`);
      }
      if (!scan.semester || scan.semester < 1 || scan.semester > 2) {
        errors.push(`Scan ${index}: semester must be 1 or 2`);
      }
      if (!scan.week_number || scan.week_number < 1 || scan.week_number > 15) {
        errors.push(`Scan ${index}: week_number must be between 1 and 15`);
      }
    });
    
    return errors;
  }
}

module.exports = new OfflineSyncModel();
