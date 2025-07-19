const express = require('express');
const router = express.Router();
const { testConnection } = require('../config/database');
const { redisClient } = require('../config/redis');
const { testConnections: testAWSConnections } = require('../config/aws');
const { logger } = require('../utils/logger');

// Basic health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: false,
      redis: false,
      aws: {
        s3: false,
        ses: false
      }
    }
  };

  try {
    // Check database
    health.services.database = await testConnection();
    
    // Check Redis
    try {
      await redisClient.ping();
      health.services.redis = true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }
    
    // Check AWS services
    try {
      const awsHealth = await testAWSConnections();
      health.services.aws = awsHealth;
    } catch (error) {
      logger.error('AWS health check failed:', error);
    }
    
    // Determine overall status
    const allHealthy = health.services.database && 
                      health.services.redis && 
                      health.services.aws.s3;
    
    health.status = allHealthy ? 'ok' : 'degraded';
    
    res.status(allHealthy ? 200 : 503).json({
      success: true,
      ...health
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Health check failed',
      ...health
    });
  }
});

// Readiness check for container orchestration
router.get('/ready', async (req, res) => {
  try {
    const dbReady = await testConnection();
    
    if (dbReady) {
      res.json({
        success: true,
        ready: true
      });
    } else {
      res.status(503).json({
        success: false,
        ready: false,
        reason: 'Database not ready'
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      ready: false,
      reason: error.message
    });
  }
});

// Liveness check for container orchestration
router.get('/live', (req, res) => {
  res.json({
    success: true,
    alive: true
  });
});

module.exports = router;
