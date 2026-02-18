// Unit tests for IdempotencyService
// Tests in-memory event deduplication with bounded growth (LRU eviction).

import { IdempotencyService } from '../../../src/infrastructure/services/idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
  });

  // ─── isProcessed ──────────────────────────────────────────────────

  it('returns false for an unknown event ID', () => {
    expect(service.isProcessed('evt_never_seen')).toBe(false);
  });

  it('returns true after markProcessed is called for the same event ID', () => {
    service.markProcessed('evt_001');
    expect(service.isProcessed('evt_001')).toBe(true);
  });

  it('tracks multiple different event IDs independently', () => {
    service.markProcessed('evt_aaa');
    service.markProcessed('evt_bbb');

    expect(service.isProcessed('evt_aaa')).toBe(true);
    expect(service.isProcessed('evt_bbb')).toBe(true);
    expect(service.isProcessed('evt_ccc')).toBe(false);
  });

  // ─── Eviction ─────────────────────────────────────────────────────

  it('evicts the oldest entry when exceeding 10,000 limit', () => {
    // The internal MAX_PROCESSED_EVENTS is 10,000.
    // We add 10,001 entries to trigger eviction of the first.
    const firstEventId = 'evt_first_to_evict';
    service.markProcessed(firstEventId);

    for (let i = 1; i <= 10_000; i++) {
      service.markProcessed(`evt_${i}`);
    }

    // After 10,001 entries, the very first one should have been evicted
    expect(service.isProcessed(firstEventId)).toBe(false);

    // But the most recent entries should still be present
    expect(service.isProcessed('evt_10000')).toBe(true);
    expect(service.isProcessed('evt_9999')).toBe(true);
  });

  it('maintains max size of 10,000 after eviction', () => {
    for (let i = 0; i < 10_002; i++) {
      service.markProcessed(`evt_${i}`);
    }

    // Size should be capped at 10,000 (two evictions)
    expect(service.size).toBe(10_000);
  });

  // ─── size getter ──────────────────────────────────────────────────

  it('returns 0 when no events have been processed', () => {
    expect(service.size).toBe(0);
  });

  it('returns correct count after adding events', () => {
    service.markProcessed('evt_a');
    service.markProcessed('evt_b');
    service.markProcessed('evt_c');

    expect(service.size).toBe(3);
  });

  it('does not increment size for duplicate event IDs', () => {
    service.markProcessed('evt_same');
    service.markProcessed('evt_same');
    service.markProcessed('evt_same');

    expect(service.size).toBe(1);
  });

  // ─── Idempotency behavior ────────────────────────────────────────

  it('markProcessed is idempotent (calling twice does not error)', () => {
    expect(() => {
      service.markProcessed('evt_dup');
      service.markProcessed('evt_dup');
    }).not.toThrow();

    expect(service.isProcessed('evt_dup')).toBe(true);
  });
});
