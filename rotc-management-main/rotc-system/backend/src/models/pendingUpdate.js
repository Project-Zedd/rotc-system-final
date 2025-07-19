const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class PendingUpdateModel extends BaseModel {
  constructor() {
    super('pending_updates');
  }

  // Create a pending update request
  async createUpdateRequest(cadetId, field, newValue) {
    const result = await query(
      `INSERT INTO pending_updates (cadet_id, field, new_value) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [cadetId, field, newValue]
    );
    
    return result.rows[0];
  }

  // Get pending updates with cadet info
  async getPendingUpdates(pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    // Get total count
    const countResult = await query(
      "SELECT COUNT(*) FROM pending_updates WHERE status = 'pending'"
    );
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated data
    const dataResult = await query(
      `SELECT 
        pu.*,
        c.student_number,
        c.first_name,
        c.last_name,
        c.email as current_email,
        c.contact_number as current_contact_number,
        a.username as reviewed_by_username
       FROM pending_updates pu
       JOIN cadets c ON pu.cadet_id = c.id
       LEFT JOIN admin a ON pu.reviewed_by = a.id
       WHERE pu.status = 'pending'
       ORDER BY pu.submitted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
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

  // Get updates by cadet
  async getByCadet(cadetId, includeProcessed = false) {
    let queryText = `
      SELECT 
        pu.*,
        a.username as reviewed_by_username
       FROM pending_updates pu
       LEFT JOIN admin a ON pu.reviewed_by = a.id
       WHERE pu.cadet_id = $1
    `;
    
    if (!includeProcessed) {
      queryText += " AND pu.status = 'pending'";
    }
    
    queryText += ' ORDER BY pu.submitted_at DESC';
    
    const result = await query(queryText, [cadetId]);
    return result.rows;
  }

  // Approve update request
  async approveUpdate(updateId, adminId) {
    // Start transaction
    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the update request
      const updateResult = await client.query(
        'SELECT * FROM pending_updates WHERE id = $1 AND status = $2',
        [updateId, 'pending']
      );
      
      if (updateResult.rows.length === 0) {
        throw new Error('Update request not found or already processed');
      }
      
      const update = updateResult.rows[0];
      
      // Update the cadet record
      const updateQuery = `UPDATE cadets SET ${update.field} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;
      await client.query(updateQuery, [update.new_value, update.cadet_id]);
      
      // Mark the update as approved
      await client.query(
        `UPDATE pending_updates 
         SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [adminId, updateId]
      );
      
      await client.query('COMMIT');
      
      return { success: true, update };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error approving update:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Reject update request
  async rejectUpdate(updateId, adminId, reason = null) {
    const result = await query(
      `UPDATE pending_updates 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [adminId, updateId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Update request not found or already processed');
    }
    
    return result.rows[0];
  }

  // Bulk approve updates
  async bulkApprove(updateIds, adminId) {
    const client = await query.getClient();
    const results = { approved: [], failed: [] };
    
    try {
      await client.query('BEGIN');
      
      for (const updateId of updateIds) {
        try {
          // Get the update request
          const updateResult = await client.query(
            'SELECT * FROM pending_updates WHERE id = $1 AND status = $2',
            [updateId, 'pending']
          );
          
          if (updateResult.rows.length === 0) {
            results.failed.push({ id: updateId, reason: 'Not found or already processed' });
            continue;
          }
          
          const update = updateResult.rows[0];
          
          // Update the cadet record
          const updateQuery = `UPDATE cadets SET ${update.field} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;
          await client.query(updateQuery, [update.new_value, update.cadet_id]);
          
          // Mark the update as approved
          await client.query(
            `UPDATE pending_updates 
             SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [adminId, updateId]
          );
          
          results.approved.push(updateId);
        } catch (error) {
          results.failed.push({ id: updateId, reason: error.message });
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

  // Bulk reject updates
  async bulkReject(updateIds, adminId) {
    const result = await query(
      `UPDATE pending_updates 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [adminId, updateIds]
    );
    
    return {
      rejected: result.rows.map(row => row.id),
      failed: updateIds.filter(id => !result.rows.find(row => row.id === id))
    };
  }

  // Get update statistics
  async getStatistics() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        field,
        COUNT(*) as field_count
      FROM pending_updates
      GROUP BY field
      ORDER BY field_count DESC
    `);
    
    const stats = result.rows[0] || {};
    const fieldBreakdown = result.rows.map(row => ({
      field: row.field,
      count: parseInt(row.field_count)
    }));
    
    return {
      totalRequests: parseInt(stats.total_requests) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      approvedCount: parseInt(stats.approved_count) || 0,
      rejectedCount: parseInt(stats.rejected_count) || 0,
      fieldBreakdown
    };
  }

  // Check if cadet has pending updates
  async hasPendingUpdates(cadetId) {
    const result = await query(
      "SELECT COUNT(*) FROM pending_updates WHERE cadet_id = $1 AND status = 'pending'",
      [cadetId]
    );
    
    return parseInt(result.rows[0].count) > 0;
  }

  // Get allowed update fields
  static getAllowedFields() {
    return ['contact_number', 'email', 'address', 'emergency_contact'];
  }

  // Validate update request
  validateUpdateRequest(field, value) {
    const errors = [];
    
    // Check if field is allowed
    if (!PendingUpdateModel.getAllowedFields().includes(field)) {
      errors.push(`Field '${field}' is not allowed to be updated`);
    }
    
    // Validate based on field
    switch (field) {
      case 'contact_number':
        if (!/^0\d{10}$/.test(value)) {
          errors.push('Contact number must be 11 digits starting with 0');
        }
        break;
      
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push('Invalid email format');
        }
        break;
      
      case 'address':
        if (!value || value.trim().length < 10) {
          errors.push('Address must be at least 10 characters long');
        }
        break;
      
      case 'emergency_contact':
        if (!/^0\d{10}$/.test(value)) {
          errors.push('Emergency contact must be 11 digits starting with 0');
        }
        break;
    }
    
    return errors;
  }

  // Clean old processed updates
  async cleanOldUpdates(days = 180) {
    const result = await query(
      `DELETE FROM pending_updates 
       WHERE status IN ('approved', 'rejected') 
       AND reviewed_at < NOW() - INTERVAL '${days} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned ${result.rowCount} old update requests`);
    return result.rowCount;
  }
}

module.exports = new PendingUpdateModel();
