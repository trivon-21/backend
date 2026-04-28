/**
 * Action Logging Middleware
 * Automatically logs all significant actions to the audit log
 */

const LoggingService = require('../utils/logging-service');

const EXCLUDED_PATH_PATTERNS = [
  '/health',
  '/ping',
  '/maintenance/status',
  '/maintenance/check',
  '/auth/login',        // Handled with explicit logging after auth
  '/auth/register',     // Handled with explicit logging after registration
  '/auth/logout',       // Handled with explicit logging after logout
];

const MAJOR_GET_PATH_HINTS = [
  '/export',
  '/download',
];

const isExcludedNoisePath = (path = '') => {
  const lowerPath = String(path || '').toLowerCase();
  return EXCLUDED_PATH_PATTERNS.some((pattern) => lowerPath.includes(pattern));
};

const isMajorRequest = (req) => {
  const method = String(req?.method || '').toUpperCase();
  const path = String(req?.originalUrl || '').toLowerCase();

  if (isExcludedNoisePath(path)) {
    return false;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }

  if (method === 'GET') {
    return MAJOR_GET_PATH_HINTS.some((hint) => path.includes(hint));
  }

  return false;
};

/**
 * Middleware to log actions with context
 * Captures every API request and logs response outcome
 */
const actionLoggingMiddleware = (req, res, next) => {
  const requestStart = Date.now();
  let responsePayload = null;

  // Store original methods to capture response payload
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (data) {
    responsePayload = data;
    return originalJson.call(this, data);
  };

  res.send = function (data) {
    if (responsePayload === null) {
      responsePayload = data;
    }
    return originalSend.call(this, data);
  };

  res.on('finish', async () => {
    try {
      if (!req.originalUrl?.startsWith('/api/')) {
        return;
      }

      if (!isMajorRequest(req)) {
        return;
      }

      const userId = req.user?._id || req.user?.id || null;
      const userRole = req.user?.role || 'UNKNOWN';
      const statusCode = res.statusCode;
      const status = statusCode >= 400 ? 'FAILED' : 'SUCCESS';
      const durationMs = Date.now() - requestStart;
      const endpoint = req.originalUrl;

      const metadata = {
        automaticRequestAudit: true,
        durationMs,
        query: LoggingService.redactAndTrimPayload(req.query || {}),
        params: LoggingService.redactAndTrimPayload(req.params || {}),
        uploads: LoggingService.summarizeUploadMetadata(req),
      };

      if (status === 'SUCCESS') {
        await LoggingService.logActivity({
          userId,
          userRole,
          module: LoggingService.inferModuleFromEndpoint(endpoint),
          action: LoggingService.humanizeAction(req.method, endpoint),
          actionCategory: LoggingService.inferActionCategory(req.method, endpoint),
          entity: endpoint,
          changes: {},
          reason: null,
          metadata,
          request: req,
          status,
          statusCode,
        });
        return;
      }

      const errorMessage =
        (typeof responsePayload === 'object' && responsePayload?.message)
          || (typeof responsePayload === 'string' ? responsePayload.slice(0, 500) : null)
          || `HTTP ${statusCode}`;

      await LoggingService.logError({
        userId,
        userRole,
        module: LoggingService.inferModuleFromEndpoint(endpoint),
        action: LoggingService.humanizeAction(req.method, endpoint),
        actionCategory: LoggingService.inferActionCategory(req.method, endpoint),
        entity: endpoint,
        error: new Error(errorMessage),
        errorType: statusCode >= 500 ? 'HTTP_SERVER_ERROR' : 'HTTP_CLIENT_ERROR',
        metadata: {
          ...metadata,
          response: LoggingService.redactAndTrimPayload(responsePayload),
          statusCode,
        },
        request: req,
      });
    } catch (error) {
      console.error('[Action Logging] Request audit logging failed:', error.message);
    }
  });

  next();
};

/**
 * Helper function to log an action within a route handler
 * Call this at the beginning or end of an action
 *
 * Usage in route handler:
 * await logAction(req, res, {
 *   module: 'ORDER_MANAGEMENT',
 *   action: 'Order Created',
 *   actionCategory: 'CREATE',
 *   entity: 'Order',
 *   entityId: order._id,
 *   changes: { after: order },
 * });
 */
const logAction = async (
  req,
  res,
  {
    module,
    action,
    actionCategory,
    entity,
    entityId = null,
    changes = {},
    reason = null,
    metadata = {},
  }
) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role || 'UNKNOWN';

    if (!userId) {
      console.warn('[Action Logging] No user found in request');
      return null;
    }

    return await LoggingService.logActivity({
      userId,
      userRole,
      module,
      action,
      actionCategory,
      entity,
      entityId,
      changes,
      reason,
      metadata,
      request: req,
    });
  } catch (error) {
    console.error('[Action Logging] Error logging action:', error.message);
    return null;
  }
};

/**
 * Helper function to log an error
 */
const logError = async (
  req,
  res,
  {
    module,
    action,
    actionCategory = 'OTHER',
    entity = 'SYSTEM',
    error,
    errorType = 'APPLICATION_ERROR',
    metadata = {},
  }
) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role || 'SYSTEM';

    return await LoggingService.logError({
      userId,
      userRole,
      module,
      action,
      actionCategory,
      entity,
      error,
      errorType,
      metadata,
      request: req,
    });
  } catch (logError) {
    console.error('[Action Logging] Error logging error:', logError.message);
    return null;
  }
};

/**
 * Helper function to log security events
 */
const logSecurityEvent = async (
  req,
  res,
  {
    module = 'AUTH',
    action,
    riskLevel = 'MEDIUM',
    securityFlags = [],
    userId = null,
    attemptCount = null,
    reason = null,
    metadata = {},
  }
) => {
  try {
    const userRole = req.user?.role || 'UNKNOWN';

    return await LoggingService.logSecurityEvent({
      userId,
      userRole,
      module,
      action,
      riskLevel,
      securityFlags,
      attemptCount,
      reason,
      metadata,
      request: req,
    });
  } catch (error) {
    console.error('[Action Logging] Error logging security event:', error.message);
    return null;
  }
};

module.exports = {
  actionLoggingMiddleware,
  logAction,
  logError,
  logSecurityEvent,
};
