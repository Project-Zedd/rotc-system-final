const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class MeritModel {
  async createMeritDemerit(data) {
    const query = `
      INSERT INTO merit_demerits (
        cadet_id, type, points, reason, date, semester, week_number, 
        awarded_by, category, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      data.cadet_id,
      data.type, // 'merit' or 'demerit'
      data.points,
      data.reason,
      data.date || new Date(),
      data.semester,
      data.week_number,
      data.awarded_by,
      data.category,
      data.description
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating merit/demerit:', error);
      throw error;
    }
  }

  async getCadetMeritDemerits(cadetId, semester = null) {
    let query = `
      SELECT 
        md.*,
        a.username as awarded_by_name,
        c.student_number,
        c.first_name,
        c.last_name
      FROM merit_demerits md
      JOIN admin a ON md.awarded_by = a.id
      JOIN cadets c ON md.cadet_id = c.id
      WHERE md.cadet_id = $1
    `;
    
    const values = [cadetId];
    
    if (semester) {
      query += ' AND md.semester = $2';
      values.push(semester);
    }
    
    query += ' ORDER BY md.date DESC';
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting cadet merit/demerits:', error);
      throw error;
    }
  }

  async getCadetTotalPoints(cadetId, semester = null) {
    let query = `
      SELECT 
        SUM(CASE WHEN type = 'merit' THEN points ELSE -points END) as total_points,
        SUM(CASE WHEN type = 'merit' THEN points ELSE 0 END) as total_merits,
        SUM(CASE WHEN type = 'demerit' THEN points ELSE 0 END) as total_demerits,
        COUNT(CASE WHEN type = 'merit' THEN 1 END) as merit_count,
        COUNT(CASE WHEN type = 'demerit' THEN 1 END) as demerit_count
      FROM merit_demerits
      WHERE cadet_id = $1
    `;
    
    const values = [cadetId];
    
    if (semester) {
      query += ' AND semester = $2';
      values.push(semester);
    }
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0] || { total_points: 0, total_merits: 0, total_demerits: 0, merit_count: 0, demerit_count: 0 };
    } catch (error) {
      logger.error('Error getting cadet total points:', error);
      throw error;
    }
  }

  async getMeritDemeritLeaderboard(semester = null, limit = 10) {
    let query = `
      SELECT 
        c.id,
        c.student_number,
        c.first_name,
        c.last_name,
        c.course,
        SUM(CASE WHEN md.type = 'merit' THEN md.points ELSE -md.points END) as total_points,
        SUM(CASE WHEN md.type = 'merit' THEN md.points ELSE 0 END) as total_merits,
        SUM(CASE WHEN md.type = 'demerit' THEN md.points ELSE 0 END) as total_demerits
      FROM merit_demerits md
      JOIN cadets c ON md.cadet_id = c.id
    `;
    
    const values = [];
    
    if (semester) {
      query += ' WHERE md.semester = $1';
      values.push(semester);
    }
    
    query += `
      GROUP BY c.id, c.student_number, c.first_name, c.last_name, c.course
      ORDER BY total_points DESC
      LIMIT $${values.length + 1}
    `;
    
    values.push(limit);
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting merit/demerit leaderboard:', error);
      throw error;
    }
  }

  async updateMeritDemerit(id, data) {
    const query = `
      UPDATE merit_demerits
      SET points = $1, reason = $2, description = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    
    const values = [data.points, data.reason, data.description, id];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating merit/demerit:', error);
      throw error;
    }
  }

  async deleteMeritDemerit(id) {
    const query = 'DELETE FROM merit_demerits WHERE id = $1 RETURNING *';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting merit/demerit:', error);
      throw error;
    }
  }

  async getMeritDemeritCategories() {
    return [
      { category: 'Attendance', type: 'merit', max_points: 10 },
      { category: 'Discipline', type: 'merit', max_points: 15 },
      { category: 'Leadership', type: 'merit', max_points: 20 },
      { category: 'Academic Excellence', type: 'merit', max_points: 25 },
      { category: 'Community Service', type: 'merit', max_points: 15 },
      { category: 'Tardiness', type: 'demerit', max_points: 5 },
      { category: 'Uniform Violation', type: 'demerit', max_points: 10 },
      { category: 'Misconduct', type: 'demerit', max_points: 20 },
      { category: 'Absence', type: 'demerit', max_points: 15 },
      { category: 'Disrespect', type: 'demerit', max_points: 25 }
    ];
  }
}

module.exports = new MeritModel();
