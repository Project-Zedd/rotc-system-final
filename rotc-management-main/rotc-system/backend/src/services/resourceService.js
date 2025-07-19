const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ResourceService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
    this.bucket = process.env.AWS_S3_BUCKET;
    this.uploadPath = path.join(__dirname, '../../uploads/resources');
  }

  // File Upload Service
  async uploadFile(file, metadata = {}) {
    try {
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = path.join(this.uploadPath, fileName);
      
      await fs.mkdir(this.uploadPath, { recursive: true });
      await fs.writeFile(filePath, file.buffer);

      // Upload to S3
      const uploadResult = await this.s3.upload({
        Bucket: this.bucket,
        Key: `resources/${fileName}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
      }).promise();

      // Save metadata to database
      const query = `
        INSERT INTO resources (
          filename, original_name, file_type, file_size, url, uploaded_by, 
          uploaded_at, category, description, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
        RETURNING *
      `;
      
      const values = [
        fileName,
        file.originalname,
        file.mimetype,
        file.size,
        uploadResult.Location,
        metadata.uploaded_by,
        metadata.category || 'general',
        metadata.description || '',
        metadata.tags || ''
      ];

      const result = await pool.query(query, values);
      return result.rows[0];

    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  }

  async getResources(category = null, limit = 50, offset = 0) {
    let query = `
      SELECT 
        r.*,
        a.username as uploaded_by_name
      FROM resources r
      JOIN admin a ON r.uploaded_by = a.id
    `;
    
    const values = [];
    
    if (category) {
      query += ' WHERE r.category = $1';
      values.push(category);
    }
    
    query += ' ORDER BY r.uploaded_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting resources:', error);
      throw error;
    }
  }

  async getResourceById(id) {
    const query = `
      SELECT 
        r.*,
        a.username as uploaded_by_name
      FROM resources r
      JOIN admin a ON r.uploaded_by = a.id
      WHERE r.id = $1
    `;
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting resource by ID:', error);
      throw error;
    }
  }

  async deleteResource(id) {
    const query = 'DELETE FROM resources WHERE id = $1 RETURNING *';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting resource:', error);
      throw error;
    }
  }

  async getResourceCategories() {
    return [
      'Training Materials',
      'Exam Papers',
      'Study Guides',
      'Policies & Procedures',
      'Forms & Templates',
      'Videos & Multimedia',
      'Presentations',
      'Manuals & Handbooks'
    ];
  }

  async getResourceStats() {
    const query = `
      SELECT 
        category,
        COUNT(*) as count,
        SUM(file_size) as total_size
      FROM resources
      GROUP BY category
      ORDER BY count DESC
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting resource stats:', error);
      throw error;
    }
  }

  async searchResources(query, category = null, limit = 50) {
    const searchQuery = `
      SELECT 
        r.*,
        a.username as uploaded_by_name
      FROM resources r
      JOIN admin a ON r.uploaded_by = a.id
      WHERE (r.filename ILIKE $1 OR r.description ILIKE $1 OR r.tags ILIKE $1)
    `;
    
    const values = [`%${query}%`];
    
    if (category) {
      searchQuery += ' AND r.category = $2';
      values.push(category);
    }
    
    searchQuery += ' ORDER BY r.uploaded_at DESC LIMIT $' + (values.length + 1);
    values.push(limit);
    
    try {
      const result = await pool.query(searchQuery, values);
      return result.rows;
    } catch (error) {
      logger.error('Error searching resources:', error);
      throw error;
    }
  }

  async uploadTrainingFile(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Training Materials',
      tags: 'training, materials, resources'
    });
  }

  async uploadExamPaper(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Exam Papers',
      tags: 'exam, paper, test'
    });
  }

  async uploadStudyGuide(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Study Guides',
      tags: 'study, guide, guide'
    });
  }

  async uploadManual(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Manuals & Handbooks',
      tags: 'manual, handbook, guide'
    });
  }

  async uploadVideo(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Videos & Multimedia',
      tags: 'video, multimedia, training'
    });
  }

  async uploadPresentation(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Presentations',
      tags: 'presentation, training, materials'
    });
  }

  async uploadPolicy(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Policies & Procedures',
      tags: 'policy, procedure, guide'
    });
  }

  async uploadForm(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Forms & Templates',
      tags: 'form, template, guide'
    });
  }

  async uploadExamPaperWithMetadata(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Exam Papers',
      tags: 'exam, paper, test, training'
    });
  }

  async uploadTrainingManual(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Manuals & Handbooks',
      tags: 'manual, handbook, training, guide'
    });
  }

  async uploadTrainingVideo(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Videos & Multimedia',
      tags: 'video, training, multimedia'
    });
  }

  async uploadTrainingPresentation(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Presentations',
      tags: 'presentation, training, materials'
    });
  }

  async uploadTrainingManualWithMetadata(file, metadata = {}) {
    return await this.uploadFile(file, {
      ...metadata,
      category: 'Manuals & Handbooks',
      tags: 'manual, handbook, training, guide'
    });
    }
}
