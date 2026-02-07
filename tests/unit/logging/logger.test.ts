/**
 * Tests for createLogger factory
 * Contract: specs/056-production-readiness-sprint/contracts/debug-infrastructure.yaml
 *
 * Test cases:
 * 1. createLogger returns object with debug/info/warn/error methods
 * 2. Log method creates LogEntry with correct component tag
 * 3. Log method adds entry to global LogBuffer (count increases by 1)
 * 4. Log method respects configured log level (debug is no-op when level is 'info')
 * 5. Log method truncates message at maxMessageBytes (8192)
 * 6. Log method serializes metadata safely (circular refs, 4096 byte limit)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { resolve } from 'node:path';

// Mock the buffer module so we can track add() calls
const mockAdd = jest.fn().mockReturnValue(true);
const mockGetAll = jest.fn().mockReturnValue([]);
const mockFlush = jest.fn().mockReturnValue([]);
const mockClear = jest.fn();

jest.unstable_mockModule(resolve('src/utils/logging/buffer'), () => ({
  LogBuffer: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    getAll: mockGetAll,
    flush: mockFlush,
    clear: mockClear,
    count: 0,
    isEmpty: jest.fn().mockReturnValue(true),
    getState: jest.fn().mockReturnValue({
      count: 0,
      totalBytes: 0,
      maxBytes: 1048576,
      maxEntries: 5242,
      lastFlushAttempt: 0,
      consecutiveFailures: 0,
    }),
    shouldFlush: jest.fn().mockReturnValue(false),
  })),
  createLogBuffer: jest.fn(),
}));

// Import after mocking
const {
  createLogger,
  getGlobalLogBuffer,
  resetGlobalLogBuffer,
  setLogLevel,
  getLogLevel,
} = await import(resolve('src/utils/logging/logger'));

const { loggingConstants } = await import(resolve('src/utils/logging/entry'));

describe('createLogger factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGlobalLogBuffer();
    setLogLevel('debug');
  });

  // Test 1: createLogger returns object with debug/info/warn/error methods
  describe('returned logger interface', () => {
    it('returns an object with debug, info, warn, and error methods', () => {
      const logger = createLogger('handler');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('has exactly four methods', () => {
      const logger = createLogger('handler');
      const methods = Object.keys(logger);
      expect(methods).toHaveLength(4);
      expect(methods.sort()).toEqual(['debug', 'error', 'info', 'warn']);
    });
  });

  // Test 2: Log method creates LogEntry with correct component tag
  describe('component tagging', () => {
    it('creates LogEntry with the component passed to createLogger', () => {
      const logger = createLogger('handler');

      // Reset mock to ensure we get the actual LogBuffer instance
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      logger.info('test message');

      // The real createLogEntry is called, then buffer.add receives a LogEntry
      expect(buffer.add).toHaveBeenCalledTimes(1);
      const entry = buffer.add.mock.calls[0][0];
      expect(entry).not.toBeNull();
      expect(entry.component).toBe('handler');
    });

    it('uses different component tags for different loggers', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const handlerLogger = createLogger('handler');
      const adapterLogger = createLogger('adapter');

      handlerLogger.info('from handler');
      adapterLogger.info('from adapter');

      expect(buffer.add).toHaveBeenCalledTimes(2);
      expect(buffer.add.mock.calls[0][0].component).toBe('handler');
      expect(buffer.add.mock.calls[1][0].component).toBe('adapter');
    });
  });

  // Test 3: Log method adds entry to global LogBuffer (count increases by 1)
  describe('LogBuffer integration', () => {
    it('adds entry to global LogBuffer on each log call', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('background');

      logger.info('message 1');
      expect(buffer.add).toHaveBeenCalledTimes(1);

      logger.warn('message 2');
      expect(buffer.add).toHaveBeenCalledTimes(2);

      logger.error('message 3');
      expect(buffer.add).toHaveBeenCalledTimes(3);
    });

    it('all createLogger instances share the same global LogBuffer', () => {
      resetGlobalLogBuffer();

      const logger1 = createLogger('handler');
      const logger2 = createLogger('adapter');

      const buffer1 = getGlobalLogBuffer();
      logger1.info('from 1');
      logger2.info('from 2');

      // Both should have written to the same buffer instance
      expect(buffer1.add).toHaveBeenCalledTimes(2);
    });
  });

  // Test 4: Log method respects configured log level
  describe('log level filtering', () => {
    it('debug() is a no-op when level is set to info', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      setLogLevel('info');
      const logger = createLogger('handler');

      logger.debug('should be filtered');
      expect(buffer.add).not.toHaveBeenCalled();
    });

    it('info() works when level is set to info', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      setLogLevel('info');
      const logger = createLogger('handler');

      logger.info('should pass');
      expect(buffer.add).toHaveBeenCalledTimes(1);
    });

    it('debug() is a no-op when level is set to warn', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      setLogLevel('warn');
      const logger = createLogger('handler');

      logger.debug('filtered');
      logger.info('also filtered');
      expect(buffer.add).not.toHaveBeenCalled();
    });

    it('error() always passes regardless of level', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      setLogLevel('error');
      const logger = createLogger('handler');

      logger.debug('filtered');
      logger.info('filtered');
      logger.warn('filtered');
      logger.error('passes');
      expect(buffer.add).toHaveBeenCalledTimes(1);
    });

    it('getLogLevel returns the current configured level', () => {
      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');

      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');
    });
  });

  // Test 5: Log method truncates message at maxMessageBytes (8192)
  describe('message truncation', () => {
    it('truncates messages exceeding 8192 bytes', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      const longMessage = 'x'.repeat(loggingConstants.maxMessageBytes + 100);

      logger.info(longMessage);

      expect(buffer.add).toHaveBeenCalledTimes(1);
      const entry = buffer.add.mock.calls[0][0];
      expect(entry.message.length).toBeLessThanOrEqual(loggingConstants.maxMessageBytes);
      expect(entry.message.endsWith('...')).toBe(true);
    });

    it('does not truncate messages within limit', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      const normalMessage = 'normal message';

      logger.info(normalMessage);

      const entry = buffer.add.mock.calls[0][0];
      expect(entry.message).toBe(normalMessage);
    });
  });

  // Test 6: Log method serializes metadata safely
  describe('safe metadata serialization', () => {
    it('does not throw on circular references', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      expect(() => {
        logger.info('circular test', circular);
      }).not.toThrow();

      expect(buffer.add).toHaveBeenCalledTimes(1);
    });

    it('truncates metadata exceeding 4096 bytes', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      const largeMetadata: Record<string, unknown> = {
        data: 'x'.repeat(loggingConstants.maxMetadataBytes + 100),
      };

      logger.info('large metadata', largeMetadata);

      expect(buffer.add).toHaveBeenCalledTimes(1);
      const entry = buffer.add.mock.calls[0][0];
      // Metadata should be either truncated indicator or null (depending on createLogEntry behavior)
      // The safeSerializeMetadata function returns { _truncated: true, _size: N } for large metadata
      if (entry.metadata !== null) {
        const metaStr = JSON.stringify(entry.metadata);
        // Either it's the truncated marker or it's within limits
        expect(
          metaStr.length <= loggingConstants.maxMetadataBytes || entry.metadata._truncated === true
        ).toBe(true);
      }
    });

    it('handles function values in metadata', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      logger.info('fn test', { callback: () => {} });

      expect(buffer.add).toHaveBeenCalledTimes(1);
      // Should not throw — functions are serialized as '[Function]'
    });

    it('handles symbol values in metadata', () => {
      resetGlobalLogBuffer();

      const logger = createLogger('handler');
      expect(() => {
        logger.info('symbol test', { sym: Symbol('test') });
      }).not.toThrow();
    });

    it('handles Error objects in metadata', () => {
      resetGlobalLogBuffer();
      const buffer = getGlobalLogBuffer();

      const logger = createLogger('handler');
      const err = new Error('test error');
      logger.info('error test', { error: err });

      expect(buffer.add).toHaveBeenCalledTimes(1);
    });
  });

  // Console output tests (dev visibility)
  describe('console output', () => {
    it('calls console.debug for debug level', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const logger = createLogger('handler');
      logger.debug('debug msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('calls console.info for info level', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const logger = createLogger('handler');
      logger.info('info msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('calls console.warn for warn level', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logger = createLogger('handler');
      logger.warn('warn msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('calls console.error for error level', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const logger = createLogger('handler');
      logger.error('error msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
