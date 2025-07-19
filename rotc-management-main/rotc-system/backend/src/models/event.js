const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class EventModel extends BaseModel {
  constructor() {
    super('events');
  }

  // Create event
  async createEvent(data) {
    const { event_name, event_date, auto_enable_scanner = true, created_by } = data;
    
    const result = await query(
      `INSERT INTO events (event_name, event_date, auto_enable_scanner, created_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [event_name, event_date, auto_enable_scanner, created_by]
    );
    
    return result.rows[0];
  }

  // Get events by date
  async getByDate(date) {
    const result = await query(
      'SELECT * FROM events WHERE event_date = $1 ORDER BY created_at',
      [date]
    );
    return result.rows;
  }

  // Get upcoming events
  async getUpcomingEvents(limit = 10) {
    const result = await query(
      `SELECT e.*, a.username as created_by_username 
       FROM events e
       LEFT JOIN admin a ON e.created_by = a.id
       WHERE e.event_date >= CURRENT_DATE 
       ORDER BY e.event_date ASC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Get past events
  async getPastEvents(limit = 10) {
    const result = await query(
      `SELECT e.*, a.username as created_by_username 
       FROM events e
       LEFT JOIN admin a ON e.created_by = a.id
       WHERE e.event_date < CURRENT_DATE 
       ORDER BY e.event_date DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Get events in date range
  async getInDateRange(startDate, endDate) {
    const result = await query(
      `SELECT e.*, a.username as created_by_username 
       FROM events e
       LEFT JOIN admin a ON e.created_by = a.id
       WHERE e.event_date BETWEEN $1 AND $2 
       ORDER BY e.event_date`,
      [startDate, endDate]
    );
    return result.rows;
  }

  // Update event
  async updateEvent(eventId, data) {
    const { event_name, event_date, auto_enable_scanner } = data;
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    if (event_name !== undefined) {
      setClauses.push(`event_name = $${paramIndex}`);
      values.push(event_name);
      paramIndex++;
    }
    
    if (event_date !== undefined) {
      setClauses.push(`event_date = $${paramIndex}`);
      values.push(event_date);
      paramIndex++;
    }
    
    if (auto_enable_scanner !== undefined) {
      setClauses.push(`auto_enable_scanner = $${paramIndex}`);
      values.push(auto_enable_scanner);
      paramIndex++;
    }
    
    if (setClauses.length === 0) {
      return null;
    }
    
    values.push(eventId);
    
    const queryText = `
      UPDATE events 
      SET ${setClauses.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `;
    
    const result = await query(queryText, values);
    return result.rows[0];
  }

  // Delete event
  async deleteEvent(eventId) {
    const result = await query(
      'DELETE FROM events WHERE id = $1 RETURNING *',
      [eventId]
    );
    return result.rows[0];
  }

  // Get today's events
  async getTodayEvents() {
    const result = await query(
      `SELECT * FROM events 
       WHERE event_date = CURRENT_DATE 
       ORDER BY created_at`
    );
    return result.rows;
  }

  // Get events that should auto-enable scanner
  async getAutoEnableEvents(date = null) {
    let queryText = 'SELECT * FROM events WHERE auto_enable_scanner = true';
    const params = [];
    
    if (date) {
      queryText += ' AND event_date = $1';
      params.push(date);
    } else {
      queryText += ' AND event_date = CURRENT_DATE';
    }
    
    const result = await query(queryText, params);
    return result.rows;
  }

  // Check if event exists on date
  async eventExistsOnDate(date) {
    const result = await query(
      'SELECT COUNT(*) FROM events WHERE event_date = $1',
      [date]
    );
    return parseInt(result.rows[0].count) > 0;
  }

  // Get event statistics
  async getEventStatistics() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN event_date >= CURRENT_DATE THEN 1 END) as upcoming_events,
        COUNT(CASE WHEN event_date < CURRENT_DATE THEN 1 END) as past_events,
        COUNT(CASE WHEN event_date = CURRENT_DATE THEN 1 END) as today_events,
        COUNT(CASE WHEN auto_enable_scanner = true THEN 1 END) as auto_enable_count
      FROM events
    `);
    
    return result.rows[0];
  }

  // Get events with attendance count
  async getEventsWithAttendance(limit = 20) {
    const result = await query(`
      SELECT 
        e.*,
        a.username as created_by_username,
        COUNT(DISTINCT att.cadet_id) as attendance_count
      FROM events e
      LEFT JOIN admin a ON e.created_by = a.id
      LEFT JOIN attendance att ON att.event_name = e.event_name AND att.date = e.event_date
      GROUP BY e.id, a.username
      ORDER BY e.event_date DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  // Validate event data
  validateEventData(data) {
    const errors = [];
    
    if (!data.event_name || data.event_name.trim().length === 0) {
      errors.push('Event name is required');
    }
    
    if (!data.event_date) {
      errors.push('Event date is required');
    } else {
      const eventDate = new Date(data.event_date);
      if (isNaN(eventDate.getTime())) {
        errors.push('Invalid event date');
      }
    }
    
    if (data.auto_enable_scanner !== undefined && typeof data.auto_enable_scanner !== 'boolean') {
      errors.push('Auto enable scanner must be a boolean value');
    }
    
    return errors;
  }

  // Get events for calendar view
  async getCalendarEvents(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const result = await query(`
      SELECT 
        e.id,
        e.event_name,
        e.event_date,
        e.auto_enable_scanner,
        COUNT(DISTINCT att.cadet_id) as attendance_count
      FROM events e
      LEFT JOIN attendance att ON att.event_name = e.event_name AND att.date = e.event_date
      WHERE e.event_date BETWEEN $1 AND $2
      GROUP BY e.id
      ORDER BY e.event_date
    `, [startDate, endDate]);
    
    return result.rows;
  }

  // Bulk create events
  async bulkCreateEvents(events, createdBy) {
    if (events.length === 0) return [];
    
    const values = [];
    const placeholders = [];
    
    events.forEach((event, index) => {
      const baseIndex = index * 4 + 1;
      placeholders.push(`($${baseIndex}, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`);
      values.push(
        event.event_name,
        event.event_date,
        event.auto_enable_scanner !== undefined ? event.auto_enable_scanner : true,
        createdBy
      );
    });
    
    const queryText = `
      INSERT INTO events (event_name, event_date, auto_enable_scanner, created_by)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;
    
    try {
      const result = await query(queryText, values);
      return result.rows;
    } catch (error) {
      logger.error('Bulk create events error:', error);
      throw error;
    }
  }
}

module.exports = new EventModel();
