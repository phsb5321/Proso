/**
 * UsageBuffer Unit Tests
 *
 * Tests for the IndexedDB-backed ring buffer that stores usage events
 * before shipping to Loki. Verifies buffering, eviction, flush, peek,
 * stats, cleanup, and lifecycle methods.
 *
 * @module tests/unit/telemetry/usage-buffer
 */

// Polyfill structuredClone for jsdom (fake-indexeddb needs it)
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
}

import 'fake-indexeddb/auto';
import { UsageBuffer } from '../../../src/utils/telemetry/usage/buffer.js';
import type { UsageEvent } from '../../../src/utils/telemetry/usage/types.js';

/** Counter to generate unique DB names per test. */
let dbCounter = 0;

/** Create a unique DB name so tests don't share IndexedDB state. */
function uniqueDbName(): string {
  return `test_usage_buffer_${Date.now()}_${dbCounter++}`;
}

/** Create a valid UsageEvent with optional overrides. */
function createTestEvent(overrides?: Partial<UsageEvent>): UsageEvent {
  return {
    ts: new Date().toISOString(),
    event: 'test.event',
    eventGroup: 'system',
    level: 'info',
    msg: 'Test event',
    entrypoint: 'background',
    extVersion: '1.0.0',
    installId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '550e8400-e29b-41d4-a716-446655440001',
    ...overrides,
  };
}

describe('UsageBuffer', () => {
  let buffer: UsageBuffer;

  afterEach(() => {
    // Always close to release IDB connections
    try {
      buffer?.close();
    } catch {
      // ignore
    }
  });

  // -------------------------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('uses default config when none provided', () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      expect(buffer.isInitialized()).toBe(false);
      expect(buffer.getEventCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Initialize
  // -------------------------------------------------------------------------
  describe('initialize', () => {
    it('opens IndexedDB successfully', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();
      expect(buffer.isInitialized()).toBe(true);
    });

    it('is idempotent - calling twice does not throw', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();
      await buffer.initialize(); // second call should be a no-op
      expect(buffer.isInitialized()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Add - single event
  // -------------------------------------------------------------------------
  describe('add', () => {
    it('stores an event and increments count', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      const result = await buffer.add(createTestEvent());
      expect(result).toBe(true);
      expect(buffer.getEventCount()).toBe(1);
    });

    // -----------------------------------------------------------------------
    // 4. Add - multiple events stored in order
    // -----------------------------------------------------------------------
    it('stores multiple events in order', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      const events = [
        createTestEvent({ msg: 'first' }),
        createTestEvent({ msg: 'second' }),
        createTestEvent({ msg: 'third' }),
      ];

      for (const e of events) {
        await buffer.add(e);
      }

      expect(buffer.getEventCount()).toBe(3);

      const peeked = await buffer.peek(3);
      expect(peeked).toHaveLength(3);
      expect(peeked[0].msg).toBe('first');
      expect(peeked[1].msg).toBe('second');
      expect(peeked[2].msg).toBe('third');
    });

    // -----------------------------------------------------------------------
    // 13. Not initialized - add returns false
    // -----------------------------------------------------------------------
    it('returns false when not initialized', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      // intentionally not calling initialize()
      const result = await buffer.add(createTestEvent());
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Flush - returns stored events and removes them
  // -------------------------------------------------------------------------
  describe('flush', () => {
    it('returns stored events and removes them from buffer', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      await buffer.add(createTestEvent({ msg: 'a' }));
      await buffer.add(createTestEvent({ msg: 'b' }));

      const flushed = await buffer.flush(10);
      expect(flushed).toHaveLength(2);
      expect(flushed[0].msg).toBe('a');
      expect(flushed[1].msg).toBe('b');

      // Buffer should now be empty
      expect(buffer.getEventCount()).toBe(0);
      const remaining = await buffer.peek(10);
      expect(remaining).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // 6. Flush - returns empty when no events
    // -----------------------------------------------------------------------
    it('returns empty array when no events buffered', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      const flushed = await buffer.flush(10);
      expect(flushed).toEqual([]);
    });

    it('returns empty array when not initialized', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      const flushed = await buffer.flush(10);
      expect(flushed).toEqual([]);
    });

    it('respects count limit', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      for (let i = 0; i < 5; i++) {
        await buffer.add(createTestEvent({ msg: `event-${i}` }));
      }

      const flushed = await buffer.flush(2);
      expect(flushed).toHaveLength(2);
      expect(flushed[0].msg).toBe('event-0');
      expect(flushed[1].msg).toBe('event-1');
      expect(buffer.getEventCount()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Peek - returns events without removing
  // -------------------------------------------------------------------------
  describe('peek', () => {
    it('returns events without removing them', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      await buffer.add(createTestEvent({ msg: 'peek-me' }));

      const peeked = await buffer.peek(10);
      expect(peeked).toHaveLength(1);
      expect(peeked[0].msg).toBe('peek-me');

      // Should still be there
      expect(buffer.getEventCount()).toBe(1);
      const peekedAgain = await buffer.peek(10);
      expect(peekedAgain).toHaveLength(1);
    });

    it('returns empty array when not initialized', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      const peeked = await buffer.peek(10);
      expect(peeked).toEqual([]);
    });

    it('respects count limit', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      for (let i = 0; i < 5; i++) {
        await buffer.add(createTestEvent({ msg: `ev-${i}` }));
      }

      const peeked = await buffer.peek(3);
      expect(peeked).toHaveLength(3);
      // events should still be there
      expect(buffer.getEventCount()).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 8. GetStats - returns correct stats
  // -------------------------------------------------------------------------
  describe('getStats', () => {
    it('returns correct stats after adding events', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName(), maxBytes: 1_000_000 });
      await buffer.initialize();

      await buffer.add(createTestEvent({ msg: 'stat-event' }));

      const stats = await buffer.getStats();
      expect(stats.eventCount).toBe(1);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.maxBytes).toBe(1_000_000);
      expect(stats.percentFull).toBeGreaterThan(0);
      expect(stats.percentFull).toBeLessThan(1); // single small event
      expect(stats.oldestEventAgeMs).toBeGreaterThanOrEqual(0);
      expect(stats.droppedCount).toBe(0);
    });

    it('returns zero stats when empty', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      const stats = await buffer.getStats();
      expect(stats.eventCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.percentFull).toBe(0);
      expect(stats.droppedCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Eviction - evicts oldest when buffer is full (ring buffer behavior)
  // -------------------------------------------------------------------------
  describe('eviction', () => {
    it('evicts oldest events when buffer is full', async () => {
      // Use very small maxBytes so a couple events fill it
      buffer = new UsageBuffer({ dbName: uniqueDbName(), maxBytes: 400 });
      await buffer.initialize();

      // Add events until we exceed capacity and force eviction
      const event1 = createTestEvent({ msg: 'old-event' });
      const event2 = createTestEvent({ msg: 'mid-event' });
      const event3 = createTestEvent({ msg: 'new-event' });

      await buffer.add(event1);
      await buffer.add(event2);
      // This one should trigger eviction of the oldest
      await buffer.add(event3);

      const stats = await buffer.getStats();
      // dropped count should have increased due to eviction
      expect(stats.droppedCount).toBeGreaterThan(0);

      // The oldest event should have been evicted
      const peeked = await buffer.peek(10);
      const messages = peeked.map((e) => e.msg);
      // The newest event must be present
      expect(messages).toContain('new-event');
      // At least one old event should have been evicted
      expect(peeked.length).toBeLessThan(3);
    });

    it('does not leak memory - total bytes stays within maxBytes', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName(), maxBytes: 500 });
      await buffer.initialize();

      for (let i = 0; i < 10; i++) {
        await buffer.add(createTestEvent({ msg: `event-${i}` }));
      }

      const stats = await buffer.getStats();
      expect(stats.totalBytes).toBeLessThanOrEqual(500);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Clear - removes all events and resets stats
  // -------------------------------------------------------------------------
  describe('clear', () => {
    it('removes all events and resets stats', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      await buffer.add(createTestEvent());
      await buffer.add(createTestEvent());
      expect(buffer.getEventCount()).toBe(2);

      await buffer.clear();

      expect(buffer.getEventCount()).toBe(0);
      const stats = await buffer.getStats();
      expect(stats.eventCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.droppedCount).toBe(0);

      const peeked = await buffer.peek(10);
      expect(peeked).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 11. GetEventCount - tracks count correctly
  // -------------------------------------------------------------------------
  describe('getEventCount', () => {
    it('tracks count correctly through add and flush', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();

      expect(buffer.getEventCount()).toBe(0);

      await buffer.add(createTestEvent());
      expect(buffer.getEventCount()).toBe(1);

      await buffer.add(createTestEvent());
      expect(buffer.getEventCount()).toBe(2);

      await buffer.flush(1);
      expect(buffer.getEventCount()).toBe(1);

      await buffer.flush(1);
      expect(buffer.getEventCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Close - closes database connection
  // -------------------------------------------------------------------------
  describe('close', () => {
    it('closes database connection and resets initialized state', async () => {
      buffer = new UsageBuffer({ dbName: uniqueDbName() });
      await buffer.initialize();
      expect(buffer.isInitialized()).toBe(true);

      buffer.close();
      expect(buffer.isInitialized()).toBe(false);

      // Operations after close should fail gracefully
      const result = await buffer.add(createTestEvent());
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup - removes expired events
  // -------------------------------------------------------------------------
  describe('cleanup', () => {
    it('removes events older than maxAgeMs', async () => {
      // Use a very short maxAgeMs
      buffer = new UsageBuffer({ dbName: uniqueDbName(), maxAgeMs: 1 });

      // We need to add an event and then wait for it to expire.
      // Since initialize() calls cleanup() internally, we need to
      // add events manually after init, then wait and call cleanup.
      // But maxAgeMs=1ms means almost everything is expired.
      // Let's use a different approach: create buffer with long maxAge,
      // add events, then create a new buffer with short maxAge.

      buffer = new UsageBuffer({
        dbName: uniqueDbName(),
        maxAgeMs: 50,
      });
      await buffer.initialize();

      await buffer.add(createTestEvent({ msg: 'will-expire' }));
      expect(buffer.getEventCount()).toBe(1);

      // Wait for events to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const removed = await buffer.cleanup();
      expect(removed).toBe(1);
      expect(buffer.getEventCount()).toBe(0);
    });
  });
});
