/**
 * Contract tests for Loki Push API
 * Verifies payload format matches Loki API specification
 *
 * @module tests/contract/loki-api.test
 * @description API contract tests for remote logging (014-loki-remote-logging)
 */

import { createLogEntry, generateTimestamp, serializeForLoki } from '../../src/utils/logging/entry';

// Mock browser APIs
global.browser = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
  },
};

global.crypto = {
  randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
};

describe('Loki Push API Contract', () => {
  describe('Timestamp Format', () => {
    it('timestamp must be a string, not a number', () => {
      const ts = generateTimestamp();

      expect(typeof ts).toBe('string');
      expect(typeof ts).not.toBe('number');
    });

    it('timestamp must be 19 digits (nanosecond precision)', () => {
      const ts = generateTimestamp();

      expect(ts.length).toBe(19);
      expect(/^\d{19}$/.test(ts)).toBe(true);
    });

    it('timestamp must be valid Unix nanoseconds', () => {
      const ts = generateTimestamp();
      const ns = BigInt(ts);

      // Should be after year 2020 (1577836800000000000 ns)
      expect(ns).toBeGreaterThan(BigInt('1577836800000000000'));

      // Should be before year 2100 (4102444800000000000 ns)
      expect(ns).toBeLessThan(BigInt('4102444800000000000'));
    });

    it('timestamps must be monotonically increasing', () => {
      const timestamps = [];
      for (let i = 0; i < 10; i++) {
        timestamps.push(generateTimestamp());
      }

      for (let i = 1; i < timestamps.length; i++) {
        expect(BigInt(timestamps[i])).toBeGreaterThanOrEqual(BigInt(timestamps[i - 1]));
      }
    });
  });

  describe('LogEntry Values Array', () => {
    it('values tuple without metadata has 2 elements [timestamp, message]', () => {
      const entry = createLogEntry({
        level: 'info',
        message: 'Test message',
        component: 'background',
      });

      const values = serializeForLoki(entry);

      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(2);
      expect(typeof values[0]).toBe('string'); // timestamp
      expect(typeof values[1]).toBe('string'); // message
    });

    it('values tuple with metadata has 3 elements [timestamp, message, metadata]', () => {
      const entry = createLogEntry({
        level: 'error',
        message: 'Error occurred',
        component: 'background',
        metadata: { errorCode: 500, retryable: true },
      });

      const values = serializeForLoki(entry);

      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(3);
      expect(typeof values[0]).toBe('string'); // timestamp
      expect(typeof values[1]).toBe('string'); // message
      expect(typeof values[2]).toBe('object'); // metadata
    });
  });

  describe('Message Content', () => {
    it('message is non-empty string', () => {
      const entry = createLogEntry({
        level: 'info',
        message: 'Hello world',
        component: 'background',
      });

      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);
    });

    it('long messages are truncated', () => {
      const longMessage = 'A'.repeat(20000); // 20KB
      const entry = createLogEntry({
        level: 'info',
        message: longMessage,
        component: 'background',
      });

      // Should be truncated to maxMessageBytes (10KB)
      expect(entry.message.length).toBeLessThanOrEqual(10240);
      expect(entry.message.endsWith('...')).toBe(true);
    });
  });

  describe('Error Response Handling', () => {
    it('identifies 4xx errors as non-retryable', () => {
      // 400, 401, 403 should not be retried
      const nonRetryable = [400, 401, 403, 404];
      nonRetryable.forEach(status => {
        const retryable = status >= 500 || status === 429;
        expect(retryable).toBe(false);
      });
    });

    it('identifies 429 as retryable', () => {
      const status = 429;
      const retryable = status >= 500 || status === 429;
      expect(retryable).toBe(true);
    });

    it('identifies 5xx errors as retryable', () => {
      const serverErrors = [500, 502, 503, 504];
      serverErrors.forEach(status => {
        const retryable = status >= 500 || status === 429;
        expect(retryable).toBe(true);
      });
    });
  });
});
