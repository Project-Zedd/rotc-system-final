const Redis = require('redis');
const Bull = require('bull');
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

// Redis client configuration
const getRedisConfig = () => {
  const config = {
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    }
  };

  if (process.env.REDIS_URL) {
    config.url = process.env.REDIS_URL;
  } else {
    config.socket.host = process.env.REDIS_HOST || 'localhost';
    config.socket.port = process.env.REDIS_PORT || 6379;
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }
  }

  return config;
};

// Create Redis client
const redisClient = Redis.createClient(getRedisConfig());

// Redis event handlers
redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

redisClient.on('ready', () => {
  logger.info('Redis Client Ready');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis Client Reconnecting');
});

// Connect to Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    return true;
  } catch (err) {
    logger.error('Failed to connect to Redis:', err);
    return false;
  }
};

// Bull Queue Configuration
const getQueueConfig = () => {
  if (process.env.REDIS_CLUSTER_NODES) {
    // Redis Cluster configuration for Bull
    const nodes = process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
      const url = new URL(node);
      return {
        host: url.hostname,
        port: url.port || 6379
      };
    });

    return {
      createClient: (type) => {
        switch (type) {
          case 'client':
          case 'subscriber':
          case 'bclient':
            return Redis.createClient({
              cluster: {
                nodes: nodes,
                options: {
                  enableReadyCheck: true,
                  maxRetriesPerRequest: 3
                }
              }
            });
          default:
            throw new Error('Unexpected connection type: ' + type);
        }
      }
    };
  }

  // Single Redis instance configuration
  return {
    redis: process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    }
  };
};

// Create Bull queues
const queues = {
  importQueue: new Bull('cadet-import', getQueueConfig()),
  idCardQueue: new Bull('id-card-generation', getQueueConfig()),
  syncQueue: new Bull('offline-sync', getQueueConfig()),
  notificationQueue: new Bull('notifications', getQueueConfig()),
  googleSheetsQueue: new Bull('google-sheets-poll', getQueueConfig())
};

// Queue event handlers
Object.entries(queues).forEach(([name, queue]) => {
  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} waiting in ${name}`);
  });

  queue.on('active', (job) => {
    logger.info(`Job ${job.id} active in ${name}`);
  });

  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed in ${name}`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed in ${name}:`, err);
  });
});

// Cache operations
const cache = {
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Cache get error:', err);
      return null;
    }
  },

  set: async (key, value, ttl = 3600) => {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.error('Cache set error:', err);
      return false;
    }
  },

  del: async (key) => {
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      logger.error('Cache delete error:', err);
      return false;
    }
  },

  exists: async (key) => {
    try {
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (err) {
      logger.error('Cache exists error:', err);
      return false;
    }
  },

  // Pattern-based deletion
  delPattern: async (pattern) => {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (err) {
      logger.error('Cache pattern delete error:', err);
      return false;
    }
  }
};

// Session store operations
const sessionStore = {
  get: async (sessionId) => {
    return cache.get(`session:${sessionId}`);
  },

  set: async (sessionId, data, ttl = 86400) => {
    return cache.set(`session:${sessionId}`, data, ttl);
  },

  destroy: async (sessionId) => {
    return cache.del(`session:${sessionId}`);
  },

  touch: async (sessionId, ttl = 86400) => {
    const data = await sessionStore.get(sessionId);
    if (data) {
      return sessionStore.set(sessionId, data, ttl);
    }
    return false;
  }
};

// Close all connections
const close = async () => {
  try {
    await redisClient.quit();
    await Promise.all(Object.values(queues).map(queue => queue.close()));
    logger.info('Redis connections closed');
  } catch (err) {
    logger.error('Error closing Redis connections:', err);
  }
};

module.exports = {
  redisClient,
  connectRedis,
  queues,
  cache,
  sessionStore,
  close
};
