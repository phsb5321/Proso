// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Remote Logger
 * Sends logs to Loki endpoint with batching, buffering, and retry
 *
 * @module utils/logging/logger
 */

import { z } from 'zod';
import { LogBuffer } from './buffer';
import {
  type Component,
  type LogEntry,
  type LogLevel,
  createLogEntry,
  loggingConstants,
  serializeForLoki,
} from './entry';

/**
 * Logging configuration schema
 */
export const loggingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().nullable().default(null),
  authType: z.enum(['none', 'basic', 'bearer', 'cloudflare']).default('none'),
  username: z.string().nullable().default(null),
  password: z.string().nullable().default(null),
  token: z.string().nullable().default(null),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
  batchIntervalMs: z.number().positive().default(10000), // 10 seconds
  maxBatchSize: z.number().int().positive().default(100),
  maxBufferBytes: z.number().positive().default(loggingConstants.maxBufferBytes),
});

export type LoggingConfig = z.infer<typeof loggingConfigSchema>;

/**
 * Log level values for filtering
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Storage key for logging configuration
 */
const STORAGE_KEY_CONFIG = 'proso_logging_config';
const STORAGE_KEY_RETRY = 'proso_log_retry_queue';

/**
 * Remote logger class for sending logs to Loki
 */
export class RemoteLogger {
  private config: LoggingConfig;
  private buffer: LogBuffer;
  private sessionId: string | null = null;
  private version: string | null = null;
  private flushIntervalId: number | null = null;
  private retryQueue: LogEntry[][] = [];
  private initialized = false;

  constructor() {
    this.config = loggingConfigSchema.parse({});
    this.buffer = new LogBuffer({
      maxBytes: this.config.maxBufferBytes,
    });
  }

  /**
   * Initialize the remote logger
   * Lazy initialization - does not block extension startup
   */
  async initialize(): Promise<void> {
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
        if (area === 'local' && changes[STORAGE_KEY_CONFIG]) {
          this.handleConfigChange(changes[STORAGE_KEY_CONFIG].newValue);
        }
      });

      // Start flush interval if enabled
      if (this.config.enabled) {
        this.startFlushInterval();
      }

      this.initialized = true;
    } catch (err: unknown) {
      console.warn('RemoteLogger: Initialization failed', (err as Error).message);
    }
  }

  /**
   * Log a message at the specified level
   * @param level - Log level
   * @param message - Log message
   * @param component - Source component
   * @param metadata - Optional structured metadata
   */
  log(
    level: LogLevel,
    message: string,
    component: Component,
    metadata?: Record<string, unknown>,
  ): void {
    // Check if logging is enabled and level is sufficient
    if (!this.config.enabled) return;
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.logLevel]) return;

    const entry = createLogEntry({ level, message, component, metadata });
    if (entry) {
      this.buffer.add(entry);

      // Auto-flush if buffer is full
      if (this.buffer.shouldFlush(this.config.maxBatchSize)) {
        this.flush();
      }
    }
  }

  /**
   * Convenience methods for each log level
   */
  debug(message: string, component: Component, metadata?: Record<string, unknown>): void {
    this.log('debug', message, component, metadata);
  }

  info(message: string, component: Component, metadata?: Record<string, unknown>): void {
    this.log('info', message, component, metadata);
  }

  warn(message: string, component: Component, metadata?: Record<string, unknown>): void {
    this.log('warn', message, component, metadata);
  }

  error(message: string, component: Component, metadata?: Record<string, unknown>): void {
    this.log('error', message, component, metadata);
  }

  /**
   * Flush buffered logs to Loki
   */
  async flush(): Promise<void> {
    if (!this.config.enabled || !this.config.endpoint) return;
    if (this.buffer.isEmpty()) return;
    if (this.buffer.isCircuitBroken()) {
      console.warn('RemoteLogger: Circuit breaker tripped, skipping flush');
      return;
    }

    const entries = this.buffer.flush();
    const success = await this.sendToLoki(entries);
    this.buffer.recordFlushResult(success);

    if (!success) {
      // Add to retry queue
      this.retryQueue.push(entries);
      await this.saveRetryQueue();
    }

    await this.buffer.save();
  }

  /**
   * Send log entries to Loki
   * @param entries - Array of log entries to send
   */
  private async sendToLoki(entries: LogEntry[]): Promise<boolean> {
    if (!this.config.endpoint) return false;

    try {
      // Group entries by level and component for streams
      const streamMap = new Map<string, LogEntry[]>();

      for (const entry of entries) {
        const streamKey = `${entry.level}:${entry.component}`;
        if (!streamMap.has(streamKey)) {
          streamMap.set(streamKey, []);
        }
        streamMap.get(streamKey)!.push(entry);
      }

      // Build Loki payload
      const streams = Array.from(streamMap.entries()).map(([key, streamEntries]) => {
        const [level, component] = key.split(':');
        return {
          stream: {
            app: 'proso',
            version: this.version || 'unknown',
            session: this.sessionId || 'unknown',
            level,
            component,
          },
          values: streamEntries.map((e) => serializeForLoki(e)),
        };
      });

      const payload = { streams };

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authentication
      if (this.config.authType === 'basic' && this.config.username && this.config.password) {
        const auth = btoa(`${this.config.username}:${this.config.password}`);
        headers['Authorization'] = `Basic ${auth}`;
      } else if (this.config.authType === 'bearer' && this.config.token) {
        headers['Authorization'] = `Bearer ${this.config.token}`;
      } else if (this.config.authType === 'cloudflare' && this.config.token) {
        headers['CF-Access-Client-Id'] = this.config.username || '';
        headers['CF-Access-Client-Secret'] = this.config.token;
      }

      // Send to Loki
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`RemoteLogger: Loki responded with ${response.status}`);
        return false;
      }

      return true;
    } catch (err: unknown) {
      console.error('RemoteLogger: Failed to send to Loki', (err as Error).message);
      return false;
    }
  }

  /**
   * Load configuration from storage
   */
  private async loadConfig(): Promise<void> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY_CONFIG);
      if (result[STORAGE_KEY_CONFIG]) {
        this.config = loggingConfigSchema.parse({
          ...this.config,
          ...result[STORAGE_KEY_CONFIG],
        });
      }
    } catch (err: unknown) {
      console.warn('RemoteLogger: Failed to load config', (err as Error).message);
    }
  }

  /**
   * Handle configuration change
   */
  private handleConfigChange(newConfig: unknown): void {
    const wasEnabled = this.config.enabled;
    this.config = loggingConfigSchema.parse({ ...this.config, ...newConfig });

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
   */
  private async loadRetryQueue(): Promise<void> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY_RETRY);
      if (Array.isArray(result[STORAGE_KEY_RETRY])) {
        this.retryQueue = result[STORAGE_KEY_RETRY];
      }
    } catch (err: unknown) {
      console.warn('RemoteLogger: Failed to load retry queue', (err as Error).message);
    }
  }

  /**
   * Save retry queue to storage
   */
  private async saveRetryQueue(): Promise<void> {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY_RETRY]: this.retryQueue,
      });
    } catch (err: unknown) {
      console.warn('RemoteLogger: Failed to save retry queue', (err as Error).message);
    }
  }

  /**
   * Start the flush interval timer
   */
  private startFlushInterval(): void {
    if (this.flushIntervalId) return;

    this.flushIntervalId = window.setInterval(() => {
      this.flush();
    }, this.config.batchIntervalMs);
  }

  /**
   * Stop the flush interval timer
   */
  private stopFlushInterval(): void {
    if (this.flushIntervalId !== null) {
      window.clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }

  /**
   * Destroy the logger and clean up resources
   */
  async destroy(): Promise<void> {
    this.stopFlushInterval();
    await this.flush(); // Final flush
    await this.buffer.save();
    this.initialized = false;
  }
}

/**
 * Singleton logger instance
 */
let loggerInstance: RemoteLogger | null = null;

/**
 * Get the singleton logger instance
 */
export function getLogger(): RemoteLogger {
  if (!loggerInstance) {
    loggerInstance = new RemoteLogger();
  }
  return loggerInstance;
}

// ============================================================================
// Structured Logger Factory (T058)
// ============================================================================

/**
 * Global log buffer for structured logging.
 * Shared across all createLogger instances.
 */
let globalLogBuffer: LogBuffer | null = null;

/**
 * Get or create the global LogBuffer instance.
 */
export function getGlobalLogBuffer(): LogBuffer {
  if (!globalLogBuffer) {
    globalLogBuffer = new LogBuffer({
      maxBytes: loggingConstants.maxBufferBytes,
    });
  }
  return globalLogBuffer;
}

/**
 * Reset the global log buffer (for testing).
 */
export function resetGlobalLogBuffer(): void {
  globalLogBuffer = null;
}

/**
 * Log level values for filtering (used by createLogger)
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Configured minimum log level for createLogger instances.
 * Defaults to 'debug' (log everything).
 */
let configuredLogLevel: LogLevel = 'debug';

/**
 * Set the minimum log level for all createLogger instances.
 */
export function setLogLevel(level: LogLevel): void {
  configuredLogLevel = level;
}

/**
 * Get the current minimum log level.
 */
export function getLogLevel(): LogLevel {
  return configuredLogLevel;
}

/**
 * Safely serialize metadata, handling circular references and size limits.
 * @param metadata - Metadata object to serialize
 * @returns Safe metadata or null if too large or circular
 */
function safeSerializeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  try {
    // Handle circular references with a replacer
    const seen = new WeakSet();
    const safeStr = JSON.stringify(metadata, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (typeof value === 'function') return '[Function]';
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    });

    // Check metadata size limit (4096 bytes)
    if (safeStr.length > loggingConstants.maxMetadataBytes) {
      return { _truncated: true, _size: safeStr.length };
    }

    return JSON.parse(safeStr);
  } catch {
    return { _error: 'metadata serialization failed' };
  }
}

/**
 * Structured logger interface returned by createLogger.
 */
export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Create a structured logger pre-bound to a component tag.
 *
 * Each log method:
 * 1. Checks the configured log level (skips if below threshold)
 * 2. Truncates messages exceeding 8192 bytes
 * 3. Safely serializes metadata (handles circular refs, enforces 4096 byte limit)
 * 4. Creates a LogEntry and adds it to the global LogBuffer
 * 5. Also logs to console for dev visibility (stripped in production by esbuild.drop)
 *
 * @param component - Component tag for this logger instance
 * @returns Logger with debug/info/warn/error methods
 *
 * @example
 * ```ts
 * const logger = createLogger('handler');
 * logger.info('Request processed', { handler: 'playback.start', durationMs: 42 });
 * logger.error('Failed to generate audio', { provider: 'elevenlabs', error: err.message });
 * ```
 */
export function createLogger(component: Component): Logger {
  const buffer = getGlobalLogBuffer();
  const tag = `[${component}]`;

  function log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    // Check level filter
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLogLevel]) return;

    // Truncate message if needed
    let msg = message;
    if (msg.length > loggingConstants.maxMessageBytes) {
      msg = msg.substring(0, loggingConstants.maxMessageBytes - 3) + '...';
    }

    // Create entry and add to buffer
    const safeMeta = safeSerializeMetadata(metadata);
    const entry = createLogEntry({
      level,
      message: msg,
      component,
      metadata: safeMeta,
    });

    if (entry) {
      buffer.add(entry);
    }

    // Also output to console for dev visibility
    // These calls are stripped in production by esbuild.drop: ['console']
    const consoleArgs = metadata ? [tag, msg, metadata] : [tag, msg];
    switch (level) {
      case 'debug':
        console.debug(...consoleArgs);
        break;
      case 'info':
        console.info(...consoleArgs);
        break;
      case 'warn':
        console.warn(...consoleArgs);
        break;
      case 'error':
        console.error(...consoleArgs);
        break;
    }
  }

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => log('debug', message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) => log('error', message, metadata),
  };
}
