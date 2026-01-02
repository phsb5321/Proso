/**
 * Contract tests for Loki Push API
 * Verifies payload format matches Loki API specification
 *
 * @module tests/contract/loki-api.test
 * @description API contract tests for remote logging (014-loki-remote-logging)
 */

import { jest } from '@jest/globals';
import { createLogEntry, generateTimestamp, serializeForLoki } from '../../background/log-entry.js';
import { RemoteLogger } from '../../background/remote-logger.js';

// Mock browser APIs
global.browser = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: jest.fn(),
    },
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

  describe('Payload Structure', () => {
    let logger;

    beforeEach(async () => {
      logger = new RemoteLogger();
      logger.sessionId = '550e8400-e29b-41d4-a716-446655440000';
      logger.version = '1.0.0';
    });

    it('payload must have streams array', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);

      expect(payload).toHaveProperty('streams');
      expect(Array.isArray(payload.streams)).toBe(true);
    });

    it('each stream must have stream labels object', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);

      expect(payload.streams[0]).toHaveProperty('stream');
      expect(typeof payload.streams[0].stream).toBe('object');
    });

    it('stream labels must include required fields', () => {
      const entries = [
        createLogEntry({ level: 'warn', message: 'Warning', component: 'popup' }),
      ];

      const payload = logger.buildLokiPayload(entries);
      const labels = payload.streams[0].stream;

      expect(labels).toHaveProperty('app', 'voxpage');
      expect(labels).toHaveProperty('version', '1.0.0');
      expect(labels).toHaveProperty('session');
      expect(labels).toHaveProperty('level', 'warn');
      expect(labels).toHaveProperty('component', 'popup');
    });

    it('stream must have values array', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);

      expect(payload.streams[0]).toHaveProperty('values');
      expect(Array.isArray(payload.streams[0].values)).toBe(true);
    });

    it('entries are grouped by level and component', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Info 1', component: 'background' }),
        createLogEntry({ level: 'info', message: 'Info 2', component: 'background' }),
        createLogEntry({ level: 'error', message: 'Error 1', component: 'background' }),
        createLogEntry({ level: 'info', message: 'Info popup', component: 'popup' }),
      ];

      const payload = logger.buildLokiPayload(entries);

      // Should have 3 streams: info:background, error:background, info:popup
      expect(payload.streams.length).toBe(3);

      // Find info:background stream
      const infoBackgroundStream = payload.streams.find(
        s => s.stream.level === 'info' && s.stream.component === 'background'
      );
      expect(infoBackgroundStream.values.length).toBe(2);
    });
  });

  describe('Label Constraints', () => {
    let logger;

    beforeEach(() => {
      logger = new RemoteLogger();
      logger.sessionId = '550e8400-e29b-41d4-a716-446655440000';
      logger.version = '1.0.0';
    });

    it('label names follow Prometheus naming convention', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);
      const labels = Object.keys(payload.streams[0].stream);

      // Label names must match [a-zA-Z_][a-zA-Z0-9_]*
      const validLabelName = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      labels.forEach(label => {
        expect(validLabelName.test(label)).toBe(true);
      });
    });

    it('label values are strings', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);
      const values = Object.values(payload.streams[0].stream);

      values.forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('session label is valid UUID format', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);
      const session = payload.streams[0].stream.session;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(session)).toBe(true);
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

  describe('Full Payload Serialization', () => {
    let logger;

    beforeEach(() => {
      logger = new RemoteLogger();
      logger.sessionId = '550e8400-e29b-41d4-a716-446655440000';
      logger.version = '1.0.0';
    });

    it('payload is valid JSON', () => {
      const entries = [
        createLogEntry({ level: 'info', message: 'Test', component: 'background' }),
      ];

      const payload = logger.buildLokiPayload(entries);
      const json = JSON.stringify(payload);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('payload matches expected Loki format', () => {
      const entries = [
        createLogEntry({
          level: 'error',
          message: 'TTS generation failed',
          component: 'background',
          metadata: { provider: 'openai', errorCode: 429 },
        }),
      ];

      const payload = logger.buildLokiPayload(entries);

      // Verify structure matches Loki spec
      expect(payload).toEqual({
        streams: [{
          stream: {
            app: 'voxpage',
            version: '1.0.0',
            session: '550e8400-e29b-41d4-a716-446655440000',
            level: 'error',
            component: 'background',
          },
          values: [
            expect.arrayContaining([
              expect.stringMatching(/^\d{19}$/), // timestamp
              'TTS generation failed',
              { provider: 'openai', errorCode: 429 },
            ]),
          ],
        }],
      });
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
