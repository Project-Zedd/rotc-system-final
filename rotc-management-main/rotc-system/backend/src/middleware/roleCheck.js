const { logger } = require('../utils/logger');

// Role-based access control middleware
const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is an admin
    if (req.user.userType !== 'admin') {
      logger.warn('Non-admin user attempted to access admin route', {
        userId: req.user.id,
        userType: req.user.userType,
        path: req.path
      });
      
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Check if user has the required role
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Admin with insufficient role attempted access', {
        adminId: req.user.id,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      
      return res.status(403).json({
        success: false,
        message: `Access restricted to: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// Convenience middleware for super admin only routes
const superAdminOnly = roleCheck(['super_admin']);

// Convenience middleware for any admin routes
const adminOnly = roleCheck(['super_admin', 'scanner_admin']);

module.exports = roleCheck;
module.exports.superAdminOnly = superAdminOnly;
module.exports.adminOnly = adminOnly;
