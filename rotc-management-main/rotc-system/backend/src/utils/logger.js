const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure log directory exists
const logDir = process.env.LOG_FILE_PATH || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray'
};

// Tell winston about our colors
winston.addColors(colors);

// Define format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define format for console logs
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: consoleFormat
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Create a stream object for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Audit logger for security-sensitive operations
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Helper functions for structured logging
const logHelpers = {
  // Log API request
  logRequest: (req, additionalInfo = {}) => {
    logger.http('API Request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      ...additionalInfo
    });
  },

  // Log API response
  logResponse: (req, res, responseTime, additionalInfo = {}) => {
    logger.http('API Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id,
      ...additionalInfo
    });
  },

  // Log database query
  logQuery: (query, params, duration, additionalInfo = {}) => {
    logger.debug('Database Query', {
      query: query.substring(0, 200), // Truncate long queries
      paramCount: params?.length || 0,
      duration: `${duration}ms`,
      ...additionalInfo
    });
  },

  // Log error with context
  logError: (error, context = {}) => {
    logger.error('Error occurred', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      ...context
    });
  },

  // Log audit event
  logAudit: (action, userId, details = {}, success = true) => {
    auditLogger.info('Audit Event', {
      action,
      userId,
      success,
      timestamp: new Date().toISOString(),
      ...details
    });
  },

  // Log security event
  logSecurity: (event, details = {}) => {
    logger.warn('Security Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
    
    // Also log to audit
    auditLogger.warn('Security Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  },

  // Log performance metric
  logPerformance: (operation, duration, additionalInfo = {}) => {
    logger.verbose('Performance Metric', {
      operation,
      duration: `${duration}ms`,
      ...additionalInfo
    });
  },

  // Log job event
  logJob: (jobName, jobId, event, details = {}) => {
    logger.info('Job Event', {
      jobName,
      jobId,
      event,
      ...details
    });
  },

  // Log integration event
  logIntegration: (service, action, success, details = {}) => {
    const level = success ? 'info' : 'error';
    logger[level]('Integration Event', {
      service,
      action,
      success,
      ...details
    });
  }
};

// Middleware for request logging
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logHelpers.logRequest(req);
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    logHelpers.logResponse(req, res, responseTime);
    originalSend.call(this, data);
  };
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logHelpers.logError(err, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id
  });
  next(err);
};

module.exports = {
  logger,
  auditLogger,
  ...logHelpers,
  requestLogger,
  errorLogger
};
