const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class AttendanceModel extends BaseModel {
  constructor() {
    super('attendance');
  }

  // Create attendance record
  async createAttendance(data) {
    const {
      cadet_id,
      date,
      time_in,
      time_out,
      photo,
      event_name,
      status,
      semester,
      week_number,
      location,
      is_duplicate,
      duplicate_of,
      sync_status = 'synced',
      device_id
    } = data;

    const queryText = `
      INSERT INTO attendance (
        cadet_id, date, time_in, time_out, photo, event_name,
        status, semester, week_number, location, is_duplicate,
        duplicate_of, sync_status, device_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `;

    const values = [
      cadet_id, date, time_in, time_out, photo, event_name,
      status, semester, week_number, location ? JSON.stringify(location) : null,
      is_duplicate || false, duplicate_of, sync_status, device_id
    ];

    const result = await query(queryText, values);
    return result.rows[0];
  }

  // Get attendance by cadet and date
  async getByDateAndCadet(cadetId, date) {
    const result = await query(
      'SELECT * FROM attendance WHERE cadet_id = $1 AND date = $2 ORDER BY time_in DESC',
      [cadetId, date]
    );
    return result.rows;
  }

  // Get today's attendance for a cadet
  async getTodayAttendance(cadetId) {
    const result = await query(
      `SELECT * FROM attendance 
       WHERE cadet_id = $1 AND date = CURRENT_DATE 
       ORDER BY time_in DESC LIMIT 1`,
      [cadetId]
    );
    return result.rows[0] || null;
  }

  // Update time out
  async updateTimeOut(attendanceId, timeOut, status) {
    const result = await query(
      `UPDATE attendance 
       SET time_out = $1, status = $2 
       WHERE id = $3 
       RETURNING *`,
      [timeOut, status, attendanceId]
    );
    return result.rows[0];
  }

  // Get attendance logs with filters
  async getAttendanceLogs(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;

    // Build WHERE clause
    const whereClauses = [];
    
    if (filters.date) {
      whereClauses.push(`a.date = $${paramIndex}`);
      queryParams.push(filters.date);
      paramIndex++;
    }
    
    if (filters.startDate && filters.endDate) {
      whereClauses.push(`a.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      queryParams.push(filters.startDate, filters.endDate);
      paramIndex += 2;
    }
    
    if (filters.status) {
      whereClauses.push(`a.status = $${paramIndex}`);
      queryParams.push(filters.status);
      paramIndex++;
    }
    
    if (filters.semester) {
      whereClauses.push(`a.semester = $${paramIndex}`);
      queryParams.push(filters.semester);
      paramIndex++;
    }
    
    if (filters.weekNumber) {
      whereClauses.push(`a.week_number = $${paramIndex}`);
      queryParams.push(filters.weekNumber);
      paramIndex++;
    }
    
    if (filters.cadetId) {
      whereClauses.push(`a.cadet_id = $${paramIndex}`);
      queryParams.push(filters.cadetId);
      paramIndex++;
    }
    
    if (filters.eventName) {
      whereClauses.push(`a.event_name = $${paramIndex}`);
      queryParams.push(filters.eventName);
      paramIndex++;
    }
    
    if (filters.search) {
      whereClauses.push(`(
        LOWER(c.student_number) LIKE LOWER($${paramIndex}) OR
        LOWER(c.first_name) LIKE LOWER($${paramIndex}) OR
        LOWER(c.last_name) LIKE LOWER($${paramIndex})
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
      FROM attendance a
      JOIN cadets c ON a.cadet_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    queryParams.push(limit, offset);
    const dataQuery = `
      SELECT 
        a.*,
        c.student_number,
        c.first_name,
        c.last_name,
        c.mi,
        c.course,
        c.photo as cadet_photo
      FROM attendance a
      JOIN cadets c ON a.cadet_id = c.id
      ${whereClause}
      ORDER BY a.date DESC, a.time_in DESC
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

  // Get attendance summary
  async getAttendanceSummary(date = null) {
    let queryText = 'SELECT * FROM attendance_summary';
    const params = [];
    
    if (date) {
      queryText += ' WHERE date = $1';
      params.push(date);
    } else {
      queryText += ' WHERE date = CURRENT_DATE';
    }
    
    const result = await query(queryText, params);
    return result.rows[0] || {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      total_count: 0
    };
  }

  // Get weekly records for export
  async getWeeklyRecords(semester = null) {
    let queryText = `
      SELECT 
        c.id as cadet_id,
        c.last_name,
        c.first_name,
        c.mi,
        a.semester,
        a.week_number,
        a.status
      FROM cadets c
      LEFT JOIN attendance a ON c.id = a.cadet_id
    `;
    
    const params = [];
    if (semester) {
      queryText += ' WHERE a.semester = $1 OR a.semester IS NULL';
      params.push(semester);
    }
    
    queryText += ' ORDER BY c.last_name, c.first_name, a.semester, a.week_number';
    
    const result = await query(queryText, params);
    
    // Transform data into weekly format
    const cadetsMap = new Map();
    
    result.rows.forEach(row => {
      const key = row.cadet_id;
      
      if (!cadetsMap.has(key)) {
        cadetsMap.set(key, {
          name: `${row.last_name}, ${row.first_name} ${row.mi || ''}`.trim(),
          weeks: {}
        });
      }
      
      if (row.semester && row.week_number) {
        const weekKey = `semester_${row.semester}_week_${row.week_number}`;
        cadetsMap.get(key).weeks[weekKey] = row.status;
      }
    });
    
    return Array.from(cadetsMap.values());
  }

  // Calculate semester and week number
  calculateSemesterAndWeek(date) {
    const startDate = new Date('2025-01-01');
    const currentDate = new Date(date);
    
    const daysDiff = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 0) {
      return { semester: null, week_number: null };
    }
    
    // Each semester has 15 weeks (105 days)
    const semester = Math.floor(daysDiff / 105) + 1;
    const daysIntoSemester = daysDiff % 105;
    const weekNumber = Math.floor(daysIntoSemester / 7) + 1;
    
    // Cap at semester 2, week 15
    if (semester > 2) {
      return { semester: 2, week_number: 15 };
    }
    
    return {
      semester: semester,
      week_number: Math.min(weekNumber, 15)
    };
  }

  // Check for duplicate scans
  async checkDuplicateScan(cadetId, timestamp, windowSeconds = 5) {
    const windowStart = new Date(timestamp.getTime() - windowSeconds * 1000);
    const windowEnd = new Date(timestamp.getTime() + windowSeconds * 1000);
    
    const result = await query(
      `SELECT * FROM attendance 
       WHERE cadet_id = $1 
       AND time_in BETWEEN $2 AND $3
       ORDER BY time_in DESC`,
      [cadetId, windowStart, windowEnd]
    );
    
    return result.rows;
  }

  // Mark cadets absent who haven't timed out
  async markAbsentCadets(date, cutoffTime) {
    const result = await query(
      `UPDATE attendance 
       SET status = 'A' 
       WHERE date = $1 
       AND time_out IS NULL 
       AND time_in < $2
       AND status != 'A'
       RETURNING cadet_id`,
      [date, cutoffTime]
    );
    
    return result.rows;
  }

  // Get attendance by location (for mapping)
  async getAttendanceByLocation(date = null) {
    let queryText = `
      SELECT 
        a.id,
        a.cadet_id,
        a.location,
        a.time_in,
        a.status,
        c.student_number,
        c.first_name,
        c.last_name
      FROM attendance a
      JOIN cadets c ON a.cadet_id = c.id
      WHERE a.location IS NOT NULL
    `;
    
    const params = [];
    if (date) {
      queryText += ' AND a.date = $1';
      params.push(date);
    } else {
      queryText += ' AND a.date = CURRENT_DATE';
    }
    
    const result = await query(queryText, params);
    return result.rows;
  }

  // Get cadet attendance history
  async getCadetAttendanceHistory(cadetId, options = {}) {
    const { limit = 100, offset = 0, semester, weekNumber } = options;
    
    let whereClause = 'WHERE cadet_id = $1';
    const params = [cadetId];
    let paramIndex = 2;
    
    if (semester) {
      whereClause += ` AND semester = $${paramIndex}`;
      params.push(semester);
      paramIndex++;
    }
    
    if (weekNumber) {
      whereClause += ` AND week_number = $${paramIndex}`;
      params.push(weekNumber);
      paramIndex++;
    }
    
    params.push(limit, offset);
    
    const queryText = `
      SELECT * FROM attendance
      ${whereClause}
      ORDER BY date DESC, time_in DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const result = await query(queryText, params);
    return result.rows;
  }

  // Get attendance statistics for a cadet
  async getCadetAttendanceStats(cadetId, semester = null) {
    let whereClause = 'WHERE cadet_id = $1';
    const params = [cadetId];
    
    if (semester) {
      whereClause += ' AND semester = $2';
      params.push(semester);
    }
    
    const queryText = `
      SELECT 
        COUNT(CASE WHEN status = 'P' THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'L' THEN 1 END) as late_count,
        COUNT(CASE WHEN status = 'A' THEN 1 END) as absent_count,
        COUNT(*) as total_count,
        semester,
        COUNT(DISTINCT week_number) as weeks_attended
      FROM attendance
      ${whereClause}
      GROUP BY semester
      ORDER BY semester
    `;
    
    const result = await query(queryText, params);
    return result.rows;
  }

  // Batch create attendance records
  async batchCreateAttendance(records) {
    if (records.length === 0) return [];
    
    const values = [];
    const placeholders = [];
    
    records.forEach((record, index) => {
      const baseIndex = index * 14 + 1;
      placeholders.push(`(
        $${baseIndex}, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3},
        $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7},
        $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11},
        $${baseIndex + 12}, $${baseIndex + 13}
      )`);
      
      values.push(
        record.cadet_id,
        record.date,
        record.time_in,
        record.time_out || null,
        record.photo || null,
        record.event_name || null,
        record.status,
        record.semester,
        record.week_number,
        record.location ? JSON.stringify(record.location) : null,
        record.is_duplicate || false,
        record.duplicate_of || null,
        record.sync_status || 'synced',
        record.device_id || null
      );
    });
    
    const queryText = `
      INSERT INTO attendance (
        cadet_id, date, time_in, time_out, photo, event_name,
        status, semester, week_number, location, is_duplicate,
        duplicate_of, sync_status, device_id
      ) VALUES ${placeholders.join(', ')}
      RETURNING *
    `;
    
    try {
      const result = await query(queryText, values);
      return result.rows;
    } catch (error) {
      logger.error('Batch create attendance error:', error);
      throw error;
    }
  }

  // Refresh materialized view
  async refreshSummary() {
    try {
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY attendance_summary');
      logger.info('Attendance summary refreshed');
    } catch (error) {
      logger.error('Error refreshing attendance summary:', error);
    }
  }
}

module.exports = new AttendanceModel();
