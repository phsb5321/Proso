// Idempotency service — prevents duplicate processing of webhook events
// Uses an in-memory Set with bounded growth (LRU eviction at 10,000 entries).
// Sufficient for single-instance deployments; swap for Redis-backed
// implementation when horizontal scaling is needed.

import { Injectable, Logger } from '@nestjs/common';

/** Maximum number of event IDs to retain before evicting oldest entries. */
const MAX_PROCESSED_EVENTS = 10_000;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly processedEvents = new Set<string>();

  /**
   * Check whether an event has already been processed.
   */
  isProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Mark an event as processed. Evicts the oldest entry when the set
   * exceeds MAX_PROCESSED_EVENTS to prevent unbounded memory growth.
   */
  markProcessed(eventId: string): void {
    this.processedEvents.add(eventId);

    if (this.processedEvents.size > MAX_PROCESSED_EVENTS) {
      const oldest = this.processedEvents.values().next().value;
      if (oldest) {
        this.processedEvents.delete(oldest);
        this.logger.debug(`Evicted oldest event ID from idempotency store: ${oldest}`);
      }
    }
  }

  /**
   * Current number of tracked event IDs (useful for monitoring).
   */
  get size(): number {
    return this.processedEvents.size;
  }
}
