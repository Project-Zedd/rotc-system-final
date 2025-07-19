const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class BadgeModel {
  async createBadge(data) {
    const query = `
      INSERT INTO badges (
        name, description, criteria, points_required, category, icon_url, color, 
        created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [
      data.name,
      data.description,
      data.criteria,
      data.points_required,
      data.category,
      data.icon_url,
      data.color,
      data.created_by
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating badge:', error);
      throw error;
    }
  }

  async awardBadge(cadetId, badgeId, awardedBy, date = null) {
    const query = `
      INSERT INTO cadet_badges (
        cadet_id, badge_id, awarded_date, awarded_by, semester, week_number
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      cadetId,
      badgeId,
      date || new Date(),
      awardedBy,
      this.getCurrentSemester(),
      this.getCurrentWeek()
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error awarding badge:', error);
      throw error;
    }
  }

  async getCadetBadges(cadetId, semester = null) {
    let query = `
      SELECT 
        cb.*,
        b.name as badge_name,
        b.description as badge_description,
        b.criteria as badge_criteria,
        b.points_required as badge_points_required,
        b.category as badge_category,
        b.icon_url as badge_icon_url,
        b.color as badge_color,
        a.username as awarded_by_name,
        c.student_number,
        c.first_name,
        c.last_name
      FROM cadet_badges cb
      JOIN badges b ON cb.badge_id = b.id
      JOIN admin a ON cb.awarded_by = a.id
      JOIN cadets c ON cb.cadet_id = c.id
      WHERE cb.cadet_id = $1
    `;
    
    const values = [cadetId];
    
    if (semester) {
      query += ' AND cb.semester = $2';
      values.push(semester);
    }
    
    query += ' ORDER BY cb.awarded_date DESC';
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting cadet badges:', error);
      throw error;
    }
  }

  async getBadgeLeaderboard(semester = null, limit = 10) {
    let query = `
      SELECT 
        c.id,
        c.student_number,
        c.first_name,
        c.last_name,
        c.course,
        COUNT(cb.id) as total_badges,
        COUNT(CASE WHEN b.category = 'Top Attendance' THEN cb.id END) as attendance_badges,
        COUNT(CASE WHEN b.category = 'Academic Excellence' THEN cb.id END) as academic_badges,
        COUNT(CASE WHEN b.category = 'Leadership' THEN cb.id END) as leadership_badges,
        COUNT(CASE WHEN b.category = 'Community Service' THEN cb.id END) as service_badges
      FROM cadet_badges cb
      JOIN badges b ON cb.badge_id = b.id
      JOIN cadets c ON cb.cadet_id = c.id
    `;
    
    const values = [];
    
    if (semester) {
      query += ' WHERE cb.semester = $1';
      values.push(semester);
    }
    
    query += `
      GROUP BY c.id, c.student_number, c.first_name, c.last_name, c.course
      ORDER BY total_badges DESC
      LIMIT $${values.length + 1}
    `;
    
    values.push(limit);
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting badge leaderboard:', error);
      throw error;
    }
  }

  async getBadgeCategories() {
    return [
      { category: 'Top Attendance', description: 'Highest attendance percentage', points_required: 0, color: '#4CAF50' },
      { category: 'Academic Excellence', description: 'Top academic performance', points_required: 0, color: '#2196F3' },
      { category: 'Leadership', description: 'Demonstrated leadership qualities', points_required: 0, color: '#FF9800' },
      { category: 'Community Service', description: 'Outstanding community service', points_required: 0, color: '#9C27B0' },
      { category: 'Discipline', description: 'Exemplary discipline', points_required: 0, color: '#607D8B' },
      { category: 'Physical Fitness', description: 'Outstanding physical fitness', points_required: 0, color: '#FF5722' },
      { category: 'Examiner Award', description: 'Outstanding performance as examiner', points_required: 0, color: '#795548' },
      { category: 'Special Recognition', description: 'Special recognition for outstanding contribution', points_required: 0, color: '#E91E63' }
    ];
  }

  async getCurrentSemester() {
    const now = new Date();
    return now.getMonth() < 6 ? 1 : 2;
  }

  async getCurrentWeek() {
    const now = new Date();
    // Calculate week number based on ROTC schedule
    return Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  }

  async getBadgeRankingGrid() {
    return [
      { rank: 1, title: 'Cadet of the Year', min_points: 100, color: '#FFD700' },
      { rank: 2, title: 'Top Cadet', min_points: 80, color: '#C0C0C0' },
      { rank: 3, title: 'Outstanding Cadet', min_points: 60, color: '#CD7F32' },
      { rank: 4, title: 'Excellent Cadet', min_points: 40, color: '#4CAF50' },
      { rank: 5, title: 'Good Cadet', min_points: 20, color: '#2196F3' }
    ];
  }
}

module.exports = new BadgeModel();
