/**
 * VoxPage Remote Logger
 * Sends logs to Loki endpoint with batching, buffering, and retry
 *
 * @module utils/logging/logger
 */

import { z } from 'zod';
import { LogBuffer } from './buffer';
import { type LogEntry, type LogLevel, type Component, createLogEntry, serializeForLoki, loggingConstants } from './entry';

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
const STORAGE_KEY_CONFIG = 'voxpage_logging_config';
const STORAGE_KEY_RETRY = 'voxpage_log_retry_queue';

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
  private initialized: boolean = false;

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
    } catch (err: any) {
      console.warn('RemoteLogger: Initialization failed', err.message);
    }
  }

  /**
   * Log a message at the specified level
   * @param level - Log level
   * @param message - Log message
   * @param component - Source component
   * @param metadata - Optional structured metadata
   */
  log(level: LogLevel, message: string, component: Component, metadata?: Record<string, any>): void {
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
  debug(message: string, component: Component, metadata?: Record<string, any>): void {
    this.log('debug', message, component, metadata);
  }

  info(message: string, component: Component, metadata?: Record<string, any>): void {
    this.log('info', message, component, metadata);
  }

  warn(message: string, component: Component, metadata?: Record<string, any>): void {
    this.log('warn', message, component, metadata);
  }

  error(message: string, component: Component, metadata?: Record<string, any>): void {
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
            app: 'voxpage',
            version: this.version || 'unknown',
            session: this.sessionId || 'unknown',
            level,
            component,
          },
          values: streamEntries.map(e => serializeForLoki(e)),
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
    } catch (err: any) {
      console.error('RemoteLogger: Failed to send to Loki', err.message);
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
    } catch (err: any) {
      console.warn('RemoteLogger: Failed to load config', err.message);
    }
  }

  /**
   * Handle configuration change
   */
  private handleConfigChange(newConfig: any): void {
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
    } catch (err: any) {
      console.warn('RemoteLogger: Failed to load retry queue', err.message);
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
    } catch (err: any) {
      console.warn('RemoteLogger: Failed to save retry queue', err.message);
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
