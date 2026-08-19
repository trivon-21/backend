const LOG_LEVELS = Object.freeze({
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
});

const normalizeMessage = (message, fallback = 'Unknown log message') => {
  if (typeof message === 'string') {
    const trimmed = message.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (message === null || message === undefined) {
    return fallback;
  }

  return String(message);
};

const normalizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
};

const safeSerialize = (value) => {
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }

      if (typeof currentValue === 'function') {
        return `[Function${currentValue.name ? `: ${currentValue.name}` : ''}]`;
      }

      if (currentValue instanceof Date) {
        return currentValue.toISOString();
      }

      if (currentValue && typeof currentValue === 'object') {
        if (seen.has(currentValue)) {
          return '[Circular]';
        }
        seen.add(currentValue);
      }

      return currentValue;
    });
  } catch (error) {
    return '"[Unserializable metadata]"';
  }
};

const normalizeError = (errorValue) => {
  if (errorValue instanceof Error) {
    return {
      name: errorValue.name,
      message: errorValue.message,
      stack: errorValue.stack
    };
  }

  if (typeof errorValue === 'string') {
    return { message: errorValue };
  }

  if (errorValue && typeof errorValue === 'object') {
    return {
      name: errorValue.name || 'Error',
      message: errorValue.message ? String(errorValue.message) : 'Unknown error',
      stack: errorValue.stack || undefined
    };
  }

  return { message: normalizeMessage(errorValue, 'Unknown error') };
};

const getTimestamp = () => new Date().toISOString();

const formatLogMessage = (level, message, metadata = {}) => {
  const timestamp = getTimestamp();
  const normalizedLevel = normalizeMessage(level, LOG_LEVELS.INFO).toUpperCase();
  const normalizedMessage = normalizeMessage(message);
  const normalizedMetadata = normalizeMetadata(metadata);
  const metadataKeys = Object.keys(normalizedMetadata);
  const metadataStr = metadataKeys.length > 0 ? ` | ${safeSerialize(normalizedMetadata)}` : '';

  return `[${timestamp}] [${normalizedLevel}] ${normalizedMessage}${metadataStr}`;
};

const writeLog = (method, level, message, metadata = {}) => {
  const formattedMessage = formatLogMessage(level, message, metadata);

  try {
    console[method](formattedMessage);
  } catch (error) {
    // Logging should not break business logic; if console fails, return the line for callers/tests.
    return formattedMessage;
  }

  return formattedMessage;
};

const info = (message, metadata = {}) => writeLog('log', LOG_LEVELS.INFO, message, metadata);

const warn = (message, metadata = {}) => writeLog('warn', LOG_LEVELS.WARN, message, metadata);

const error = (message, errorValue = {}, context = {}) => {
  const normalizedContext = normalizeMetadata(context);
  const normalizedError = normalizeError(errorValue);
  const metadata = {
    ...normalizedContext,
    errorName: normalizedError.name,
    errorMessage: normalizedError.message,
    errorStack: normalizedError.stack || 'No stack trace available'
  };

  return writeLog('error', LOG_LEVELS.ERROR, message, metadata);
};

const debug = (message, data = {}) => {
  const verbose = String(process.env.VERBOSE_LOGS || '').toLowerCase();
  // Only emit debug logs when VERBOSE_LOGS=true (or NODE_ENV !== 'production' and explicitly set)
  if (verbose === 'true') {
    return writeLog('debug', LOG_LEVELS.DEBUG, message, data);
  }

  return '';
};

const logRequest = (req, endpoint, statusCode) => {
  const request = req && typeof req === 'object' ? req : {};
  const metadata = {
    method: request.method || 'UNKNOWN',
    endpoint,
    statusCode: Number.isFinite(Number(statusCode)) ? Number(statusCode) : 0,
    userId: request.user?.id || 'anonymous',
    ip: request.ip || request.connection?.remoteAddress || 'unknown'
  };
  info(`Request processed`, metadata);
};

const logDbOperation = (collection, operation, duration, success = true) => {
  const level = success ? LOG_LEVELS.INFO : LOG_LEVELS.WARN;
  const metadata = {
    collection: normalizeMessage(collection, 'Unknown collection'),
    operation: normalizeMessage(operation, 'Unknown operation'),
    durationMs: Number.isFinite(Number(duration)) && Number(duration) >= 0 ? Number(duration) : 0,
    success: Boolean(success)
  };
  writeLog(success ? 'log' : 'warn', level, `Database operation: ${metadata.collection}.${metadata.operation}`, metadata);
};

const logValidationError = (endpoint, errors) => {
  const normalizedErrors = Array.isArray(errors) ? errors.map((item) => normalizeMessage(item)) : [normalizeMessage(errors)];
  const metadata = {
    endpoint: normalizeMessage(endpoint, 'unknown-endpoint'),
    errorCount: normalizedErrors.length,
    errors: normalizedErrors
  };
  warn(`Validation failed`, metadata);
};


const logWarrantyCalculation = (customerId, isUnderWarranty, freeServicesUsed, warrantyExpiry) => {
  const normalizedExpiry = warrantyExpiry instanceof Date && !Number.isNaN(warrantyExpiry.getTime())
    ? warrantyExpiry.toISOString()
    : null;

  const metadata = {
    customerId: normalizeMessage(customerId, 'unknown-customer'),
    isUnderWarranty: Boolean(isUnderWarranty),
    freeServicesUsed: Number.isFinite(Number(freeServicesUsed)) ? Number(freeServicesUsed) : 0,
    warrantyExpiry: normalizedExpiry,
    calculatedAt: getTimestamp()
  };
  debug(`Warranty calculated`, metadata);
};

module.exports = Object.freeze({
  // Constants
  LOG_LEVELS,

  // Core logging methods
  info,
  warn,
  error,
  debug,

  // Specialized logging methods
  logRequest,
  logDbOperation,
  logValidationError,
  logWarrantyCalculation,

  // Utilities
  getTimestamp,
  formatLogMessage
});
