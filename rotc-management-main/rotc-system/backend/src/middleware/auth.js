const jwt = require('jsonwebtoken');
const passport = require('passport');
const { logger } = require('../utils/logger');

// JWT authentication middleware
const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      logger.error('Authentication error:', err);
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Unauthorized'
      });
    }

    req.user = user;
    next();
  })(req, res, next);
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

// Generate JWT token
const generateToken = (user, type = 'access') => {
  const payload = {
    id: user.id,
    type: user.userType || (user.role ? 'admin' : 'cadet'),
    username: user.username,
    role: user.role
  };

  const secret = type === 'refresh' 
    ? process.env.JWT_REFRESH_SECRET 
    : process.env.JWT_SECRET;
    
  const expiresIn = type === 'refresh'
    ? process.env.JWT_REFRESH_EXPIRE || '7d'
    : process.env.JWT_EXPIRE || '15m';

  return jwt.sign(payload, secret, {
    expiresIn,
    issuer: 'rotc-system',
    audience: 'rotc-users'
  });
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: 'rotc-system',
      audience: 'rotc-users'
    });
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  generateToken,
  verifyRefreshToken
};
