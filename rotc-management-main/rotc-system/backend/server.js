const { server } = require('./src/app');
const { testConnection } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { testConnections: testAWSConnections } = require('./src/config/aws');
const { logger } = require('./src/utils/logger');
const { initializeJobs } = require('./src/jobs');
const { initializeDatabase } = require('./src/models');

// Load environment variables
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Initialize services
const initializeServices = async () => {
  try {
    logger.info('Starting ROTC Attendance System Backend...');

    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Initialize database models and relationships
    logger.info('Initializing database models...');
    await initializeDatabase();

    // Connect to Redis
    logger.info('Connecting to Redis...');
    const redisConnected = await connectRedis();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }

    // Test AWS connections
    logger.info('Testing AWS connections...');
    const awsConnections = await testAWSConnections();
    logger.info('AWS connection status:', awsConnections);

    // Initialize background jobs
    logger.info('Initializing background jobs...');
    await initializeJobs();

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`API URL: http://localhost:${PORT}/api`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info('API Documentation: http://localhost:${PORT}/api-docs');
      }
    });

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
initializeServices();
