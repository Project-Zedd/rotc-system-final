const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

// Load environment variables
require('dotenv').config();

// Import configurations
const { corsConfig, sessionConfig, rateLimitConfigs } = require('./config/auth');
const { logger, requestLogger, errorLogger } = require('./utils/logger');

// Import middleware
const authMiddleware = require('./middleware/auth');
const roleCheckMiddleware = require('./middleware/roleCheck');
const ipWhitelistMiddleware = require('./middleware/ipWhitelist');
const ipWhitelistMiddleware = require('./middleware/ipWhitelist');

// Import routes
const authRoutes = require('./routes/auth');
const cadetRoutes = require('./routes/cadet');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const scanRoutes = require('./routes/scan');
const syncRoutes = require('./routes/sync');
const notificationRoutes = require('./routes/notification');
const reportRoutes = require('./routes/report');
const eventRoutes = require('./routes/event');
const idCardRoutes = require('./routes/idCard');
const healthRoutes = require('./routes/health');
const trainingRoutes = require('./routes/training');
const inventoryRoutes = require('./routes/inventory');
const communicationRoutes = require('./routes/communication');

const cronJobs = require('./jobs/cronJobs');

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
  cors: corsConfig,
  transports: ['websocket', 'polling']
});

// Make io accessible to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  // Join room based on user type
  socket.on('join', (data) => {
    if (data.userType === 'admin') {
      socket.join('admins');
      logger.info('Admin joined', { socketId: socket.id, adminId: data.userId });
    } else if (data.userType === 'cadet') {
      socket.join(`cadet-${data.userId}`);
      logger.info('Cadet joined', { socketId: socket.id, cadetId: data.userId });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'self'", "https://accounts.google.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS middleware
app.use(cors(corsConfig));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session(sessionConfig));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware
app.use(requestLogger);

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Rate limiting middleware
app.use('/api/', rateLimit(rateLimitConfigs.general));
app.use('/api/auth/', rateLimit(rateLimitConfigs.auth));
app.use('/api/cadets/import', rateLimit(rateLimitConfigs.import));
app.use('/api/attendance/scan', rateLimit(rateLimitConfigs.scanning));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/cadets', authMiddleware, cadetRoutes);
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/admin', authMiddleware, roleCheckMiddleware(['super_admin', 'scanner_admin']), adminRoutes);
app.use('/api/scan', authMiddleware, roleCheckMiddleware(['super_admin', 'scanner_admin']), scanRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/reports', authMiddleware, roleCheckMiddleware(['super_admin']), reportRoutes);
app.use('/api/events', authMiddleware, eventRoutes);
app.use('/api/id-cards', authMiddleware, idCardRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/training', authMiddleware, trainingRoutes);
app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/communication', authMiddleware, communicationRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  
  // Handle React routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found'
  });
});

// Error logging middleware
app.use(errorLogger);

// Global error handler
app.use((err, req, res, next) => {
  // Default error values
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation error';
    errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'File too large';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    status = 409;
    message = 'Duplicate entry';
  }

  // Send error response
  res.status(status).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  // Give ongoing requests 30 seconds to complete
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io };
