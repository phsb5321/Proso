/**
 * Usage Event Shipper
 *
 * HTTP transport for sending events to the telemetry gateway.
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern with persistence
 * - Gzip compression for large batches
 * - Health tracking
 *
 * @module utils/telemetry/usage/shipper
 */

import type { IngestRequest, ShipperConfig, ShipperState, UsageEvent } from './types';
import { DEFAULT_SHIPPER_CONFIG } from './types';

/**
 * Storage key for persisted circuit state.
 */
const CIRCUIT_STATE_KEY = 'proso_shipper_circuit_state';

/**
 * Subset of state that persists across restarts.
 */
interface PersistedCircuitState {
  circuitOpen: boolean;
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
}

/**
 * Initial shipper state.
 */
const INITIAL_STATE: ShipperState = {
  circuitOpen: false,
  consecutiveFailures: 0,
  circuitOpenedAt: null,
  totalEventsSent: 0,
  totalEventsFailed: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
};

/**
 * HTTP Shipper for sending events to the telemetry gateway.
 */
export class UsageShipper {
  private config: ShipperConfig;
  private state: ShipperState = { ...INITIAL_STATE };
  private initialized = false;

  constructor(config: Pick<ShipperConfig, 'gatewayUrl' | 'gatewayToken'> & Partial<ShipperConfig>) {
    this.config = {
      ...DEFAULT_SHIPPER_CONFIG,
      ...config,
    };
  }

  /**
   * Initialize the shipper by loading persisted circuit state.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.loadCircuitState();
    this.initialized = true;
  }

  /**
   * Load circuit breaker state from storage.
   */
  private async loadCircuitState(): Promise<void> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get(CIRCUIT_STATE_KEY);
        const persisted = result[CIRCUIT_STATE_KEY] as PersistedCircuitState | undefined;

        if (persisted) {
          this.state = {
            ...this.state,
            circuitOpen: persisted.circuitOpen,
            consecutiveFailures: persisted.consecutiveFailures,
            circuitOpenedAt: persisted.circuitOpenedAt,
          };

          // Check if circuit should auto-close based on elapsed time
          if (this.state.circuitOpen && this.state.circuitOpenedAt) {
            const elapsed = Date.now() - this.state.circuitOpenedAt;
            if (elapsed >= this.config.circuitResetMs) {
              // Circuit has been open long enough, reset it
              this.state.circuitOpen = false;
              this.state.consecutiveFailures = 0;
              this.state.circuitOpenedAt = null;
              await this.saveCircuitState();
            }
          }
        }
      }
    } catch (error) {
      console.warn('[UsageShipper] Failed to load circuit state:', error);
    }
  }

  /**
   * Save circuit breaker state to storage.
   */
  private async saveCircuitState(): Promise<void> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const persisted: PersistedCircuitState = {
          circuitOpen: this.state.circuitOpen,
          consecutiveFailures: this.state.consecutiveFailures,
          circuitOpenedAt: this.state.circuitOpenedAt,
        };
        await browser.storage.local.set({ [CIRCUIT_STATE_KEY]: persisted });
      }
    } catch (error) {
      console.warn('[UsageShipper] Failed to save circuit state:', error);
    }
  }

  /**
   * Send a batch of events to the gateway.
   * Returns true if successful, false otherwise.
   */
  async send(events: UsageEvent[]): Promise<boolean> {
    if (events.length === 0) {
      return true;
    }

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check circuit breaker
    if (this.isCircuitOpen()) {
      // Check if we should try to close it
      if (!this.shouldAttemptReset()) {
        return false;
      }
    }

    const payload: IngestRequest = { events };

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const success = await this.attemptSend(payload);

        if (success) {
          await this.onSuccess(events.length);
          return true;
        }
      } catch (error) {
        const isLastAttempt = attempt === this.config.maxRetries;

        if (isLastAttempt) {
          await this.onFailure(events.length, error);
          return false;
        }

        // Wait before retry with exponential backoff
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    return false;
  }

  /**
   * Attempt to send the payload.
   */
  private async attemptSend(payload: IngestRequest): Promise<boolean> {
    const body = JSON.stringify(payload);
    const shouldCompress = this.config.enableGzip && body.length > this.config.gzipThresholdBytes;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.gatewayToken}`,
    };

    let requestBody: BodyInit = body;

    if (shouldCompress) {
      try {
        const compressed = await this.compress(body);
        // Cast to ArrayBuffer for fetch body - safe since we created the Uint8Array
        requestBody = new Blob([compressed as unknown as ArrayBuffer], {
          type: 'application/json',
        });
        headers['Content-Encoding'] = 'gzip';
      } catch {
        // Fall back to uncompressed
        requestBody = body;
      }
    }

    const response = await fetch(this.config.gatewayUrl, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    // Handle response
    if (response.ok) {
      return true;
    }

    // Handle specific error codes
    if (response.status === 401) {
      throw new Error('Authentication failed');
    }

    if (response.status === 429) {
      // Rate limited - get retry-after header
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      throw new RetryableError(`Rate limited, retry after ${delay}ms`, delay);
    }

    if (response.status >= 500) {
      throw new RetryableError(`Server error: ${response.status}`);
    }

    // 4xx errors (except 401, 429) are not retryable
    throw new Error(`Request failed: ${response.status}`);
  }

  /**
   * Compress data using gzip.
   */
  private async compress(data: string): Promise<Uint8Array> {
    // Use CompressionStream API if available
    if (typeof CompressionStream !== 'undefined') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(data));
          controller.close();
        },
      });

      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const reader = compressedStream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    }

    // Fallback: send uncompressed
    throw new Error('CompressionStream not available');
  }

  /**
   * Calculate retry delay with exponential backoff and jitter.
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryBaseDelayMs;
    const maxDelay = this.config.retryMaxDelayMs;

    // Exponential backoff: base * 2^attempt
    const exponentialDelay = baseDelay * 2 ** attempt;

    // Add jitter (0-25% of the delay)
    const jitter = exponentialDelay * 0.25 * Math.random();

    // Cap at max delay
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Handle successful send.
   */
  private async onSuccess(eventCount: number): Promise<void> {
    const wasCircuitOpen = this.state.circuitOpen;

    this.state = {
      ...this.state,
      consecutiveFailures: 0,
      circuitOpen: false,
      circuitOpenedAt: null,
      totalEventsSent: this.state.totalEventsSent + eventCount,
      lastSuccessAt: Date.now(),
      lastError: null,
    };

    // Persist if circuit state changed
    if (wasCircuitOpen) {
      await this.saveCircuitState();
    }
  }

  /**
   * Handle failed send.
   */
  private async onFailure(eventCount: number, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const consecutiveFailures = this.state.consecutiveFailures + 1;

    const shouldOpenCircuit = consecutiveFailures >= this.config.maxConsecutiveFailures;
    const circuitStateChanged = shouldOpenCircuit && !this.state.circuitOpen;

    this.state = {
      ...this.state,
      consecutiveFailures,
      circuitOpen: shouldOpenCircuit,
      circuitOpenedAt: shouldOpenCircuit ? Date.now() : this.state.circuitOpenedAt,
      totalEventsFailed: this.state.totalEventsFailed + eventCount,
      lastFailureAt: Date.now(),
      lastError: errorMessage,
    };

    // Persist circuit state changes
    if (circuitStateChanged || consecutiveFailures <= this.config.maxConsecutiveFailures) {
      await this.saveCircuitState();
    }
  }

  /**
   * Check if the circuit breaker is open.
   */
  isCircuitOpen(): boolean {
    return this.state.circuitOpen;
  }

  /**
   * Check if we should attempt to reset the circuit.
   */
  private shouldAttemptReset(): boolean {
    if (!this.state.circuitOpenedAt) {
      return true;
    }

    const elapsed = Date.now() - this.state.circuitOpenedAt;
    return elapsed >= this.config.circuitResetMs;
  }

  /**
   * Get current shipper state.
   */
  getState(): ShipperState {
    return { ...this.state };
  }

  /**
   * Reset shipper state and clear persisted circuit state.
   */
  async reset(): Promise<void> {
    this.state = { ...INITIAL_STATE };
    await this.saveCircuitState();
  }

  /**
   * Check if shipper is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Update gateway configuration.
   */
  updateConfig(config: Partial<ShipperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Error that indicates the request can be retried.
 */
class RetryableError extends Error {
  constructor(
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}
