/**
 * VoxPage Remote Logger
 * Sends logs to Loki endpoint with batching, buffering, and retry
 *
 * @module background/remote-logger
 * @description Core logging infrastructure for remote logging (014-loki-remote-logging)
 */

import { LogBuffer } from './log-buffer.js';
import { createLogEntry, serializeForLoki, generateTimestamp } from './log-entry.js';
import { StorageKey, LogLevel, LogLevelValue, LogComponent } from './constants.js';
import {
  loggingDefaults,
  loggingConstants,
  LOG_LEVEL_VALUES,
} from '../shared/config/logging-defaults.js';

/**
 * Remote logger class for sending logs to Loki
 */
export class RemoteLogger {
  constructor() {
    this.config = { ...loggingDefaults };
    this.buffer = new LogBuffer({
      maxBytes: this.config.maxBufferBytes,
    });
    this.sessionId = null;
    this.version = null;
    this.flushIntervalId = null;
    this.retryQueue = [];
    this.initialized = false;
  }

  /**
   * Initialize the remote logger
   * Lazy initialization - does not block extension startup
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Generate session ID
      this.sessionId = crypto.randomUUID();

      // Get extension version from manifest
      const manifest = browser.runtime.getManifest();
      this.version = manifest.version;

      // Load configuration from storage
      await this.loadConfig();

      // Load any buffered entries from previous session
      await this.buffer.load();

      // Load retry queue
      await this.loadRetryQueue();

      // Listen for config changes
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[StorageKey.LOGGING_CONFIG]) {
          this.handleConfigChange(changes[StorageKey.LOGGING_CONFIG].newValue);
        }
      });

      // Start flush interval if enabled
      if (this.config.enabled) {
        this.startFlushInterval();
      }

      this.initialized = true;
    } catch (err) {
      console.warn('RemoteLogger: Initialization failed', err.message);
    }
  }

  /**
   * Load configuration from storage
   * @private
   */
  async loadConfig() {
    try {
      const result = await browser.storage.local.get(StorageKey.LOGGING_CONFIG);
      if (result[StorageKey.LOGGING_CONFIG]) {
        this.config = { ...loggingDefaults, ...result[StorageKey.LOGGING_CONFIG] };
        this.buffer.maxBytes = this.config.maxBufferBytes;
      }
    } catch (err) {
      console.warn('RemoteLogger: Failed to load config', err.message);
    }
  }

  /**
   * Handle configuration change
   * @private
   * @param {Object} newConfig - New configuration
   */
  handleConfigChange(newConfig) {
    const wasEnabled = this.config.enabled;
    this.config = { ...loggingDefaults, ...newConfig };
    this.buffer.maxBytes = this.config.maxBufferBytes;

    // Reset circuit breaker on config save (user action)
    this.buffer.resetCircuitBreaker();

    // Start/stop flush interval based on enabled state
    if (this.config.enabled && !wasEnabled) {
      this.startFlushInterval();
    } else if (!this.config.enabled && wasEnabled) {
      this.stopFlushInterval();
    }
  }

  /**
   * Load retry queue from storage
   * @private
   */
  async loadRetryQueue() {
    try {
      const result = await browser.storage.local.get(StorageKey.LOG_RETRY_QUEUE);
      if (Array.isArray(result[StorageKey.LOG_RETRY_QUEUE])) {
        this.retryQueue = result[StorageKey.LOG_RETRY_QUEUE];
      }
    } catch (err) {
      console.warn('RemoteLogger: Failed to load retry queue', err.message);
    }
  }

  /**
   * Save retry queue to storage
   * @private
   */
  async saveRetryQueue() {
    try {
      await browser.storage.local.set({
        [StorageKey.LOG_RETRY_QUEUE]: this.retryQueue,
      });
    } catch (err) {
      console.warn('RemoteLogger: Failed to save retry queue', err.message);
    }
  }

  /**
   * Start the flush interval timer
   * @private
   */
  startFlushInterval() {
    if (this.flushIntervalId) return;

    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.config.batchIntervalMs);
  }

  /**
   * Stop the flush interval timer
   * @private
   */
  stopFlushInterval() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }

  /**
   * Log a message
   *
   * @param {string} level - Log level: 'debug' | 'info' | 'warn' | 'error'
   * @param {string} message - Log message
   * @param {string} [component='background'] - Source component
   * @param {Object} [metadata=null] - Optional structured metadata
   */
  log(level, message, component = LogComponent.BACKGROUND, metadata = null) {
    // Always log to console for local debugging
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    const prefix = `[VoxPage:${component}]`;
    if (metadata) {
      console[consoleMethod](prefix, message, metadata);
    } else {
      console[consoleMethod](prefix, message);
    }

    // Early exit if not enabled or not initialized
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    // Check circuit breaker
    if (this.buffer.isCircuitBroken()) {
      return;
    }

    // Level filtering
    if (!this.shouldLog(level)) {
      return;
    }

    // Create and add entry
    const entry = createLogEntry({ level, message, component, metadata });
    if (entry) {
      this.buffer.add(entry);

      // Check if we should flush immediately
      if (this.buffer.shouldFlush(this.config.maxBatchSize)) {
        this.flush();
      }
    }
  }

  /**
   * Check if level should be logged based on configured minimum
   * @private
   * @param {string} level - Log level to check
   * @returns {boolean} True if should log
   */
  shouldLog(level) {
    const levelValue = LOG_LEVEL_VALUES[level];
    const configuredValue = LOG_LEVEL_VALUES[this.config.logLevel];
    return levelValue >= configuredValue;
  }

  /**
   * Convenience methods for each log level
   */
  debug(message, component, metadata) {
    this.log(LogLevel.DEBUG, message, component, metadata);
  }

  info(message, component, metadata) {
    this.log(LogLevel.INFO, message, component, metadata);
  }

  warn(message, component, metadata) {
    this.log(LogLevel.WARN, message, component, metadata);
  }

  error(message, component, metadata) {
    this.log(LogLevel.ERROR, message, component, metadata);
  }

  /**
   * Flush buffered logs to Loki
   * @returns {Promise<void>}
   */
  async flush() {
    if (!this.config.enabled || !this.config.endpoint) {
      return;
    }

    if (this.buffer.isEmpty() && this.retryQueue.length === 0) {
      return;
    }

    // Process retry queue first
    await this.processRetryQueue();

    // Get and clear buffer
    const entries = this.buffer.flush();
    if (entries.length === 0) {
      return;
    }

    // Build payload
    const payload = this.buildLokiPayload(entries);

    // Send to Loki
    const result = await this.sendToLoki(payload);

    // Record result
    this.buffer.recordFlushResult(result.success);

    if (!result.success && result.retryable) {
      // Add to retry queue
      this.addToRetryQueue(payload, entries);
    }

    // Save buffer state
    await this.buffer.save();
  }

  /**
   * Build Loki push payload from log entries
   * Groups entries by level and component for efficient streams
   *
   * @param {Array} entries - Array of LogEntry objects
   * @returns {Object} Loki streams payload
   */
  buildLokiPayload(entries) {
    // Group entries by level:component
    const grouped = this.groupByStreamLabels(entries);

    const streams = Object.entries(grouped).map(([key, items]) => {
      const [level, component] = key.split(':');
      return {
        stream: {
          app: loggingConstants.appName,
          version: this.version,
          session: this.sessionId,
          level: level,
          component: component,
        },
        values: items.map(entry => serializeForLoki(entry)),
      };
    });

    return { streams };
  }

  /**
   * Group entries by stream labels for batching
   * @private
   * @param {Array} entries - Log entries
   * @returns {Object} Grouped entries
   */
  groupByStreamLabels(entries) {
    const groups = {};

    for (const entry of entries) {
      const key = `${entry.level}:${entry.component}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(entry);
    }

    return groups;
  }

  /**
   * Send logs to Loki endpoint
   *
   * @param {Object} payload - Loki streams payload
   * @returns {Promise<{success: boolean, retryable: boolean, error?: string}>}
   */
  async sendToLoki(payload) {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authentication headers
    switch (this.config.authType) {
      case 'basic':
        if (this.config.username && this.config.password) {
          headers['Authorization'] = `Basic ${btoa(this.config.username + ':' + this.config.password)}`;
        }
        break;
      case 'bearer':
        if (this.config.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
        }
        break;
      case 'cloudflare':
        if (this.config.cfAccessClientId && this.config.cfAccessClientSecret) {
          headers['CF-Access-Client-Id'] = this.config.cfAccessClientId;
          headers['CF-Access-Client-Secret'] = this.config.cfAccessClientSecret;
        }
        break;
    }

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 204) {
        return { success: true, retryable: false };
      }

      const errorBody = await response.json().catch(() => ({}));
      const error = errorBody.error || `HTTP ${response.status}`;

      // Determine if retryable
      const retryable = response.status >= 500 || response.status === 429;

      return { success: false, retryable, error };
    } catch (err) {
      // Network error - retryable
      return { success: false, retryable: true, error: err.message };
    }
  }

  /**
   * Add failed batch to retry queue
   * @private
   * @param {Object} payload - Failed payload
   * @param {Array} entries - Original entries (for re-batching)
   */
  addToRetryQueue(payload, entries) {
    // Calculate next retry time with exponential backoff
    const attempts = 0;
    const delay = loggingConstants.retryDelays[0] + Math.random() * 1000;

    this.retryQueue.push({
      payload,
      attempts,
      nextRetryAt: Date.now() + delay,
      entryCount: entries.length,
    });

    // Limit queue size
    while (this.retryQueue.length > 10) {
      this.retryQueue.shift(); // Drop oldest
    }

    this.saveRetryQueue();
  }

  /**
   * Process retry queue
   * @private
   */
  async processRetryQueue() {
    const now = Date.now();
    const toRetry = this.retryQueue.filter(item => item.nextRetryAt <= now);

    for (const item of toRetry) {
      const result = await this.sendToLoki(item.payload);

      if (result.success) {
        // Remove from queue
        const index = this.retryQueue.indexOf(item);
        if (index > -1) {
          this.retryQueue.splice(index, 1);
        }
      } else if (result.retryable) {
        // Update retry with backoff
        item.attempts++;
        if (item.attempts >= loggingConstants.maxRetryAttempts) {
          // Max retries exceeded, drop
          const index = this.retryQueue.indexOf(item);
          if (index > -1) {
            this.retryQueue.splice(index, 1);
          }
        } else {
          const delayIndex = Math.min(item.attempts, loggingConstants.retryDelays.length - 1);
          const delay = loggingConstants.retryDelays[delayIndex] + Math.random() * 1000;
          item.nextRetryAt = Date.now() + delay;
        }
      } else {
        // Not retryable, drop
        const index = this.retryQueue.indexOf(item);
        if (index > -1) {
          this.retryQueue.splice(index, 1);
        }
      }
    }

    if (toRetry.length > 0) {
      await this.saveRetryQueue();
    }
  }

  /**
   * Test connection to Loki endpoint
   * Sends a test log entry and verifies response
   *
   * @param {Object} testConfig - Configuration to test
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection(testConfig) {
    const testEntry = createLogEntry({
      level: LogLevel.INFO,
      message: 'VoxPage connection test',
      component: LogComponent.OPTIONS,
      metadata: { test: true },
    });

    // Build test payload
    const payload = {
      streams: [{
        stream: {
          app: loggingConstants.appName,
          version: this.version || '1.0.0',
          session: 'test-session',
          level: 'info',
          component: 'options',
        },
        values: [serializeForLoki(testEntry)],
      }],
    };

    // Build headers from test config
    const headers = {
      'Content-Type': 'application/json',
    };

    switch (testConfig.authType) {
      case 'basic':
        if (testConfig.username && testConfig.password) {
          headers['Authorization'] = `Basic ${btoa(testConfig.username + ':' + testConfig.password)}`;
        }
        break;
      case 'bearer':
        if (testConfig.bearerToken) {
          headers['Authorization'] = `Bearer ${testConfig.bearerToken}`;
        }
        break;
      case 'cloudflare':
        if (testConfig.cfAccessClientId && testConfig.cfAccessClientSecret) {
          headers['CF-Access-Client-Id'] = testConfig.cfAccessClientId;
          headers['CF-Access-Client-Secret'] = testConfig.cfAccessClientSecret;
        }
        break;
    }

    try {
      const response = await fetch(testConfig.endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 204) {
        return { success: true };
      }

      const errorBody = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorBody.error || `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Flush on tab/window close
   * Uses synchronous approach for beforeunload
   */
  flushSync() {
    if (!this.config.enabled || !this.config.endpoint) {
      return;
    }

    const entries = this.buffer.getAll();
    if (entries.length === 0) {
      return;
    }

    const payload = this.buildLokiPayload(entries);

    // Use sendBeacon for more reliable delivery on page unload
    try {
      const headers = {
        type: 'application/json',
      };

      const blob = new Blob([JSON.stringify(payload)], headers);

      // Note: sendBeacon doesn't support custom headers
      // For authenticated endpoints, we need to use fetch with keepalive
      if (this.config.authType === 'none') {
        navigator.sendBeacon(this.config.endpoint, blob);
      } else {
        // Use fetch with keepalive for authenticated requests
        this.sendToLoki(payload).catch(() => {
          // Ignore errors on shutdown
        });
      }

      // Clear buffer (may not persist if page closes immediately)
      this.buffer.clear();
    } catch {
      // Ignore errors during shutdown
    }
  }

  /**
   * Get logger status
   * @returns {Object} Current logger state
   */
  getStatus() {
    return {
      initialized: this.initialized,
      enabled: this.config.enabled,
      endpoint: this.config.endpoint ? '(configured)' : null,
      sessionId: this.sessionId,
      version: this.version,
      bufferState: this.buffer.getState(),
      retryQueueLength: this.retryQueue.length,
    };
  }

  /**
   * Get all buffered log entries
   * Does not clear the buffer - use for inspection/export
   *
   * @returns {Object} Logs and status info
   */
  getLogs() {
    const entries = this.buffer.getAll();

    return {
      logs: entries.map(entry => ({
        timestamp: entry.timestamp,
        level: entry.level,
        component: entry.component,
        message: entry.message,
        metadata: entry.metadata,
        // Convert timestamp to readable date
        date: new Date(Number(BigInt(entry.timestamp) / BigInt(1000000))).toISOString(),
      })),
      status: {
        count: entries.length,
        bufferBytes: this.buffer.totalBytes,
        sessionId: this.sessionId,
        enabled: this.config.enabled,
        endpoint: this.config.endpoint ? '(configured)' : null,
        circuitBroken: this.buffer.isCircuitBroken(),
        retryQueueLength: this.retryQueue.length,
      },
    };
  }

  /**
   * Clear all buffered logs
   * Use with caution - logs will be lost if not yet flushed
   */
  clearLogs() {
    this.buffer.clear();
    this.buffer.save();
  }

  /**
   * Shutdown the logger
   */
  shutdown() {
    this.stopFlushInterval();
    this.flushSync();
  }
}

// Singleton instance
let loggerInstance = null;

/**
 * Get or create the remote logger instance
 * @returns {RemoteLogger} Logger instance
 */
export function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new RemoteLogger();
  }
  return loggerInstance;
}

/**
 * Initialize the remote logger
 * Call this from background/index.js during startup
 *
 * @returns {Promise<RemoteLogger>}
 */
export async function initializeLogger() {
  const logger = getLogger();
  await logger.initialize();
  return logger;
}

export default RemoteLogger;
