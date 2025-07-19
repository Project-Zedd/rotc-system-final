const { BaseModel } = require('./index');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

class CadetModel extends BaseModel {
  constructor() {
    super('cadets');
  }

  // Find cadet by student number
  async findByStudentNumber(studentNumber) {
    const result = await query(
      'SELECT * FROM cadets WHERE student_number = $1',
      [studentNumber]
    );
    return result.rows[0] || null;
  }

  // Find cadet by email
  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM cadets WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  // Find cadet by Google ID
  async findByGoogleId(googleId) {
    const result = await query(
      'SELECT * FROM cadets WHERE google_id = $1',
      [googleId]
    );
    return result.rows[0] || null;
  }

  // Update Google ID for a cadet
  async updateGoogleId(cadetId, googleId) {
    const result = await query(
      'UPDATE cadets SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [googleId, cadetId]
    );
    return result.rows[0];
  }

  // Search cadets
  async search(searchTerm, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const searchQuery = `
      SELECT * FROM cadets 
      WHERE 
        LOWER(student_number) LIKE LOWER($1) OR
        LOWER(first_name) LIKE LOWER($1) OR
        LOWER(last_name) LIKE LOWER($1) OR
        LOWER(CONCAT(first_name, ' ', last_name)) LIKE LOWER($1)
      ORDER BY last_name, first_name
      LIMIT $2 OFFSET $3
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const result = await query(searchQuery, [searchPattern, limit, offset]);
    
    return result.rows;
  }

  // Get cadets with pagination
  async getPaginated(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;

    // Build WHERE clause from filters
    const whereClauses = [];
    if (filters.gender) {
      whereClauses.push(`gender = $${paramIndex}`);
      queryParams.push(filters.gender);
      paramIndex++;
    }
    if (filters.course) {
      whereClauses.push(`course = $${paramIndex}`);
      queryParams.push(filters.course);
      paramIndex++;
    }
    if (filters.search) {
      whereClauses.push(`(
        LOWER(student_number) LIKE LOWER($${paramIndex}) OR
        LOWER(first_name) LIKE LOWER($${paramIndex}) OR
        LOWER(last_name) LIKE LOWER($${paramIndex})
      )`);
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      whereClause = `WHERE ${whereClauses.join(' AND ')}`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM cadets ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results
    queryParams.push(limit, offset);
    const dataQuery = `
      SELECT * FROM cadets 
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

  // Batch create cadets
  async batchCreate(cadetsData) {
    if (cadetsData.length === 0) return [];

    const values = [];
    const placeholders = [];
    
    cadetsData.forEach((cadet, index) => {
      const baseIndex = index * 12 + 1;
      placeholders.push(`(
        $${baseIndex}, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3},
        $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7},
        $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}
      )`);
      
      values.push(
        cadet.last_name,
        cadet.first_name,
        cadet.mi || null,
        cadet.course,
        cadet.dob,
        cadet.contact_number,
        cadet.address,
        cadet.gender,
        cadet.photo || null,
        cadet.emergency_contact || cadet.contact_number,
        cadet.validity_date || '2025-12-31',
        cadet.email || null
      );
    });

    const queryText = `
      INSERT INTO cadets (
        last_name, first_name, mi, course, dob, contact_number,
        address, gender, photo, emergency_contact, validity_date, email
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (student_number) DO NOTHING
      RETURNING *
    `;

    try {
      const result = await query(queryText, values);
      return result.rows;
    } catch (error) {
      logger.error('Batch create cadets error:', error);
      throw error;
    }
  }

  // Update cadet photo
  async updatePhoto(cadetId, photoUrl) {
    const result = await query(
      'UPDATE cadets SET photo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [photoUrl, cadetId]
    );
    return result.rows[0];
  }

  // Update QR code
  async updateQRCode(cadetId, qrCode) {
    const result = await query(
      'UPDATE cadets SET qr_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [qrCode, cadetId]
    );
    return result.rows[0];
  }

  // Update push subscription
  async updatePushSubscription(cadetId, subscription) {
    const result = await query(
      'UPDATE cadets SET push_subscription = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [JSON.stringify(subscription), cadetId]
    );
    return result.rows[0];
  }

  // Get cadets with push subscriptions
  async getCadetsWithPushSubscriptions() {
    const result = await query(
      'SELECT id, student_number, first_name, last_name, push_subscription FROM cadets WHERE push_subscription IS NOT NULL'
    );
    return result.rows;
  }

  // Get cadet statistics
  async getStatistics() {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_cadets,
        COUNT(CASE WHEN gender = 'male' THEN 1 END) as male_count,
        COUNT(CASE WHEN gender = 'female' THEN 1 END) as female_count,
        COUNT(DISTINCT course) as course_count,
        COUNT(photo) as with_photo_count,
        COUNT(qr_code) as with_qr_code_count
      FROM cadets
    `;
    
    const result = await query(statsQuery);
    return result.rows[0];
  }

  // Check for duplicates
  async checkDuplicates(firstName, lastName, dob) {
    const result = await query(
      `SELECT * FROM cadets 
       WHERE LOWER(first_name) = LOWER($1) 
       AND LOWER(last_name) = LOWER($2) 
       AND dob = $3`,
      [firstName, lastName, dob]
    );
    return result.rows;
  }

  // Get cadets by course
  async getByCourse(course) {
    const result = await query(
      'SELECT * FROM cadets WHERE course = $1 ORDER BY last_name, first_name',
      [course]
    );
    return result.rows;
  }

  // Get all courses
  async getAllCourses() {
    const result = await query(
      'SELECT DISTINCT course FROM cadets ORDER BY course'
    );
    return result.rows.map(row => row.course);
  }

  // Validate cadet data before creation
  validateCadetData(data) {
    const errors = [];

    // Required fields
    const requiredFields = ['last_name', 'first_name', 'course', 'dob', 'contact_number', 'address', 'gender'];
    for (const field of requiredFields) {
      if (!data[field]) {
        errors.push(`${field} is required`);
      }
    }

    // Validate DOB format (DD-MMM-YY)
    if (data.dob && !/^\d{2}-[A-Za-z]{3}-\d{2}$/.test(data.dob)) {
      errors.push('DOB must be in format DD-MMM-YY (e.g., 07-Aug-04)');
    }

    // Validate contact number (11 digits starting with 0)
    if (data.contact_number && !/^0\d{10}$/.test(data.contact_number)) {
      errors.push('Contact number must be 11 digits starting with 0');
    }

    // Validate gender
    if (data.gender && !['male', 'female'].includes(data.gender.toLowerCase())) {
      errors.push('Gender must be either male or female');
    }

    // Validate email if provided
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Invalid email format');
    }

    return errors;
  }
}

module.exports = new CadetModel();
