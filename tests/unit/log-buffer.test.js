/**
 * Unit tests for LogBuffer
 * @module tests/unit/log-buffer.test
 */

import { jest } from '@jest/globals';
import { LogBuffer, createLogBuffer } from '../../background/log-buffer.js';
import { createLogEntry, generateTimestamp } from '../../background/log-entry.js';

// Mock browser.storage.local
global.browser = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
};

describe('LogBuffer', () => {
  let buffer;

  beforeEach(() => {
    buffer = new LogBuffer({ maxBytes: 10000, maxEntries: 100 });
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create buffer with default options', () => {
      const defaultBuffer = new LogBuffer();
      expect(defaultBuffer.maxBytes).toBe(1048576); // 1MB default
      expect(defaultBuffer.maxEntries).toBeGreaterThan(0);
    });

    it('should create buffer with custom options', () => {
      const customBuffer = new LogBuffer({ maxBytes: 5000, maxEntries: 50 });
      expect(customBuffer.maxBytes).toBe(5000);
      expect(customBuffer.maxEntries).toBe(50);
    });

    it('should start empty', () => {
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.count).toBe(0);
      expect(buffer.totalBytes).toBe(0);
    });
  });

  describe('add', () => {
    it('should add valid entry', () => {
      const entry = createLogEntry({
        level: 'info',
        message: 'Test message',
        component: 'background',
      });

      const result = buffer.add(entry);

      expect(result).toBe(true);
      expect(buffer.count).toBe(1);
      expect(buffer.totalBytes).toBeGreaterThan(0);
    });

    it('should reject invalid entry', () => {
      const result = buffer.add({ invalid: true });

      expect(result).toBe(false);
      expect(buffer.count).toBe(0);
    });

    it('should reject null entry', () => {
      const result = buffer.add(null);

      expect(result).toBe(false);
      expect(buffer.count).toBe(0);
    });

    it('should add multiple entries', () => {
      for (let i = 0; i < 5; i++) {
        buffer.add(createLogEntry({
          level: 'info',
          message: `Message ${i}`,
          component: 'background',
        }));
      }

      expect(buffer.count).toBe(5);
    });
  });

  describe('circular behavior', () => {
    it('should overwrite oldest when full', () => {
      const smallBuffer = new LogBuffer({ maxBytes: 1000, maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        smallBuffer.add(createLogEntry({
          level: 'info',
          message: `Message ${i}`,
          component: 'background',
        }));
      }

      // Should only have last 3 entries
      expect(smallBuffer.count).toBe(3);

      const entries = smallBuffer.getAll();
      expect(entries[0].message).toBe('Message 2');
      expect(entries[1].message).toBe('Message 3');
      expect(entries[2].message).toBe('Message 4');
    });

    it('should evict when bytes exceeded', () => {
      const tinyBuffer = new LogBuffer({ maxBytes: 500, maxEntries: 100 });

      // Add entries until we exceed buffer
      for (let i = 0; i < 10; i++) {
        tinyBuffer.add(createLogEntry({
          level: 'info',
          message: 'A'.repeat(100), // ~150 bytes per entry
          component: 'background',
        }));
      }

      // Should have evicted some entries
      expect(tinyBuffer.totalBytes).toBeLessThanOrEqual(500);
    });
  });

  describe('getAll', () => {
    it('should return empty array when buffer empty', () => {
      expect(buffer.getAll()).toEqual([]);
    });

    it('should return entries in chronological order', () => {
      for (let i = 0; i < 3; i++) {
        buffer.add(createLogEntry({
          level: 'info',
          message: `Message ${i}`,
          component: 'background',
        }));
      }

      const entries = buffer.getAll();
      expect(entries.length).toBe(3);
      expect(entries[0].message).toBe('Message 0');
      expect(entries[2].message).toBe('Message 2');
    });
  });

  describe('flush', () => {
    it('should return and clear entries', () => {
      buffer.add(createLogEntry({
        level: 'info',
        message: 'Test',
        component: 'background',
      }));

      const flushed = buffer.flush();

      expect(flushed.length).toBe(1);
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.count).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      buffer.add(createLogEntry({
        level: 'info',
        message: 'Test',
        component: 'background',
      }));

      buffer.clear();

      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.count).toBe(0);
      expect(buffer.totalBytes).toBe(0);
    });
  });

  describe('shouldFlush', () => {
    it('should return false when empty', () => {
      expect(buffer.shouldFlush()).toBe(false);
    });

    it('should return true when count exceeds batch size', () => {
      for (let i = 0; i < 100; i++) {
        buffer.add(createLogEntry({
          level: 'info',
          message: `Message ${i}`,
          component: 'background',
        }));
      }

      expect(buffer.shouldFlush(100)).toBe(true);
    });
  });

  describe('circuit breaker', () => {
    it('should start with circuit closed', () => {
      expect(buffer.isCircuitBroken()).toBe(false);
    });

    it('should track consecutive failures', () => {
      for (let i = 0; i < 5; i++) {
        buffer.recordFlushResult(false);
      }

      expect(buffer.consecutiveFailures).toBe(5);
      expect(buffer.isCircuitBroken()).toBe(false); // Not yet at threshold
    });

    it('should trip circuit after max failures', () => {
      for (let i = 0; i < 10; i++) {
        buffer.recordFlushResult(false);
      }

      expect(buffer.isCircuitBroken()).toBe(true);
    });

    it('should reset on success', () => {
      buffer.recordFlushResult(false);
      buffer.recordFlushResult(false);
      buffer.recordFlushResult(true);

      expect(buffer.consecutiveFailures).toBe(0);
    });

    it('should reset manually', () => {
      for (let i = 0; i < 10; i++) {
        buffer.recordFlushResult(false);
      }

      buffer.resetCircuitBreaker();

      expect(buffer.isCircuitBroken()).toBe(false);
      expect(buffer.consecutiveFailures).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return buffer state', () => {
      buffer.add(createLogEntry({
        level: 'info',
        message: 'Test',
        component: 'background',
      }));

      const state = buffer.getState();

      expect(state.count).toBe(1);
      expect(state.totalBytes).toBeGreaterThan(0);
      expect(state.maxBytes).toBe(10000);
      expect(state.maxEntries).toBe(100);
    });
  });

  describe('persistence', () => {
    it('should save to storage', async () => {
      buffer.add(createLogEntry({
        level: 'info',
        message: 'Test',
        component: 'background',
      }));

      await buffer.save();

      expect(browser.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          logBuffer: expect.objectContaining({
            entries: expect.any(Array),
            totalBytes: expect.any(Number),
          }),
        })
      );
    });

    it('should load from storage', async () => {
      const savedEntry = createLogEntry({
        level: 'warn',
        message: 'Saved message',
        component: 'popup',
      });

      browser.storage.local.get.mockResolvedValueOnce({
        logBuffer: {
          entries: [savedEntry],
          totalBytes: 100,
          consecutiveFailures: 2,
        },
      });

      await buffer.load();

      expect(buffer.count).toBe(1);
      expect(buffer.consecutiveFailures).toBe(2);
    });

    it('should handle missing storage gracefully', async () => {
      browser.storage.local.get.mockResolvedValueOnce({});

      await buffer.load();

      expect(buffer.count).toBe(0);
    });
  });
});

describe('createLogBuffer', () => {
  it('should create LogBuffer instance', () => {
    const buffer = createLogBuffer({ maxBytes: 5000 });

    expect(buffer).toBeInstanceOf(LogBuffer);
    expect(buffer.maxBytes).toBe(5000);
  });
});

describe('generateTimestamp', () => {
  it('should generate 19-digit nanosecond timestamp', () => {
    const ts = generateTimestamp();

    expect(typeof ts).toBe('string');
    expect(ts.length).toBe(19);
    expect(/^\d+$/.test(ts)).toBe(true);
  });

  it('should generate increasing timestamps', () => {
    const ts1 = generateTimestamp();
    const ts2 = generateTimestamp();

    expect(BigInt(ts2)).toBeGreaterThanOrEqual(BigInt(ts1));
  });
});
