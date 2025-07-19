const { SettingsModel } = require('../models');
const { checkIPWhitelist } = require('../config/auth');
const { logger } = require('../utils/logger');

// IP whitelist middleware
const ipWhitelistMiddleware = async (req, res, next) => {
  try {
    // Skip IP check if feature is disabled
    if (process.env.ENABLE_IP_WHITELIST !== 'true') {
      return next();
    }

    // Skip for non-admin users
    if (!req.user || req.user.userType !== 'admin') {
      return next();
    }

    // Get client IP
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Normalize IP (remove IPv6 prefix if present)
    const normalizedIP = clientIP.replace(/^::ffff:/, '');

    // Get allowed IPs from settings
    const allowedIPs = await SettingsModel.getAllowedIPs();

    // Check if IP is whitelisted
    if (!checkIPWhitelist(normalizedIP, allowedIPs)) {
      logger.warn('Admin access attempt from non-whitelisted IP', {
        adminId: req.user.id,
        username: req.user.username,
        ip: normalizedIP,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Access denied from this IP address'
      });
    }

    next();
  } catch (error) {
    logger.error('IP whitelist middleware error:', error);
    // Fail open - allow access if there's an error checking IP
    next();
  }
};

// Strict IP whitelist that fails closed
const strictIPWhitelist = async (req, res, next) => {
  try {
    // Always check IP for this middleware
    const clientIP = req.ip || req.connection.remoteAddress;
    const normalizedIP = clientIP.replace(/^::ffff:/, '');
    const allowedIPs = await SettingsModel.getAllowedIPs();

    if (!checkIPWhitelist(normalizedIP, allowedIPs)) {
      logger.warn('Access attempt from non-whitelisted IP (strict mode)', {
        ip: normalizedIP,
        path: req.path,
        userId: req.user?.id
      });

      return res.status(403).json({
        success: false,
        message: 'Access denied from this IP address'
      });
    }

    next();
  } catch (error) {
    logger.error('Strict IP whitelist middleware error:', error);
    // Fail closed - deny access if there's an error
    return res.status(500).json({
      success: false,
      message: 'IP verification failed'
    });
  }
};

module.exports = ipWhitelistMiddleware;
module.exports.strict = strictIPWhitelist;
