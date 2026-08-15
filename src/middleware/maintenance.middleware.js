const systemConfigService = require('../modules/super-admin/config/system-config.service');

/**
 * Maintenance Middleware
 * Blocks all requests except those from SUPER_ADMIN users when maintenance is active
 * Also checks scheduled maintenance windows
 */
const maintenanceMiddleware = async (req, res, next) => {
  try {
    const config = await systemConfigService.getSystemConfig();
    const maintenance = config.maintenance;

    // Check if instant maintenance is active
    let isUnderMaintenance = maintenance.isActive;

    // Check if it's within a scheduled maintenance window
    if (!isUnderMaintenance && maintenance.scheduledStartTime && maintenance.scheduledEndTime) {
      const now = new Date();
      isUnderMaintenance =
        now >= maintenance.scheduledStartTime && now <= maintenance.scheduledEndTime;
    }

    if (!isUnderMaintenance) {
      return next();
    }

    // System is under maintenance. Check if user is SUPER_ADMIN to allow bypass
    // Allow these routes during maintenance
    const allowedRoutes = ['/api/auth/login', '/api/auth/signup', '/api/auth/maintenance'];

    if (allowedRoutes.includes(req.path)) {
      return next();
    }

    // Extract and validate JWT token to check for SUPER_ADMIN
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      try {
        const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
        // If user is SUPER_ADMIN, allow access
        if (decoded.role === 'SUPER_ADMIN') {
          return next();
        }
      } catch (err) {
        // Token invalid, will be blocked below
      }
    }

    // Block access - return 503 Service Unavailable
    return res.status(503).json({
      success: false,
      message: 'System is under maintenance',
      maintenance: {
        isActive: maintenance.isActive,
        message: maintenance.message,
        reason: maintenance.reason,
        scheduledStartTime: maintenance.scheduledStartTime,
        scheduledEndTime: maintenance.scheduledEndTime,
      },
    });
  } catch (error) {
    console.error('Maintenance middleware error:', error);
    // On error, allow request to proceed
    next();
  }
};

module.exports = { maintenanceMiddleware };
