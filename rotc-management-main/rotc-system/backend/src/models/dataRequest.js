const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class DataRequestModel extends BaseModel {
  constructor() {
    super('data_requests');
  }

  // Create a data request
  async createRequest(cadetId, requestType) {
    // Validate request type
    if (!['view', 'delete'].includes(requestType)) {
      throw new Error('Invalid request type. Must be either "view" or "delete"');
    }

    // Check if there's already a pending request
    const existingRequest = await query(
      `SELECT id FROM data_requests 
       WHERE cadet_id = $1 AND request_type = $2 AND status = 'pending'`,
      [cadetId, requestType]
    );

    if (existingRequest.rows.length > 0) {
      throw new Error(`A pending ${requestType} request already exists`);
    }

    const result = await query(
      `INSERT INTO data_requests (cadet_id, request_type) 
       VALUES ($1, $2) 
       RETURNING *`,
      [cadetId, requestType]
    );
    
    return result.rows[0];
  }

  // Get pending data requests with cadet info
  async getPendingRequests(pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    // Get total count
    const countResult = await query(
      "SELECT COUNT(*) FROM data_requests WHERE status = 'pending'"
    );
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated data
    const dataResult = await query(
      `SELECT 
        dr.*,
        c.student_number,
        c.first_name,
        c.last_name,
        c.email,
        c.contact_number,
        a.username as reviewed_by_username
       FROM data_requests dr
       JOIN cadets c ON dr.cadet_id = c.id
       LEFT JOIN admin a ON dr.reviewed_by = a.id
       WHERE dr.status = 'pending'
       ORDER BY dr.submitted_at DESC
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

  // Get requests by cadet
  async getByCadet(cadetId, includeProcessed = false) {
    let queryText = `
      SELECT 
        dr.*,
        a.username as reviewed_by_username
       FROM data_requests dr
       LEFT JOIN admin a ON dr.reviewed_by = a.id
       WHERE dr.cadet_id = $1
    `;
    
    if (!includeProcessed) {
      queryText += " AND dr.status = 'pending'";
    }
    
    queryText += ' ORDER BY dr.submitted_at DESC';
    
    const result = await query(queryText, [cadetId]);
    return result.rows;
  }

  // Approve data view request
  async approveViewRequest(requestId, adminId) {
    const result = await query(
      `UPDATE data_requests 
       SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending' AND request_type = 'view'
       RETURNING *`,
      [adminId, requestId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('View request not found or already processed');
    }
    
    return result.rows[0];
  }

  // Approve data deletion request
  async approveDeleteRequest(requestId, adminId) {
    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get the request
      const requestResult = await client.query(
        `SELECT * FROM data_requests 
         WHERE id = $1 AND status = 'pending' AND request_type = 'delete'`,
        [requestId]
      );
      
      if (requestResult.rows.length === 0) {
        throw new Error('Delete request not found or already processed');
      }
      
      const request = requestResult.rows[0];
      
      // Delete cadet data (cascade will handle related records)
      await client.query(
        'DELETE FROM cadets WHERE id = $1',
        [request.cadet_id]
      );
      
      // Mark the request as approved
      await client.query(
        `UPDATE data_requests 
         SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [adminId, requestId]
      );
      
      await client.query('COMMIT');
      
      return { success: true, deletedCadetId: request.cadet_id };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error approving delete request:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Reject data request
  async rejectRequest(requestId, adminId, reason = null) {
    const result = await query(
      `UPDATE data_requests 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [adminId, requestId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Data request not found or already processed');
    }
    
    return result.rows[0];
  }

  // Bulk approve requests
  async bulkApprove(requestIds, adminId) {
    const client = await query.getClient();
    const results = { approved: [], failed: [] };
    
    try {
      await client.query('BEGIN');
      
      for (const requestId of requestIds) {
        try {
          // Get the request
          const requestResult = await client.query(
            'SELECT * FROM data_requests WHERE id = $1 AND status = $2',
            [requestId, 'pending']
          );
          
          if (requestResult.rows.length === 0) {
            results.failed.push({ id: requestId, reason: 'Not found or already processed' });
            continue;
          }
          
          const request = requestResult.rows[0];
          
          if (request.request_type === 'delete') {
            // Delete cadet data
            await client.query(
              'DELETE FROM cadets WHERE id = $1',
              [request.cadet_id]
            );
          }
          
          // Mark the request as approved
          await client.query(
            `UPDATE data_requests 
             SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [adminId, requestId]
          );
          
          results.approved.push(requestId);
        } catch (error) {
          results.failed.push({ id: requestId, reason: error.message });
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

  // Bulk reject requests
  async bulkReject(requestIds, adminId) {
    const result = await query(
      `UPDATE data_requests 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [adminId, requestIds]
    );
    
    return {
      rejected: result.rows.map(row => row.id),
      failed: requestIds.filter(id => !result.rows.find(row => row.id === id))
    };
  }

  // Get request statistics
  async getStatistics() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN request_type = 'view' THEN 1 END) as view_requests,
        COUNT(CASE WHEN request_type = 'delete' THEN 1 END) as delete_requests,
        request_type,
        status,
        COUNT(*) as type_status_count
      FROM data_requests
      GROUP BY request_type, status
      ORDER BY request_type, status
    `);
    
    const stats = result.rows[0] || {};
    const breakdown = result.rows.map(row => ({
      type: row.request_type,
      status: row.status,
      count: parseInt(row.type_status_count)
    }));
    
    return {
      totalRequests: parseInt(stats.total_requests) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      approvedCount: parseInt(stats.approved_count) || 0,
      rejectedCount: parseInt(stats.rejected_count) || 0,
      viewRequests: parseInt(stats.view_requests) || 0,
      deleteRequests: parseInt(stats.delete_requests) || 0,
      breakdown
    };
  }

  // Export cadet data (for approved view requests)
  async exportCadetData(cadetId) {
    // Get cadet information
    const cadetResult = await query(
      'SELECT * FROM cadets WHERE id = $1',
      [cadetId]
    );
    
    if (cadetResult.rows.length === 0) {
      throw new Error('Cadet not found');
    }
    
    const cadet = cadetResult.rows[0];
    
    // Get attendance records
    const attendanceResult = await query(
      `SELECT * FROM attendance 
       WHERE cadet_id = $1 
       ORDER BY date DESC, time_in DESC`,
      [cadetId]
    );
    
    // Get pending updates
    const updatesResult = await query(
      'SELECT * FROM pending_updates WHERE cadet_id = $1 ORDER BY submitted_at DESC',
      [cadetId]
    );
    
    // Get data requests
    const requestsResult = await query(
      'SELECT * FROM data_requests WHERE cadet_id = $1 ORDER BY submitted_at DESC',
      [cadetId]
    );
    
    return {
      personalInfo: {
        ...cadet,
        // Remove sensitive fields
        password: undefined,
        two_fa_secret: undefined,
        webauthn_credentials: undefined
      },
      attendanceRecords: attendanceResult.rows,
      pendingUpdates: updatesResult.rows,
      dataRequests: requestsResult.rows,
      exportedAt: new Date().toISOString()
    };
  }

  // Check if cadet has pending requests
  async hasPendingRequests(cadetId) {
    const result = await query(
      "SELECT COUNT(*) FROM data_requests WHERE cadet_id = $1 AND status = 'pending'",
      [cadetId]
    );
    
    return parseInt(result.rows[0].count) > 0;
  }

  // Get requests by type and status
  async getByTypeAndStatus(requestType, status, limit = 100) {
    const result = await query(
      `SELECT 
        dr.*,
        c.student_number,
        c.first_name,
        c.last_name,
        a.username as reviewed_by_username
       FROM data_requests dr
       JOIN cadets c ON dr.cadet_id = c.id
       LEFT JOIN admin a ON dr.reviewed_by = a.id
       WHERE dr.request_type = $1 AND dr.status = $2
       ORDER BY dr.submitted_at DESC
       LIMIT $3`,
      [requestType, status, limit]
    );
    
    return result.rows;
  }

  // Clean old processed requests
  async cleanOldRequests(days = 365) {
    const result = await query(
      `DELETE FROM data_requests 
       WHERE status IN ('approved', 'rejected') 
       AND reviewed_at < NOW() - INTERVAL '${days} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned ${result.rowCount} old data requests`);
    return result.rowCount;
  }

  // Get GDPR compliance report
  async getGDPRReport() {
    const result = await query(`
      SELECT 
        DATE_TRUNC('month', submitted_at) as month,
        request_type,
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at))/3600)::numeric(10,2) as avg_response_hours
      FROM data_requests
      WHERE reviewed_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', submitted_at), request_type, status
      ORDER BY month DESC, request_type, status
    `);
    
    return result.rows;
  }
}

module.exports = new DataRequestModel();
