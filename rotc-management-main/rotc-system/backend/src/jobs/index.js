const Queue = require('bull');
const redisConfig = require('../config/redis');
const CadetModel = require('../models/cadet');
const AttendanceModel = require('../models/attendance');
const { logger } = require('../utils/logger');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');

const importQueue = new Queue('cadet-import', { redis: redisConfig });
const idCardQueue = new Queue('id-card-generation', { redis: redisConfig });

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// AWS S3 setup
const s3 = new AWS.S3({
  region: process.env.AWS_REGION
});

// Helper to upload photo to S3 with retry
async function uploadPhotoToS3(buffer, key) {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
    ACL: 'public-read'
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await s3.upload(params).promise();
      return data.Location;
    } catch (error) {
      logger.error(`S3 upload attempt ${attempt} failed:`, error);
      if (attempt === 3) throw error;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// Import job processor
importQueue.process(async (job) => {
  const cadets = job.data.cadets;
  logger.info(`Processing import batch of ${cadets.length} cadets`);

  for (const cadet of cadets) {
    try {
      // Compress photo
      let photoUrl = null;
      if (cadet.photo_base64) {
        const buffer = Buffer.from(cadet.photo_base64, 'base64');
        const compressed = await sharp(buffer).resize(200, 200).jpeg({ quality: 80 }).toBuffer();
        const key = `photos/${cadet.student_number}.jpg`;
        photoUrl = await uploadPhotoToS3(compressed, key);
      }

      // Generate QR code as data URL
      const qrDataUrl = await qrcode.toDataURL(cadet.student_number);

      // Create or update cadet record
      const cadetData = {
        ...cadet,
        photo: photoUrl,
        qr_code: qrDataUrl
      };

      await CadetModel.batchCreate([cadetData]);
    } catch (error) {
      logger.error('Error importing cadet:', error, cadet);
    }
  }

  logger.info('Import batch processed');
});

// ID card generation job processor
idCardQueue.process(async (job) => {
  const cadets = job.data.cadets;
  logger.info(`Generating ID cards for ${cadets.length} cadets`);

  // TODO: Use Puppeteer to generate PDFs with front and back design
  // Cache generated PDFs for 1 hour

  logger.info('ID card generation completed');
});

module.exports = {
  importQueue,
  idCardQueue
};
