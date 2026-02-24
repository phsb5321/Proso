/**
 * Usage Tracker
 *
 * Main tracker class orchestrating event collection, buffering, and shipping.
 * This is the primary API for tracking usage events in Proso.
 *
 * @module utils/telemetry/usage/tracker
 */

import type {
  UsageEvent,
  UsageTrackerConfig,
  UsageTrackerInitConfig,
  TrackerStats,
  LogLevel,
  Provider,
  TrackOptions,
  Entrypoint,
} from './types';
import { DEFAULT_TRACKER_CONFIG, getEventGroup, getDefaultLogLevel } from './types';
import { ContextProvider, type UsageContext } from './context';
import { UsageBuffer } from './buffer';
import { UsageShipper } from './shipper';
import { sanitizeEventData, hashUrlSync } from './redaction';

/**
 * Usage Tracker orchestrates event collection and shipping.
 */
export class UsageTracker {
  private context: ContextProvider;
  private buffer: UsageBuffer;
  private shipper: UsageShipper | null = null;
  private config: UsageTrackerConfig;
  private flushIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private pendingInit: Promise<void> | null = null;

  constructor() {
    // Initialize with defaults - actual config comes in initialize()
    this.config = {
      ...DEFAULT_TRACKER_CONFIG,
      gatewayUrl: '',
      gatewayToken: '',
      entrypoint: 'background',
    };
    this.context = new ContextProvider();
    this.buffer = new UsageBuffer();
  }

  /**
   * Initialize the usage tracker.
   * Must be called before tracking events.
   */
  async initialize(config: UsageTrackerInitConfig): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.pendingInit) {
      return this.pendingInit;
    }

    if (this.initialized) {
      return;
    }

    this.pendingInit = this.doInitialize(config);

    try {
      await this.pendingInit;
    } finally {
      this.pendingInit = null;
    }
  }

  private async doInitialize(config: UsageTrackerInitConfig): Promise<void> {
    // Merge config with defaults
    this.config = {
      ...DEFAULT_TRACKER_CONFIG,
      ...config,
      entrypoint: config.entrypoint ?? this.context.getEntrypoint(),
    };

    // Skip initialization if disabled
    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }

    try {
      // Initialize context
      this.context = new ContextProvider(this.config.entrypoint);
      await this.context.initialize();

      // Initialize buffer
      this.buffer = new UsageBuffer({
        maxBytes: this.config.maxBufferBytes,
        maxAgeMs: this.config.maxBufferAgeMs,
      });
      await this.buffer.initialize();

      // Initialize shipper
      this.shipper = new UsageShipper({
        gatewayUrl: this.config.gatewayUrl,
        gatewayToken: this.config.gatewayToken,
        maxRetries: this.config.maxRetries,
        retryBaseDelayMs: this.config.retryBaseDelayMs,
        retryMaxDelayMs: this.config.retryMaxDelayMs,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures,
        circuitResetMs: this.config.circuitResetMs,
      });

      // Start periodic flush
      this.startPeriodicFlush();

      this.initialized = true;

      if (this.config.debugMode) {
        console.log('[UsageTracker] Initialized', {
          entrypoint: this.config.entrypoint,
          installId: this.context.getInstallId(),
          sessionId: this.context.getSessionId(),
        });
      }
    } catch (error) {
      console.error('[UsageTracker] Initialization failed:', error);
      // Mark as initialized but disabled to prevent blocking
      this.config.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Track a usage event.
   *
   * @param eventType - Event name (e.g., 'playback.start_requested')
   * @param data - Optional event-specific data
   * @param level - Log level (defaults based on event type)
   * @param options - Additional tracking options
   */
  track(
    eventType: string,
    data?: Record<string, unknown>,
    level?: LogLevel,
    options?: TrackOptions,
  ): void {
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    // Build event
    const event = this.buildEvent(eventType, data, level, options);

    if (this.config.debugMode) {
      console.log('[UsageTracker] Track:', event);
    }

    // Add to buffer (fire and forget)
    this.buffer.add(event).catch((error) => {
      console.warn('[UsageTracker] Failed to buffer event:', error);
    });

    // Immediate flush for error events
    if (this.config.flushOnError && level === 'error' && !options?.skipFlush) {
      this.flush().catch((error) => {
        console.warn('[UsageTracker] Error flush failed:', error);
      });
    }

    // Check batch threshold
    if (this.buffer.getEventCount() >= this.config.flushBatchSize) {
      this.flush().catch((error) => {
        console.warn('[UsageTracker] Batch flush failed:', error);
      });
    }
  }

  /**
   * Build a complete usage event.
   */
  private buildEvent(
    eventType: string,
    data?: Record<string, unknown>,
    level?: LogLevel,
    options?: TrackOptions,
  ): UsageEvent {
    const ctx = this.context.isInitialized()
      ? this.context.getContext()
      : this.context.getContextSafe();

    const effectiveLevel = level ?? getDefaultLogLevel(eventType);
    const eventGroup = getEventGroup(eventType);

    // Generate human-readable message
    const msg = this.generateMessage(eventType, data);

    const event: UsageEvent = {
      ts: new Date().toISOString(),
      event: eventType,
      eventGroup,
      level: effectiveLevel,
      msg,
      entrypoint: ctx.entrypoint,
      extVersion: ctx.extVersion,
      installId: ctx.installId,
      sessionId: ctx.sessionId,
    };

    // Optional fields
    if (options?.actionId) {
      event.actionId = options.actionId;
    }

    if (ctx.provider) {
      event.provider = ctx.provider;
    }

    if (ctx.flags && Object.keys(ctx.flags).length > 0) {
      event.flags = ctx.flags;
    }

    // Sanitize and add data
    if (data) {
      event.data = sanitizeEventData(data);
    }

    return event;
  }

  /**
   * Generate a human-readable message for an event.
   */
  private generateMessage(eventType: string, data?: Record<string, unknown>): string {
    // Convert event type to readable format
    const readable = eventType
      .replace(/\./g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Add relevant data to message
    if (data) {
      const extras: string[] = [];

      if (typeof data.provider === 'string') {
        extras.push(`provider=${data.provider}`);
      }
      if (typeof data.paragraphs === 'number') {
        extras.push(`paragraphs=${data.paragraphs}`);
      }
      if (typeof data.durationMs === 'number') {
        extras.push(`duration=${data.durationMs}ms`);
      }

      if (extras.length > 0) {
        return `${readable} (${extras.join(', ')})`;
      }
    }

    return readable;
  }

  /**
   * Flush buffered events to the gateway.
   */
  async flush(_options?: { sync?: boolean }): Promise<void> {
    if (!this.config.enabled || !this.shipper) {
      return;
    }

    // Check circuit breaker
    if (this.shipper.isCircuitOpen()) {
      if (this.config.debugMode) {
        console.log('[UsageTracker] Flush skipped - circuit open');
      }
      return;
    }

    const events = await this.buffer.flush(this.config.flushBatchSize);

    if (events.length === 0) {
      return;
    }

    if (this.config.debugMode) {
      console.log(`[UsageTracker] Flushing ${events.length} events`);
    }

    const success = await this.shipper.send(events);

    if (!success) {
      // Events were already removed from buffer but failed to send
      // They're lost, but we track this in shipper state
      this.track('shipper.flush_failed', {
        eventCount: events.length,
        shipperState: this.shipper.getState(),
      });
    } else {
      this.track(
        'shipper.flush_completed',
        {
          eventCount: events.length,
        },
        'debug',
        { skipFlush: true },
      );
    }
  }

  /**
   * Set the current TTS provider for context.
   */
  setProvider(provider: Provider): void {
    this.context.setProvider(provider);
  }

  /**
   * Clear the current provider.
   */
  clearProvider(): void {
    this.context.clearProvider();
  }

  /**
   * Set feature flags for context.
   */
  setFlags(flags: Record<string, boolean>): void {
    this.context.setFlags(flags);
  }

  /**
   * Track page URL (hashed for privacy).
   */
  trackPage(url: string): void {
    const urlHash = hashUrlSync(url);
    this.track('content.page_visited', { urlHash });
  }

  /**
   * Get tracker statistics.
   */
  async getStats(): Promise<TrackerStats> {
    const bufferStats = await this.buffer.getStats();
    const shipperState = this.shipper?.getState() ?? {
      circuitOpen: false,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      totalEventsSent: 0,
      totalEventsFailed: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    };

    const ctx: UsageContext = this.context.isInitialized()
      ? this.context.getContext()
      : this.context.getContextSafe();

    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      buffer: bufferStats,
      shipper: shipperState,
      context: {
        installId: ctx.installId,
        sessionId: ctx.sessionId,
        entrypoint: ctx.entrypoint,
        provider: ctx.provider,
      },
    };
  }

  /**
   * Peek at buffered logs without removing them.
   * Returns up to `count` events for display in the UI.
   */
  async getBufferedLogs(count = 100): Promise<UsageEvent[]> {
    return this.buffer.peek(count);
  }

  /**
   * Start periodic flush interval.
   */
  private startPeriodicFlush(): void {
    if (this.flushIntervalId) {
      return;
    }

    this.flushIntervalId = setInterval(() => {
      this.flush().catch((error) => {
        console.warn('[UsageTracker] Periodic flush failed:', error);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop periodic flush interval.
   */
  private stopPeriodicFlush(): void {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }

  /**
   * Destroy the tracker and clean up resources.
   */
  destroy(): void {
    this.stopPeriodicFlush();

    // Best-effort final flush
    if (this.config.enabled && this.shipper) {
      this.flush().catch(() => {
        // Ignore errors on destroy
      });
    }

    this.buffer.close();
    this.initialized = false;
  }

  /**
   * Check if tracker is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if tracker is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current entry point.
   */
  getEntrypoint(): Entrypoint {
    return this.config.entrypoint;
  }
}

/**
 * Singleton tracker instance.
 * Use this for most cases to ensure consistent tracking across the extension.
 */
export const usageTracker = new UsageTracker();
