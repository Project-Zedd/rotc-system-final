const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class DuplicateScanModel extends BaseModel {
  constructor() {
    super('duplicate_scans');
  }

  // Record a duplicate scan
  async recordDuplicate(originalScanId, duplicateScanId, timeDifference) {
    const result = await query(
      `INSERT INTO duplicate_scans (original_scan_id, duplicate_scan_id, time_difference) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [originalScanId, duplicateScanId, timeDifference]
    );
    
    return result.rows[0];
  }

  // Get pending duplicate scans for review
  async getPendingDuplicates(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    let whereClause = "WHERE ds.review_status = 'pending'";
    const queryParams = [];
    let paramIndex = 1;

    // Add filters
    if (filters.date) {
      whereClause += ` AND DATE(a1.date) = $${paramIndex}`;
      queryParams.push(filters.date);
      paramIndex++;
    }
    
    if (filters.cadetId) {
      whereClause += ` AND (a1.cadet_id = $${paramIndex} OR a2.cadet_id = $${paramIndex})`;
      queryParams.push(filters.cadetId);
      paramIndex++;
    }
    
    if (filters.minTimeDifference) {
      whereClause += ` AND ds.time_difference >= $${paramIndex}`;
      queryParams.push(filters.minTimeDifference);
      paramIndex++;
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM duplicate_scans ds
      JOIN attendance a1 ON ds.original_scan_id = a1.id
      JOIN attendance a2 ON ds.duplicate_scan_id = a2.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    queryParams.push(limit, offset);
    const dataQuery = `
      SELECT 
        ds.*,
        a1.id as original_id,
        a1.time_in as original_time_in,
        a1.time_out as original_time_out,
        a1.status as original_status,
        a1.event_name as original_event,
        a2.id as duplicate_id,
        a2.time_in as duplicate_time_in,
        a2.time_out as duplicate_time_out,
        a2.status as duplicate_status,
        a2.event_name as duplicate_event,
        c.id as cadet_id,
        c.student_number,
        c.first_name,
        c.last_name,
        c.course,
        c.photo as cadet_photo,
        admin.username as reviewed_by_username
      FROM duplicate_scans ds
      JOIN attendance a1 ON ds.original_scan_id = a1.id
      JOIN attendance a2 ON ds.duplicate_scan_id = a2.id
      JOIN cadets c ON a1.cadet_id = c.id
      LEFT JOIN admin ON ds.reviewed_by = admin.id
      ${whereClause}
      ORDER BY ds.created_at DESC
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

  // Review a duplicate scan
  async reviewDuplicate(duplicateId, adminId, decision) {
    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      throw new Error('Invalid decision. Must be either "approved" or "rejected"');
    }

    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the duplicate scan record
      const duplicateResult = await client.query(
        `SELECT * FROM duplicate_scans WHERE id = $1 AND review_status = 'pending'`,
        [duplicateId]
      );
      
      if (duplicateResult.rows.length === 0) {
        throw new Error('Duplicate scan not found or already reviewed');
      }
      
      const duplicate = duplicateResult.rows[0];
      
      if (decision === 'rejected') {
        // If rejected, delete the duplicate attendance record
        await client.query(
          'DELETE FROM attendance WHERE id = $1',
          [duplicate.duplicate_scan_id]
        );
        
        // Update the duplicate flag on the duplicate record to false
        await client.query(
          'UPDATE attendance SET is_duplicate = false WHERE id = $1',
          [duplicate.original_scan_id]
        );
      }
      
      // Update the duplicate scan review status
      await client.query(
        `UPDATE duplicate_scans 
         SET review_status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [decision, adminId, duplicateId]
      );
      
      await client.query('COMMIT');
      
      return { success: true, decision, duplicateId };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error reviewing duplicate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Bulk review duplicates
  async bulkReview(reviews, adminId) {
    const client = await query.getClient();
    const results = { processed: [], failed: [] };
    
    try {
      await client.query('BEGIN');
      
      for (const review of reviews) {
        try {
          const { duplicateId, decision } = review;
          
          // Validate decision
          if (!['approved', 'rejected'].includes(decision)) {
            results.failed.push({ 
              duplicateId, 
              reason: 'Invalid decision' 
            });
            continue;
          }
          
          // Get the duplicate scan record
          const duplicateResult = await client.query(
            `SELECT * FROM duplicate_scans WHERE id = $1 AND review_status = 'pending'`,
            [duplicateId]
          );
          
          if (duplicateResult.rows.length === 0) {
            results.failed.push({ 
              duplicateId, 
              reason: 'Not found or already reviewed' 
            });
            continue;
          }
          
          const duplicate = duplicateResult.rows[0];
          
          if (decision === 'rejected') {
            // Delete the duplicate attendance record
            await client.query(
              'DELETE FROM attendance WHERE id = $1',
              [duplicate.duplicate_scan_id]
            );
            
            // Update the duplicate flag
            await client.query(
              'UPDATE attendance SET is_duplicate = false WHERE id = $1',
              [duplicate.original_scan_id]
            );
          }
          
          // Update the review status
          await client.query(
            `UPDATE duplicate_scans 
             SET review_status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP 
             WHERE id = $3`,
            [decision, adminId, duplicateId]
          );
          
          results.processed.push({ duplicateId, decision });
        } catch (error) {
          results.failed.push({ 
            duplicateId: review.duplicateId, 
            reason: error.message 
          });
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    return results;
  }

  // Auto-approve duplicates within threshold
  async autoApproveDuplicates(thresholdSeconds = 2) {
    const result = await query(
      `UPDATE duplicate_scans 
       SET review_status = 'approved', reviewed_at = CURRENT_TIMESTAMP 
       WHERE review_status = 'pending' 
       AND time_difference <= $1
       RETURNING id`,
      [thresholdSeconds]
    );
    
    logger.info(`Auto-approved ${result.rowCount} duplicate scans`);
    return result.rowCount;
  }

  // Get duplicate statistics
  async getStatistics(days = 30) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_duplicates,
        COUNT(CASE WHEN review_status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN review_status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN review_status = 'rejected' THEN 1 END) as rejected_count,
        AVG(time_difference) as avg_time_difference,
        MIN(time_difference) as min_time_difference,
        MAX(time_difference) as max_time_difference,
        DATE(ds.created_at) as date,
        COUNT(*) as daily_count
      FROM duplicate_scans ds
      WHERE ds.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(ds.created_at)
      ORDER BY date DESC
    `);
    
    const stats = result.rows[0] || {};
    const dailyBreakdown = result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.daily_count)
    }));
    
    return {
      totalDuplicates: parseInt(stats.total_duplicates) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      approvedCount: parseInt(stats.approved_count) || 0,
      rejectedCount: parseInt(stats.rejected_count) || 0,
      avgTimeDifference: parseFloat(stats.avg_time_difference) || 0,
      minTimeDifference: parseInt(stats.min_time_difference) || 0,
      maxTimeDifference: parseInt(stats.max_time_difference) || 0,
      dailyBreakdown
    };
  }

  // Get cadets with most duplicates
  async getTopDuplicateCadets(limit = 10, days = 30) {
    const result = await query(`
      SELECT 
        c.id,
        c.student_number,
        c.first_name,
        c.last_name,
        c.course,
        COUNT(DISTINCT ds.id) as duplicate_count,
        COUNT(CASE WHEN ds.review_status = 'approved' THEN 1 END) as approved_duplicates,
        COUNT(CASE WHEN ds.review_status = 'rejected' THEN 1 END) as rejected_duplicates
      FROM duplicate_scans ds
      JOIN attendance a ON (ds.original_scan_id = a.id OR ds.duplicate_scan_id = a.id)
      JOIN cadets c ON a.cadet_id = c.id
      WHERE ds.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY c.id, c.student_number, c.first_name, c.last_name, c.course
      ORDER BY duplicate_count DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  // Check if scan is duplicate
  async checkIfDuplicate(attendanceId) {
    const result = await query(
      `SELECT COUNT(*) FROM duplicate_scans 
       WHERE original_scan_id = $1 OR duplicate_scan_id = $1`,
      [attendanceId]
    );
    
    return parseInt(result.rows[0].count) > 0;
  }

  // Get duplicate pattern analysis
  async getDuplicatePatterns() {
    const result = await query(`
      SELECT 
        EXTRACT(HOUR FROM a.time_in) as hour,
        EXTRACT(DOW FROM a.date) as day_of_week,
        COUNT(DISTINCT ds.id) as duplicate_count,
        AVG(ds.time_difference) as avg_time_diff
      FROM duplicate_scans ds
      JOIN attendance a ON ds.original_scan_id = a.id
      WHERE ds.created_at > NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM a.time_in), EXTRACT(DOW FROM a.date)
      ORDER BY duplicate_count DESC
    `);
    
    return result.rows.map(row => ({
      hour: parseInt(row.hour),
      dayOfWeek: parseInt(row.day_of_week),
      duplicateCount: parseInt(row.duplicate_count),
      avgTimeDiff: parseFloat(row.avg_time_diff)
    }));
  }

  // Clean old reviewed duplicates
  async cleanOldDuplicates(days = 90) {
    const result = await query(
      `DELETE FROM duplicate_scans 
       WHERE review_status IN ('approved', 'rejected') 
       AND reviewed_at < NOW() - INTERVAL '${days} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned ${result.rowCount} old duplicate scan records`);
    return result.rowCount;
  }
}

module.exports = new DuplicateScanModel();
