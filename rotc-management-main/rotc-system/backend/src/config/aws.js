const AWS = require('aws-sdk');
const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Create S3 instance
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {
    Bucket: process.env.AWS_S3_BUCKET
  }
});

// Create SES instance for email
const ses = new AWS.SES({
  apiVersion: '2010-12-01',
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1'
});

// S3 operations with retry logic
const s3Operations = {
  // Upload file to S3
  upload: async (key, body, contentType = 'image/jpeg', metadata = {}) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: 'AES256'
    };

    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        const result = await s3.upload(params).promise();
        logger.info('File uploaded to S3:', { key, location: result.Location });
        
        // Return CloudFront URL if available
        if (process.env.AWS_CLOUDFRONT_URL) {
          return `${process.env.AWS_CLOUDFRONT_URL}/${key}`;
        }
        return result.Location;
      } catch (err) {
        lastError = err;
        retries--;
        logger.error(`S3 upload error (${3 - retries}/3):`, err);
        
        if (retries > 0) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, 3 - retries) * 1000));
        }
      }
    }

    throw lastError;
  },

  // Download file from S3
  download: async (key) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    };

    try {
      const result = await s3.getObject(params).promise();
      logger.info('File downloaded from S3:', { key });
      return result.Body;
    } catch (err) {
      logger.error('S3 download error:', err);
      throw err;
    }
  },

  // Delete file from S3
  delete: async (key) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    };

    try {
      await s3.deleteObject(params).promise();
      logger.info('File deleted from S3:', { key });
      return true;
    } catch (err) {
      logger.error('S3 delete error:', err);
      throw err;
    }
  },

  // Check if file exists
  exists: async (key) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    };

    try {
      await s3.headObject(params).promise();
      return true;
    } catch (err) {
      if (err.code === 'NotFound') {
        return false;
      }
      logger.error('S3 exists check error:', err);
      throw err;
    }
  },

  // Generate presigned URL for temporary access
  getSignedUrl: async (key, expiresIn = 3600) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Expires: expiresIn
    };

    try {
      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (err) {
      logger.error('S3 signed URL error:', err);
      throw err;
    }
  },

  // List files with prefix
  list: async (prefix, maxKeys = 1000) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys
    };

    try {
      const result = await s3.listObjectsV2(params).promise();
      return result.Contents || [];
    } catch (err) {
      logger.error('S3 list error:', err);
      throw err;
    }
  }
};

// SES email operations
const emailOperations = {
  // Send email
  send: async (to, subject, htmlBody, textBody = null) => {
    const params = {
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: htmlBody
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: subject
        }
      },
      Source: process.env.EMAIL_FROM || 'noreply@rotc-system.com'
    };

    if (textBody) {
      params.Message.Body.Text = {
        Charset: 'UTF-8',
        Data: textBody
      };
    }

    try {
      const result = await ses.sendEmail(params).promise();
      logger.info('Email sent:', { messageId: result.MessageId, to });
      return result.MessageId;
    } catch (err) {
      logger.error('SES send email error:', err);
      throw err;
    }
  },

  // Send templated email
  sendTemplate: async (to, templateName, templateData) => {
    const params = {
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      Source: process.env.EMAIL_FROM || 'noreply@rotc-system.com',
      Template: templateName,
      TemplateData: JSON.stringify(templateData)
    };

    try {
      const result = await ses.sendTemplatedEmail(params).promise();
      logger.info('Template email sent:', { messageId: result.MessageId, to, template: templateName });
      return result.MessageId;
    } catch (err) {
      logger.error('SES send template email error:', err);
      throw err;
    }
  },

  // Verify email address (for development)
  verifyEmail: async (email) => {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Email verification should not be used in production');
      return false;
    }

    const params = {
      EmailAddress: email
    };

    try {
      await ses.verifyEmailIdentity(params).promise();
      logger.info('Email verification sent:', { email });
      return true;
    } catch (err) {
      logger.error('SES verify email error:', err);
      return false;
    }
  }
};

// CloudFront operations
const cloudfrontOperations = {
  // Invalidate CloudFront cache
  invalidate: async (paths) => {
    if (!process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID) {
      logger.warn('CloudFront distribution ID not configured');
      return null;
    }

    const cloudfront = new AWS.CloudFront();
    const params = {
      DistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: paths.length,
          Items: paths
        }
      }
    };

    try {
      const result = await cloudfront.createInvalidation(params).promise();
      logger.info('CloudFront invalidation created:', { id: result.Invalidation.Id });
      return result.Invalidation.Id;
    } catch (err) {
      logger.error('CloudFront invalidation error:', err);
      throw err;
    }
  }
};

// Test AWS connections
const testConnections = async () => {
  const results = {
    s3: false,
    ses: false
  };

  // Test S3
  try {
    await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET }).promise();
    results.s3 = true;
    logger.info('S3 connection successful');
  } catch (err) {
    logger.error('S3 connection failed:', err);
  }

  // Test SES
  try {
    await ses.getSendQuota().promise();
    results.ses = true;
    logger.info('SES connection successful');
  } catch (err) {
    logger.error('SES connection failed:', err);
  }

  return results;
};

module.exports = {
  s3,
  ses,
  s3Operations,
  emailOperations,
  cloudfrontOperations,
  testConnections
};
