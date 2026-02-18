/**
 * Usage Tracker Unit Tests
 *
 * Tests for the UsageTracker class that orchestrates event collection,
 * buffering, and shipping to the telemetry gateway.
 *
 * Contract requirements covered:
 * 1. Initializes with gateway URL and token from storage
 * 2. Tracks event with correct schema (timestamp, type, metadata)
 * 3. Does not initialize when gateway config is missing
 * 4. Does not track when telemetry is disabled
 *
 * @module tests/unit/telemetry/usage-tracker
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src/utils/telemetry/usage');

// ---------------------------------------------------------------------------
// Mocks - declared BEFORE dynamic imports
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockContextInstance = {
  initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getContext: jest.fn<() => any>().mockReturnValue({
    installId: 'test-install-id',
    sessionId: 'test-session-id',
    extVersion: '1.0.0',
    entrypoint: 'background',
    provider: undefined,
    flags: undefined,
  }),
  getContextSafe: jest.fn<() => any>().mockReturnValue({
    installId: 'safe-install-id',
    sessionId: 'safe-session-id',
    extVersion: 'unknown',
    entrypoint: 'background',
    provider: undefined,
    flags: undefined,
  }),
  isInitialized: jest.fn<() => boolean>().mockReturnValue(true),
  getEntrypoint: jest.fn<() => string>().mockReturnValue('background'),
  setProvider: jest.fn<(p: any) => void>(),
  clearProvider: jest.fn<() => void>(),
  setFlags: jest.fn<(f: any) => void>(),
  getInstallId: jest.fn<() => string | null>().mockReturnValue('test-install-id'),
  getSessionId: jest.fn<() => string>().mockReturnValue('test-session-id'),
};

const MockContextProvider = jest.fn<() => any>().mockImplementation(() => mockContextInstance);

const mockBufferInstance = {
  initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  add: jest.fn<(e: any) => Promise<boolean>>().mockResolvedValue(true),
  flush: jest.fn<(n: number) => Promise<any[]>>().mockResolvedValue([]),
  peek: jest.fn<(n: number) => Promise<any[]>>().mockResolvedValue([]),
  getStats: jest.fn<() => Promise<any>>().mockResolvedValue({
    eventCount: 0,
    totalBytes: 0,
    maxBytes: 10485760,
    percentFull: 0,
    oldestEventAgeMs: 0,
    droppedCount: 0,
  }),
  getEventCount: jest.fn<() => number>().mockReturnValue(0),
  close: jest.fn<() => void>(),
  isInitialized: jest.fn<() => boolean>().mockReturnValue(true),
};

const MockUsageBuffer = jest.fn<() => any>().mockImplementation(() => mockBufferInstance);

const mockShipperInstance = {
  send: jest.fn<(events: any[]) => Promise<boolean>>().mockResolvedValue(true),
  isCircuitOpen: jest.fn<() => boolean>().mockReturnValue(false),
  getState: jest.fn<() => any>().mockReturnValue({
    circuitOpen: false,
    consecutiveFailures: 0,
    circuitOpenedAt: null,
    totalEventsSent: 0,
    totalEventsFailed: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  }),
};

const MockUsageShipper = jest.fn<() => any>().mockImplementation(() => mockShipperInstance);

const mockSanitizeEventData = jest.fn<(data: any) => any>((data) => data);
const mockHashUrlSync = jest.fn<(url: string) => string>().mockReturnValue('hashed-url');

jest.unstable_mockModule(resolve(srcDir, 'context'), () => ({
  ContextProvider: MockContextProvider,
}));

jest.unstable_mockModule(resolve(srcDir, 'buffer'), () => ({
  UsageBuffer: MockUsageBuffer,
}));

jest.unstable_mockModule(resolve(srcDir, 'shipper'), () => ({
  UsageShipper: MockUsageShipper,
}));

jest.unstable_mockModule(resolve(srcDir, 'redaction'), () => ({
  sanitizeEventData: mockSanitizeEventData,
  hashUrlSync: mockHashUrlSync,
}));

// ---------------------------------------------------------------------------
// Dynamic import AFTER mocks
// ---------------------------------------------------------------------------

const { UsageTracker } = await import('../../../src/utils/telemetry/usage/tracker');

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  gatewayUrl: 'https://gateway.example.com/ingest',
  gatewayToken: 'test-token-123',
  // Use a very long flush interval to prevent periodic timer from firing
  // during tests (avoids recursive flush->track->flush loops)
  flushIntervalMs: 999_999_999,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsageTracker', () => {
  let tracker: InstanceType<typeof UsageTracker>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset ALL mock implementations that tests may have overridden.
    // jest.clearAllMocks() only clears recorded calls/results, NOT
    // implementations set via mockImplementation/mockResolvedValue.
    mockContextInstance.initialize.mockResolvedValue(undefined);
    mockContextInstance.isInitialized.mockReturnValue(true);
    mockContextInstance.getContext.mockReturnValue({
      installId: 'test-install-id',
      sessionId: 'test-session-id',
      extVersion: '1.0.0',
      entrypoint: 'background',
      provider: undefined,
      flags: undefined,
    });
    mockContextInstance.getContextSafe.mockReturnValue({
      installId: 'safe-install-id',
      sessionId: 'safe-session-id',
      extVersion: 'unknown',
      entrypoint: 'background',
      provider: undefined,
      flags: undefined,
    });
    mockContextInstance.getEntrypoint.mockReturnValue('background');
    mockContextInstance.getInstallId.mockReturnValue('test-install-id');
    mockContextInstance.getSessionId.mockReturnValue('test-session-id');

    mockBufferInstance.initialize.mockResolvedValue(undefined);
    mockBufferInstance.add.mockResolvedValue(true);
    mockBufferInstance.flush.mockResolvedValue([]);
    mockBufferInstance.peek.mockResolvedValue([]);
    mockBufferInstance.getEventCount.mockReturnValue(0);
    mockBufferInstance.isInitialized.mockReturnValue(true);

    mockShipperInstance.isCircuitOpen.mockReturnValue(false);
    mockShipperInstance.send.mockResolvedValue(true);

    mockSanitizeEventData.mockImplementation((data: unknown) => data);
    mockHashUrlSync.mockReturnValue('hashed-url');

    tracker = new UsageTracker();
  });

  afterEach(async () => {
    // Reset buffer.flush to return empty before destroying, to prevent
    // destroy()'s final flush() from triggering recursive flush loops
    // via track('shipper.flush_completed/failed').
    mockBufferInstance.flush.mockResolvedValue([]);
    try {
      tracker.destroy();
    } catch {
      // ignore
    }
    // Let any fire-and-forget promises settle
    await new Promise<void>((r) => setTimeout(r, 10));
  });

  // =========================================================================
  // 1. Constructor
  // =========================================================================

  describe('constructor', () => {
    it('creates with default config', () => {
      expect(tracker.isEnabled()).toBe(true);
      expect(tracker.isInitialized()).toBe(false);
      expect(tracker.getEntrypoint()).toBe('background');
    });

    it('creates ContextProvider and UsageBuffer on construction', () => {
      expect(MockContextProvider).toHaveBeenCalled();
      expect(MockUsageBuffer).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Initialize - with valid config (gatewayUrl + gatewayToken)
  // =========================================================================

  describe('initialize', () => {
    it('initializes with gateway URL and token from config', async () => {
      await tracker.initialize(VALID_CONFIG);

      expect(tracker.isInitialized()).toBe(true);
      expect(tracker.isEnabled()).toBe(true);

      // ContextProvider re-created with entrypoint and initialized
      expect(MockContextProvider).toHaveBeenCalledWith('background');
      expect(mockContextInstance.initialize).toHaveBeenCalled();

      // Buffer re-created and initialized
      expect(MockUsageBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          maxBytes: expect.any(Number),
          maxAgeMs: expect.any(Number),
        }),
      );
      expect(mockBufferInstance.initialize).toHaveBeenCalled();

      // Shipper created with gateway config
      expect(MockUsageShipper).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayUrl: 'https://gateway.example.com/ingest',
          gatewayToken: 'test-token-123',
        }),
      );
    });

    // =========================================================================
    // 3. Initialize - skips when enabled=false
    // =========================================================================

    it('skips full initialization when enabled is false', async () => {
      await tracker.initialize({ ...VALID_CONFIG, enabled: false });

      expect(tracker.isInitialized()).toBe(true);
      expect(tracker.isEnabled()).toBe(false);
      // Shipper should NOT be created
      expect(MockUsageShipper).not.toHaveBeenCalled();
    });

    // =========================================================================
    // 4. Initialize - handles init errors gracefully
    // =========================================================================

    it('handles initialization errors gracefully by disabling', async () => {
      mockContextInstance.initialize.mockRejectedValueOnce(new Error('init boom'));

      await tracker.initialize(VALID_CONFIG);

      // Should be initialized but disabled
      expect(tracker.isInitialized()).toBe(true);
      expect(tracker.isEnabled()).toBe(false);
    });

    // =========================================================================
    // 5. Initialize - prevents duplicate initialization
    // =========================================================================

    it('prevents duplicate initialization', async () => {
      await tracker.initialize(VALID_CONFIG);
      const initCallCount = mockContextInstance.initialize.mock.calls.length;

      await tracker.initialize({ ...VALID_CONFIG, gatewayToken: 'second-token' });

      expect(mockContextInstance.initialize.mock.calls.length).toBe(initCallCount);
    });

    it('prevents concurrent initialization (pendingInit guard)', async () => {
      let resolveInit!: () => void;
      mockContextInstance.initialize.mockImplementation(
        () => new Promise<void>((r) => { resolveInit = r; }),
      );

      const p1 = tracker.initialize(VALID_CONFIG);
      const p2 = tracker.initialize(VALID_CONFIG);

      resolveInit();
      await p1;
      await p2;

      expect(mockContextInstance.initialize).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Track - builds event with correct schema
  // =========================================================================

  describe('track', () => {
    beforeEach(async () => {
      await tracker.initialize(VALID_CONFIG);
    });

    it('builds event with correct schema fields', () => {
      tracker.track('playback.start_requested', { paragraphs: 5 }, 'info');

      expect(mockBufferInstance.add).toHaveBeenCalledTimes(1);
      const event = mockBufferInstance.add.mock.calls[0][0];

      // Required schema fields
      expect(event).toHaveProperty('ts');
      expect(event).toHaveProperty('event', 'playback.start_requested');
      expect(event).toHaveProperty('eventGroup', 'user');
      expect(event).toHaveProperty('level', 'info');
      expect(event).toHaveProperty('msg');
      expect(event).toHaveProperty('entrypoint', 'background');
      expect(event).toHaveProperty('extVersion', '1.0.0');
      expect(event).toHaveProperty('installId', 'test-install-id');
      expect(event).toHaveProperty('sessionId', 'test-session-id');

      // Timestamp should be ISO format
      expect(() => new Date(event.ts)).not.toThrow();
      expect(event.ts).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('uses getDefaultLogLevel when level not provided', () => {
      tracker.track('error.uncaught');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.level).toBe('error');
    });

    it('uses getDefaultLogLevel for _failed suffix events', () => {
      tracker.track('tts.request_failed');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.level).toBe('error');
    });

    it('uses provided level when explicitly specified', () => {
      tracker.track('playback.start_requested', undefined, 'warn');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.level).toBe('warn');
    });

    it('sets correct eventGroup based on event prefix', () => {
      tracker.track('shipper.flush_started');
      expect(mockBufferInstance.add.mock.calls[0][0].eventGroup).toBe('shipper');

      tracker.track('api.request_started');
      expect(mockBufferInstance.add.mock.calls[1][0].eventGroup).toBe('network');

      tracker.track('tts.request_started');
      expect(mockBufferInstance.add.mock.calls[2][0].eventGroup).toBe('playback');
    });

    it('includes actionId when provided in options', () => {
      tracker.track('playback.start_requested', undefined, 'info', {
        actionId: 'action-uuid-123',
      });

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.actionId).toBe('action-uuid-123');
    });

    it('includes provider from context when set', () => {
      mockContextInstance.getContext.mockReturnValue({
        installId: 'test-install-id',
        sessionId: 'test-session-id',
        extVersion: '1.0.0',
        entrypoint: 'background',
        provider: 'elevenlabs',
        flags: undefined,
      });

      tracker.track('tts.request_started');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.provider).toBe('elevenlabs');
    });

    it('includes flags from context when set', () => {
      mockContextInstance.getContext.mockReturnValue({
        installId: 'test-install-id',
        sessionId: 'test-session-id',
        extVersion: '1.0.0',
        entrypoint: 'background',
        provider: undefined,
        flags: { featureA: true, featureB: false },
      });

      tracker.track('flags.snapshot');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.flags).toEqual({ featureA: true, featureB: false });
    });

    // =========================================================================
    // 7. Track - does nothing when disabled
    // =========================================================================

    it('does not track when telemetry is disabled', async () => {
      const disabledTracker = new UsageTracker();
      await disabledTracker.initialize({ ...VALID_CONFIG, enabled: false });

      mockBufferInstance.add.mockClear();
      disabledTracker.track('playback.start_requested', { paragraphs: 5 });

      expect(mockBufferInstance.add).not.toHaveBeenCalled();
      disabledTracker.destroy();
    });

    // =========================================================================
    // 8. Track - sanitizes event data via sanitizeEventData
    // =========================================================================

    it('sanitizes event data via sanitizeEventData', () => {
      const rawData = { apiKey: 'secret-key', info: 'safe' };
      mockSanitizeEventData.mockReturnValue({ apiKey: '[REDACTED]', info: 'safe' });

      tracker.track('settings.api_key_changed', rawData);

      expect(mockSanitizeEventData).toHaveBeenCalledWith(rawData);
      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.data).toEqual({ apiKey: '[REDACTED]', info: 'safe' });
    });

    it('does not set data field when no data provided', () => {
      tracker.track('popup.opened');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.data).toBeUndefined();
      expect(mockSanitizeEventData).not.toHaveBeenCalled();
    });

    // =========================================================================
    // 9. Track - triggers immediate flush for error events
    // =========================================================================

    it('triggers immediate flush for error events when flushOnError is true', () => {
      mockBufferInstance.flush.mockResolvedValue([]);

      tracker.track('error.uncaught', { message: 'boom' }, 'error');

      // flush() is called synchronously as fire-and-forget inside track()
      expect(mockBufferInstance.flush).toHaveBeenCalled();
    });

    it('does not trigger immediate flush when skipFlush option is set', () => {
      mockBufferInstance.flush.mockClear();

      tracker.track('error.uncaught', { message: 'boom' }, 'error', { skipFlush: true });

      expect(mockBufferInstance.flush).not.toHaveBeenCalled();
    });

    it('triggers batch flush when buffer reaches flushBatchSize', () => {
      mockBufferInstance.getEventCount.mockReturnValue(100);
      mockBufferInstance.flush.mockClear();

      tracker.track('playback.paragraph_started');

      expect(mockBufferInstance.flush).toHaveBeenCalled();
    });

    it('uses getContextSafe when context is not initialized', () => {
      mockContextInstance.isInitialized.mockReturnValue(false);

      tracker.track('popup.opened');

      expect(mockContextInstance.getContextSafe).toHaveBeenCalled();
      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.installId).toBe('safe-install-id');
    });

    it('generates human-readable message from event type', () => {
      tracker.track('playback.start_requested');

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.msg).toBe('Playback Start Requested');
    });

    it('includes data in human-readable message when relevant', () => {
      tracker.track('tts.request_completed', {
        provider: 'elevenlabs',
        durationMs: 250,
      });

      const event = mockBufferInstance.add.mock.calls[0][0];
      expect(event.msg).toContain('provider=elevenlabs');
      expect(event.msg).toContain('duration=250ms');
    });
  });

  // =========================================================================
  // 10. Flush - sends buffered events via shipper
  // =========================================================================

  describe('flush', () => {
    beforeEach(async () => {
      await tracker.initialize(VALID_CONFIG);
    });

    it('sends buffered events via shipper', async () => {
      const mockEvents = [
        { ts: '2026-01-01T00:00:00.000Z', event: 'test.event', eventGroup: 'system' },
      ];
      // Return events only once to prevent recursive flush loops
      mockBufferInstance.flush.mockResolvedValueOnce(mockEvents).mockResolvedValue([]);

      await tracker.flush();
      // Drain microtask queue for fire-and-forget track('flush_completed')
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(mockBufferInstance.flush).toHaveBeenCalled();
      expect(mockShipperInstance.send).toHaveBeenCalledWith(mockEvents);
    });

    it('does not send when buffer is empty', async () => {
      mockBufferInstance.flush.mockResolvedValue([]);

      await tracker.flush();

      expect(mockShipperInstance.send).not.toHaveBeenCalled();
    });

    // =========================================================================
    // 11. Flush - skips when circuit is open
    // =========================================================================

    it('skips flush when circuit breaker is open', async () => {
      mockShipperInstance.isCircuitOpen.mockReturnValue(true);
      mockBufferInstance.flush.mockClear();

      await tracker.flush();

      expect(mockBufferInstance.flush).not.toHaveBeenCalled();
      expect(mockShipperInstance.send).not.toHaveBeenCalled();
    });

    // =========================================================================
    // 12. Flush - does nothing when disabled
    // =========================================================================

    it('does nothing when disabled', async () => {
      const disabledTracker = new UsageTracker();
      await disabledTracker.initialize({ ...VALID_CONFIG, enabled: false });

      await disabledTracker.flush();

      expect(mockShipperInstance.send).not.toHaveBeenCalled();
      disabledTracker.destroy();
    });

    it('does nothing when shipper is null (not initialized)', async () => {
      const freshTracker = new UsageTracker();

      await freshTracker.flush();

      expect(mockShipperInstance.send).not.toHaveBeenCalled();
      freshTracker.destroy();
    });

    it('tracks flush_failed when shipper.send returns false', async () => {
      // Return events only once — subsequent flush() calls (triggered by the
      // recursive track('shipper.flush_failed', level='error') → flushOnError)
      // must see an empty buffer to break the recursion.
      mockBufferInstance.flush
        .mockResolvedValueOnce([
          { ts: '2026-01-01T00:00:00.000Z', event: 'test.event', eventGroup: 'system' },
        ])
        .mockResolvedValue([]);
      mockShipperInstance.send.mockResolvedValue(false);

      await tracker.flush();
      // Drain microtask queue so the fire-and-forget recursive flush settles
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(mockBufferInstance.add).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'shipper.flush_failed',
        }),
      );
    });

    it('tracks flush_completed on successful send', async () => {
      // Return events only once to prevent recursive flush loops
      mockBufferInstance.flush
        .mockResolvedValueOnce([
          { ts: '2026-01-01T00:00:00.000Z', event: 'test.event', eventGroup: 'system' },
        ])
        .mockResolvedValue([]);
      mockShipperInstance.send.mockResolvedValue(true);

      await tracker.flush();
      // Drain microtask queue so the fire-and-forget track('flush_completed') settles
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(mockBufferInstance.add).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'shipper.flush_completed',
        }),
      );
    });
  });

  // =========================================================================
  // 13. getStats
  // =========================================================================

  describe('getStats', () => {
    it('returns combined stats from buffer, shipper, and context', async () => {
      await tracker.initialize(VALID_CONFIG);

      const stats = await tracker.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          enabled: true,
          initialized: true,
          buffer: expect.objectContaining({
            eventCount: 0,
            totalBytes: 0,
          }),
          shipper: expect.objectContaining({
            circuitOpen: false,
          }),
          context: expect.objectContaining({
            installId: 'test-install-id',
            sessionId: 'test-session-id',
            entrypoint: 'background',
          }),
        }),
      );
    });

    it('returns default shipper state when shipper is null', async () => {
      const stats = await tracker.getStats();

      expect(stats.shipper).toEqual(
        expect.objectContaining({
          circuitOpen: false,
          consecutiveFailures: 0,
          totalEventsSent: 0,
          totalEventsFailed: 0,
        }),
      );
    });
  });

  // =========================================================================
  // 14. destroy
  // =========================================================================

  describe('destroy', () => {
    it('stops periodic flush and closes buffer', async () => {
      await tracker.initialize(VALID_CONFIG);

      tracker.destroy();

      expect(mockBufferInstance.close).toHaveBeenCalled();
      expect(tracker.isInitialized()).toBe(false);
    });

    it('attempts final flush before closing', async () => {
      await tracker.initialize(VALID_CONFIG);
      mockBufferInstance.flush.mockClear();
      // Ensure final flush sees empty buffer to avoid recursive loops
      mockBufferInstance.flush.mockResolvedValue([]);

      tracker.destroy();

      expect(mockBufferInstance.flush).toHaveBeenCalled();
    });

    it('does not attempt final flush when disabled', async () => {
      const disabledTracker = new UsageTracker();
      await disabledTracker.initialize({ ...VALID_CONFIG, enabled: false });
      mockBufferInstance.flush.mockClear();

      disabledTracker.destroy();

      expect(mockBufferInstance.flush).not.toHaveBeenCalled();
    });

    it('stops periodic flush interval so no more flushes occur', async () => {
      // Use a short interval so we can verify the interval was cleared
      const shortInterval = 100;
      const t = new UsageTracker();
      await t.initialize({ ...VALID_CONFIG, flushIntervalMs: shortInterval });

      t.destroy();
      mockBufferInstance.flush.mockClear();

      // Wait longer than the interval - if interval wasn't cleared, flush
      // would be called. We use a real setTimeout to verify.
      await new Promise<void>((r) => setTimeout(r, shortInterval * 3));

      expect(mockBufferInstance.flush).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 15. setProvider / clearProvider
  // =========================================================================

  describe('setProvider / clearProvider', () => {
    it('delegates setProvider to context', () => {
      tracker.setProvider('elevenlabs');
      expect(mockContextInstance.setProvider).toHaveBeenCalledWith('elevenlabs');
    });

    it('delegates clearProvider to context', () => {
      tracker.clearProvider();
      expect(mockContextInstance.clearProvider).toHaveBeenCalled();
    });

    it('delegates setFlags to context', () => {
      tracker.setFlags({ featureA: true });
      expect(mockContextInstance.setFlags).toHaveBeenCalledWith({ featureA: true });
    });
  });

  // =========================================================================
  // 16. trackPage
  // =========================================================================

  describe('trackPage', () => {
    beforeEach(async () => {
      await tracker.initialize(VALID_CONFIG);
    });

    it('hashes URL and tracks content.page_visited event', () => {
      tracker.trackPage('https://example.com/article');

      expect(mockHashUrlSync).toHaveBeenCalledWith('https://example.com/article');
      expect(mockBufferInstance.add).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'content.page_visited',
          data: { urlHash: 'hashed-url' },
        }),
      );
    });
  });

  // =========================================================================
  // getBufferedLogs
  // =========================================================================

  describe('getBufferedLogs', () => {
    it('delegates to buffer.peek with default count', async () => {
      const mockLogs = [{ ts: '2026-01-01', event: 'test' }];
      mockBufferInstance.peek.mockResolvedValue(mockLogs);

      const logs = await tracker.getBufferedLogs();

      expect(mockBufferInstance.peek).toHaveBeenCalledWith(100);
      expect(logs).toEqual(mockLogs);
    });

    it('delegates to buffer.peek with custom count', async () => {
      await tracker.getBufferedLogs(50);
      expect(mockBufferInstance.peek).toHaveBeenCalledWith(50);
    });
  });

  // =========================================================================
  // isEnabled / isInitialized / getEntrypoint
  // =========================================================================

  describe('state accessors', () => {
    it('isEnabled returns true by default', () => {
      expect(tracker.isEnabled()).toBe(true);
    });

    it('isInitialized returns false before initialize', () => {
      expect(tracker.isInitialized()).toBe(false);
    });

    it('isInitialized returns true after initialize', async () => {
      await tracker.initialize(VALID_CONFIG);
      expect(tracker.isInitialized()).toBe(true);
    });

    it('getEntrypoint returns configured entrypoint', async () => {
      await tracker.initialize({ ...VALID_CONFIG, entrypoint: 'popup' });
      expect(tracker.getEntrypoint()).toBe('popup');
    });
  });

  // =========================================================================
  // Periodic flush
  // =========================================================================

  describe('periodic flush', () => {
    it('sets up periodic flush that calls buffer.flush', async () => {
      const shortInterval = 50;
      const t = new UsageTracker();
      await t.initialize({ ...VALID_CONFIG, flushIntervalMs: shortInterval });
      mockBufferInstance.flush.mockClear();

      // Wait for at least one interval to fire
      await new Promise<void>((r) => setTimeout(r, shortInterval * 2 + 20));

      expect(mockBufferInstance.flush).toHaveBeenCalled();
      t.destroy();
    });
  });

  // =========================================================================
  // Contract: Does not initialize when gateway config is missing
  // =========================================================================

  describe('contract: gateway config handling', () => {
    it('passes empty gateway config through to shipper', async () => {
      await tracker.initialize({
        gatewayUrl: '',
        gatewayToken: '',
        flushIntervalMs: 999_999_999,
      });

      expect(tracker.isInitialized()).toBe(true);
      expect(MockUsageShipper).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayUrl: '',
          gatewayToken: '',
        }),
      );
    });
  });
});
