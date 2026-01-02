/**
 * VoxPage Remote Logging Defaults
 * SINGLE SOURCE OF TRUTH for logging configuration values
 *
 * @module shared/config/logging-defaults
 * @description Configuration defaults for remote logging to Loki (014-loki-remote-logging)
 */

/**
 * Valid log levels (in order of severity)
 */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

/**
 * Valid authentication types for Loki endpoint
 */
export const AUTH_TYPES = Object.freeze(['none', 'basic', 'bearer', 'cloudflare']);

/**
 * Valid log component identifiers
 */
export const COMPONENTS = Object.freeze(['background', 'content', 'popup', 'options']);

/**
 * Numeric log level values for filtering comparison
 * debug (0) < info (1) < warn (2) < error (3)
 */
export const LOG_LEVEL_VALUES = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

/**
 * Default logging configuration
 *
 * @constant {Object}
 */
export const loggingDefaults = Object.freeze({
  // Master enable/disable toggle - enabled by default for development
  enabled: true,

  // Loki push endpoint URL (must be HTTPS, end with /loki/api/v1/push)
  endpoint: null,

  // Authentication type: 'none' | 'basic' | 'bearer' | 'cloudflare'
  authType: 'none',

  // Basic auth credentials
  username: null,
  password: null,

  // Bearer token auth
  bearerToken: null,

  // Cloudflare Access service token
  cfAccessClientId: null,
  cfAccessClientSecret: null,

  // Minimum log level to send: 'debug' | 'info' | 'warn' | 'error'
  // Default 'warn' to reduce noise in production
  logLevel: 'warn',

  // FR-003: Batch send interval in milliseconds (10 seconds default)
  batchIntervalMs: 10000,

  // Maximum entries per batch before forced flush
  maxBatchSize: 100,

  // FR-004: Maximum buffer size in bytes (1MB)
  maxBufferBytes: 1048576,
});

/**
 * Boundary constraints for numeric logging settings
 */
export const loggingConstraints = Object.freeze({
  batchIntervalMs: { min: 1000, max: 60000 },
  maxBatchSize: { min: 10, max: 1000 },
  maxBufferBytes: { min: 102400, max: 5242880 }, // 100KB - 5MB
});

/**
 * Operational constants (not user-configurable)
 */
export const loggingConstants = Object.freeze({
  // Circuit breaker: disable after this many consecutive failures
  maxConsecutiveFailures: 10,

  // Retry delays with exponential backoff (ms)
  retryDelays: [1000, 2000, 4000, 8000, 16000],

  // Maximum retry attempts before dropping batch
  maxRetryAttempts: 5,

  // Maximum log message size (10KB)
  maxMessageBytes: 10240,

  // Maximum metadata size when serialized (5KB)
  maxMetadataBytes: 5120,

  // Maximum label value length (Loki constraint)
  maxLabelLength: 128,

  // App name for Loki stream labels
  appName: 'voxpage',
});

export default loggingDefaults;
