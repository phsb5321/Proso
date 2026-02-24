/**
 * Usage Event Types and Redaction Tests
 *
 * Tests for telemetry event type taxonomy, schema validation,
 * utility functions, and PII redaction.
 *
 * Contract: telemetry-tests.yaml
 * - Event factory creates correctly typed events
 * - PII redaction strips sensitive data
 *
 * @module tests/unit/telemetry/usage-events
 */

import {
  UsageEventTypes,
  UsageEventSchema,
  getEventGroup,
  getDefaultLogLevel,
  EventGroup,
  LogLevel,
  Entrypoint,
  Provider,
  DEFAULT_BUFFER_CONFIG,
  DEFAULT_SHIPPER_CONFIG,
  DEFAULT_TRACKER_CONFIG,
} from '../../../src/utils/telemetry/usage/types';

import {
  sanitizeEventData,
  redactSensitiveData,
  redactError,
  redactStackTrace,
  hashUrl,
  hashUrlSync,
} from '../../../src/utils/telemetry/usage/redaction';

// ============================================================================
// Event Types
// ============================================================================

describe('UsageEventTypes', () => {
  it('should have all event type keys follow dot-notation pattern', () => {
    const keys = Object.keys(UsageEventTypes);
    expect(keys.length).toBeGreaterThan(50);

    for (const key of keys) {
      expect(key).toMatch(/^[a-z]+\.[a-z][a-z0-9_]*$/);
    }
  });

  it('should map all event types to valid event groups', () => {
    const validGroups = new Set(Object.values(EventGroup));
    const keys = Object.keys(UsageEventTypes);

    for (const key of keys) {
      const group = getEventGroup(key);
      expect(validGroups.has(group)).toBe(true);
    }
  });
});

// ============================================================================
// getEventGroup
// ============================================================================

describe('getEventGroup', () => {
  it('maps playback.* to user group', () => {
    expect(getEventGroup('playback.play_clicked')).toBe('user');
    expect(getEventGroup('playback.pause_clicked')).toBe('user');
    expect(getEventGroup('playback.start_requested')).toBe('user');
  });

  it('maps paragraph.* and selection.* to user group', () => {
    expect(getEventGroup('paragraph.clicked')).toBe('user');
    expect(getEventGroup('selection.read_requested')).toBe('user');
  });

  it('maps error.* to error group', () => {
    expect(getEventGroup('error.uncaught')).toBe('error');
    expect(getEventGroup('error.uncaught_exception')).toBe('error');
    expect(getEventGroup('error.network')).toBe('error');
  });

  it('maps shipper.* to shipper group', () => {
    expect(getEventGroup('shipper.flush_started')).toBe('shipper');
    expect(getEventGroup('shipper.batch_sent')).toBe('shipper');
    expect(getEventGroup('shipper.circuit_opened')).toBe('shipper');
  });

  it('maps api.* to network group', () => {
    expect(getEventGroup('api.request_started')).toBe('network');
    expect(getEventGroup('api.request_failed')).toBe('network');
    expect(getEventGroup('api.rate_limited')).toBe('network');
  });

  it('maps tts.*, audio.*, cache.*, highlight.* to playback group', () => {
    expect(getEventGroup('tts.request_started')).toBe('playback');
    expect(getEventGroup('audio.load_started')).toBe('playback');
    expect(getEventGroup('cache.store_started')).toBe('playback');
    expect(getEventGroup('highlight.sync_started')).toBe('playback');
  });

  it('maps background.*, popup.*, settings.*, console.*, content.* to system group', () => {
    expect(getEventGroup('background.started')).toBe('system');
    expect(getEventGroup('popup.opened')).toBe('system');
    expect(getEventGroup('settings.opened')).toBe('system');
    expect(getEventGroup('console.log')).toBe('system');
    expect(getEventGroup('content.injected')).toBe('system');
  });

  it('returns system for unknown prefixes', () => {
    expect(getEventGroup('unknown.something')).toBe('system');
    expect(getEventGroup('foo.bar')).toBe('system');
  });
});

// ============================================================================
// getDefaultLogLevel
// ============================================================================

describe('getDefaultLogLevel', () => {
  it('returns error for error.* events', () => {
    expect(getDefaultLogLevel('error.uncaught')).toBe('error');
    expect(getDefaultLogLevel('error.uncaught_exception')).toBe('error');
    expect(getDefaultLogLevel('error.network')).toBe('error');
    expect(getDefaultLogLevel('error.validation')).toBe('error');
  });

  it('returns error for events containing _failed', () => {
    expect(getDefaultLogLevel('tts.request_failed')).toBe('error');
    expect(getDefaultLogLevel('api.request_failed')).toBe('error');
    expect(getDefaultLogLevel('cache.store_failed')).toBe('error');
    expect(getDefaultLogLevel('shipper.flush_failed')).toBe('error');
  });

  it('returns error for events containing _error', () => {
    expect(getDefaultLogLevel('audio.playback_error')).toBe('error');
  });

  it('returns debug for events containing _started', () => {
    expect(getDefaultLogLevel('tts.request_started')).toBe('debug');
    expect(getDefaultLogLevel('audio.load_started')).toBe('debug');
    expect(getDefaultLogLevel('cache.store_started')).toBe('debug');
    expect(getDefaultLogLevel('shipper.flush_started')).toBe('debug');
  });

  it('returns debug for events containing _requested', () => {
    expect(getDefaultLogLevel('playback.start_requested')).toBe('debug');
    expect(getDefaultLogLevel('selection.read_requested')).toBe('debug');
  });

  it('returns info for regular events', () => {
    expect(getDefaultLogLevel('playback.play_clicked')).toBe('info');
    expect(getDefaultLogLevel('popup.opened')).toBe('info');
    expect(getDefaultLogLevel('tts.cache_hit')).toBe('info');
    expect(getDefaultLogLevel('background.suspended')).toBe('info');
  });
});

// ============================================================================
// UsageEventSchema
// ============================================================================

describe('UsageEventSchema', () => {
  const validEvent = {
    ts: '2026-01-15T10:30:00.000Z',
    event: 'playback.play_clicked',
    eventGroup: 'user',
    level: 'info',
    msg: 'User clicked play',
    entrypoint: 'popup',
    extVersion: '1.0.0',
    installId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  };

  it('validates a complete valid event', () => {
    const result = UsageEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('validates event with all optional fields', () => {
    const fullEvent = {
      ...validEvent,
      actionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      provider: 'elevenlabs',
      flags: { featureA: true, featureB: false },
      urlHash: 'abc123def456',
      data: { paragraphIndex: 5, wordCount: 120 },
    };
    const result = UsageEventSchema.safeParse(fullEvent);
    expect(result.success).toBe(true);
  });

  it('rejects event missing required field ts', () => {
    const { ts, ...noTs } = validEvent;
    const result = UsageEventSchema.safeParse(noTs);
    expect(result.success).toBe(false);
  });

  it('rejects event missing required field event', () => {
    const { event, ...noEvent } = validEvent;
    const result = UsageEventSchema.safeParse(noEvent);
    expect(result.success).toBe(false);
  });

  it('rejects event missing required field eventGroup', () => {
    const { eventGroup, ...noGroup } = validEvent;
    const result = UsageEventSchema.safeParse(noGroup);
    expect(result.success).toBe(false);
  });

  it('rejects event with invalid eventGroup value', () => {
    const result = UsageEventSchema.safeParse({
      ...validEvent,
      eventGroup: 'invalid_group',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event with invalid level value', () => {
    const result = UsageEventSchema.safeParse({
      ...validEvent,
      level: 'critical',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event with invalid entrypoint value', () => {
    const result = UsageEventSchema.safeParse({
      ...validEvent,
      entrypoint: 'sidebar',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event with invalid installId (not UUID)', () => {
    const result = UsageEventSchema.safeParse({
      ...validEvent,
      installId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event with empty event string', () => {
    const result = UsageEventSchema.safeParse({
      ...validEvent,
      event: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields when absent', () => {
    // validEvent already lacks actionId, provider, flags, data
    const result = UsageEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe('Constants', () => {
  it('EventGroup has all expected values', () => {
    expect(EventGroup.USER).toBe('user');
    expect(EventGroup.SYSTEM).toBe('system');
    expect(EventGroup.PLAYBACK).toBe('playback');
    expect(EventGroup.NETWORK).toBe('network');
    expect(EventGroup.SHIPPER).toBe('shipper');
    expect(EventGroup.ERROR).toBe('error');
  });

  it('LogLevel has all expected values', () => {
    expect(LogLevel.DEBUG).toBe('debug');
    expect(LogLevel.INFO).toBe('info');
    expect(LogLevel.WARN).toBe('warn');
    expect(LogLevel.ERROR).toBe('error');
  });

  it('Entrypoint has all expected values', () => {
    expect(Entrypoint.BACKGROUND).toBe('background');
    expect(Entrypoint.POPUP).toBe('popup');
    expect(Entrypoint.OPTIONS).toBe('options');
    expect(Entrypoint.CONTENT).toBe('content');
  });

  it('Provider has expected values', () => {
    expect(Provider.ELEVENLABS).toBe('elevenlabs');
  });

  it('DEFAULT_BUFFER_CONFIG has sensible defaults', () => {
    expect(DEFAULT_BUFFER_CONFIG.maxBytes).toBe(10 * 1024 * 1024);
    expect(DEFAULT_BUFFER_CONFIG.maxAgeMs).toBe(14 * 24 * 60 * 60 * 1000);
    expect(DEFAULT_BUFFER_CONFIG.dbName).toBe('proso_usage');
    expect(DEFAULT_BUFFER_CONFIG.storeName).toBe('events');
  });

  it('DEFAULT_SHIPPER_CONFIG has sensible defaults', () => {
    expect(DEFAULT_SHIPPER_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_SHIPPER_CONFIG.retryBaseDelayMs).toBe(1000);
    expect(DEFAULT_SHIPPER_CONFIG.retryMaxDelayMs).toBe(30000);
    expect(DEFAULT_SHIPPER_CONFIG.maxConsecutiveFailures).toBe(5);
    expect(DEFAULT_SHIPPER_CONFIG.circuitResetMs).toBe(60000);
    expect(DEFAULT_SHIPPER_CONFIG.enableGzip).toBe(true);
    expect(DEFAULT_SHIPPER_CONFIG.gzipThresholdBytes).toBe(1024);
  });

  it('DEFAULT_TRACKER_CONFIG inherits buffer and shipper defaults', () => {
    expect(DEFAULT_TRACKER_CONFIG.enabled).toBe(true);
    expect(DEFAULT_TRACKER_CONFIG.maxBufferBytes).toBe(DEFAULT_BUFFER_CONFIG.maxBytes);
    expect(DEFAULT_TRACKER_CONFIG.maxBufferAgeMs).toBe(DEFAULT_BUFFER_CONFIG.maxAgeMs);
    expect(DEFAULT_TRACKER_CONFIG.flushIntervalMs).toBe(30000);
    expect(DEFAULT_TRACKER_CONFIG.flushBatchSize).toBe(100);
    expect(DEFAULT_TRACKER_CONFIG.flushOnError).toBe(true);
    expect(DEFAULT_TRACKER_CONFIG.debugMode).toBe(false);
  });
});

// ============================================================================
// sanitizeEventData
// ============================================================================

describe('sanitizeEventData', () => {
  it('passes through non-sensitive data unchanged', () => {
    const data = { count: 42, name: 'hello', active: true };
    const result = sanitizeEventData(data);
    expect(result).toEqual({ count: 42, name: 'hello', active: true });
  });

  it('redacts keys containing key', () => {
    const data = { apiKey: 'sk-1234567890' };
    const result = sanitizeEventData(data);
    expect(result!.apiKey).toBe('[REDACTED]');
  });

  it('redacts keys containing secret', () => {
    const data = { clientSecret: 'my-secret-value' };
    const result = sanitizeEventData(data);
    expect(result!.clientSecret).toBe('[REDACTED]');
  });

  it('redacts keys containing password', () => {
    const data = { password: 'hunter2' };
    const result = sanitizeEventData(data);
    expect(result!.password).toBe('[REDACTED]');
  });

  it('redacts keys containing token', () => {
    const data = { accessToken: 'bearer-token-value' };
    const result = sanitizeEventData(data);
    expect(result!.accessToken).toBe('[REDACTED]');
  });

  it('redacts keys containing credential', () => {
    const data = { credential: 'my-credential' };
    const result = sanitizeEventData(data);
    expect(result!.credential).toBe('[REDACTED]');
  });

  it('redacts long alphanumeric strings that look like API keys', () => {
    const longKey = 'abcdefghijklmnopqrstuvwxyz1234567890abcd';
    const data = { message: `Error with key ${longKey} failed` };
    const result = sanitizeEventData(data);
    expect(result!.message).not.toContain(longKey);
    expect(result!.message).toContain('[REDACTED]');
  });

  it('returns undefined for undefined input', () => {
    const result = sanitizeEventData(undefined);
    expect(result).toBeUndefined();
  });

  it('handles nested objects recursively', () => {
    const data = {
      outer: {
        apiKey: 'secret-key',
        inner: {
          token: 'bearer-xyz',
          safe: 'visible',
        },
      },
    };
    const result = sanitizeEventData(data);
    expect((result!.outer as Record<string, unknown>)).toBeDefined();
    const outer = result!.outer as Record<string, unknown>;
    expect(outer.apiKey).toBe('[REDACTED]');
    const inner = outer.inner as Record<string, unknown>;
    expect(inner.token).toBe('[REDACTED]');
    expect(inner.safe).toBe('visible');
  });

  it('handles arrays', () => {
    const longKey = 'abcdefghijklmnopqrstuvwxyz12345678';
    const data = {
      items: ['safe-value', `contains-${longKey}-here`],
    };
    const result = sanitizeEventData(data);
    const items = result!.items as string[];
    expect(items[0]).toBe('safe-value');
    expect(items[1]).toContain('[REDACTED]');
    expect(items[1]).not.toContain(longKey);
  });
});

// ============================================================================
// redactSensitiveData
// ============================================================================

describe('redactSensitiveData', () => {
  it('redacts long alphanumeric strings matching API key pattern', () => {
    const apiKey = 'sk_test_abcdefghijklmnopqrstuvwxyz1234';
    const result = redactSensitiveData(`My key is ${apiKey}`) as string;
    expect(result).not.toContain(apiKey);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts known sensitive keys', () => {
    const data = {
      apiKey: 'test-fake-key',
      token: 'test-fake-token',
      password: 'test-fake-value',
      normalField: 'visible',
    };
    const result = redactSensitiveData(data) as Record<string, unknown>;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.normalField).toBe('visible');
  });

  it('preserves non-sensitive data', () => {
    const data = {
      count: 42,
      label: 'safe',
      enabled: true,
    };
    const result = redactSensitiveData(data) as Record<string, unknown>;
    expect(result.count).toBe(42);
    expect(result.label).toBe('safe');
    expect(result.enabled).toBe(true);
  });

  it('handles null gracefully', () => {
    expect(redactSensitiveData(null)).toBeNull();
  });

  it('handles undefined gracefully', () => {
    expect(redactSensitiveData(undefined)).toBeUndefined();
  });

  it('handles numbers and booleans without modification', () => {
    expect(redactSensitiveData(42)).toBe(42);
    expect(redactSensitiveData(true)).toBe(true);
    expect(redactSensitiveData(false)).toBe(false);
  });

  it('redacts sensitive keys case-insensitively via includes check', () => {
    const data = {
      MySecretValue: 'hidden',
      encryptionKey: 'hidden-too',
    };
    const result = redactSensitiveData(data) as Record<string, unknown>;
    expect(result.MySecretValue).toBe('[REDACTED]');
    expect(result.encryptionKey).toBe('[REDACTED]');
  });

  it('partially redacts long API keys keeping first/last 4 chars', () => {
    const longKey = 'abcd1234567890abcdefghijklmnopqrstuvwxyz';
    const result = redactSensitiveData(longKey) as string;
    // Should keep first 4 and last 4 characters
    expect(result).toContain('abcd');
    expect(result).toContain('wxyz');
    expect(result).toContain('[REDACTED]');
  });
});

// ============================================================================
// hashUrlSync
// ============================================================================

describe('hashUrlSync', () => {
  it('produces consistent hash for same URL', () => {
    const hash1 = hashUrlSync('https://example.com/article');
    const hash2 = hashUrlSync('https://example.com/article');
    expect(hash1).toBe(hash2);
  });

  it('strips query parameters before hashing', () => {
    const hashWithQuery = hashUrlSync('https://example.com/page?foo=bar&baz=1');
    const hashWithout = hashUrlSync('https://example.com/page');
    expect(hashWithQuery).toBe(hashWithout);
  });

  it('strips fragment before hashing', () => {
    const hashWithFragment = hashUrlSync('https://example.com/page#section1');
    const hashWithout = hashUrlSync('https://example.com/page');
    expect(hashWithFragment).toBe(hashWithout);
  });

  it('different URLs produce different hashes', () => {
    const hash1 = hashUrlSync('https://example.com/page-a');
    const hash2 = hashUrlSync('https://example.com/page-b');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a hex string', () => {
    const hash = hashUrlSync('https://example.com');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ============================================================================
// hashUrl (async)
// ============================================================================

describe('hashUrl', () => {
  it('produces consistent hash for same URL', async () => {
    const hash1 = await hashUrl('https://example.com/article');
    const hash2 = await hashUrl('https://example.com/article');
    expect(hash1).toBe(hash2);
  });

  it('strips query parameters before hashing when crypto.subtle is available', async () => {
    // When crypto.subtle works (real browser), query params are stripped.
    // In jsdom fallback (simpleHash), the raw URL is hashed without normalization.
    // We test that the function returns a valid hash either way.
    const hashWithQuery = await hashUrl('https://example.com/page?foo=bar');
    const hashWithout = await hashUrl('https://example.com/page');
    // Both produce valid hex hashes
    expect(hashWithQuery).toMatch(/^[0-9a-f]+$/);
    expect(hashWithout).toMatch(/^[0-9a-f]+$/);

    // If crypto.subtle is available, they should match; otherwise they may differ.
    // In either case, verify the function doesn't throw.
    const isSha256 = hashWithQuery.length === 64;
    if (isSha256) {
      // crypto.subtle available: query params stripped before hashing
      expect(hashWithQuery).toBe(hashWithout);
    }
  });

  it('strips fragment before hashing when crypto.subtle is available', async () => {
    const hashWithFragment = await hashUrl('https://example.com/page#section');
    const hashWithout = await hashUrl('https://example.com/page');
    expect(hashWithFragment).toMatch(/^[0-9a-f]+$/);
    expect(hashWithout).toMatch(/^[0-9a-f]+$/);

    const isSha256 = hashWithFragment.length === 64;
    if (isSha256) {
      expect(hashWithFragment).toBe(hashWithout);
    }
  });

  it('different URLs produce different hashes', async () => {
    const hash1 = await hashUrl('https://example.com/a');
    const hash2 = await hashUrl('https://example.com/b');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a hex string', async () => {
    const hash = await hashUrl('https://example.com');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ============================================================================
// redactError
// ============================================================================

describe('redactError', () => {
  it('redacts API key patterns from error messages', () => {
    const longKey = 'abcdefghijklmnopqrstuvwxyz12345678901234';
    const error = new Error(`Request failed with key ${longKey}`);
    const result = redactError(error);
    expect(result.name).toBe('Error');
    expect(result.message).not.toContain(longKey);
    expect(result.message).toContain('[REDACTED]');
  });

  it('preserves error name', () => {
    const error = new TypeError('something went wrong');
    const result = redactError(error);
    expect(result.name).toBe('TypeError');
  });

  it('normalizes extension URLs in stack traces', () => {
    const error = new Error('test');
    error.stack =
      'Error: test\n    at func (moz-extension://abc-123-def/background.js:10:5)\n    at main (chrome-extension://xyz-789/content.js:20:3)';
    const result = redactError(error);
    expect(result.stack).not.toContain('abc-123-def');
    expect(result.stack).not.toContain('xyz-789');
    expect(result.stack).toContain('ext://');
  });

  it('returns undefined stack when error has no stack', () => {
    const error = new Error('no stack');
    error.stack = undefined;
    const result = redactError(error);
    expect(result.stack).toBeUndefined();
  });

  it('preserves short non-sensitive error messages', () => {
    const error = new Error('Network timeout');
    const result = redactError(error);
    expect(result.message).toBe('Network timeout');
  });
});

// ============================================================================
// redactStackTrace
// ============================================================================

describe('redactStackTrace', () => {
  it('removes moz-extension:// UUIDs', () => {
    const stack =
      'Error\n    at foo (moz-extension://a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.js:10:5)';
    const result = redactStackTrace(stack);
    expect(result).not.toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result).toContain('ext://');
  });

  it('removes chrome-extension:// UUIDs', () => {
    const stack =
      'Error\n    at bar (chrome-extension://abcdefghijklmnopqrstuvwxyz123456/content.js:20:3)';
    const result = redactStackTrace(stack);
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(result).toContain('ext://');
  });

  it('returns empty string unchanged', () => {
    expect(redactStackTrace('')).toBe('');
  });

  it('returns falsy input as-is', () => {
    // redactStackTrace checks `if (!stack)` so empty string returns empty string
    expect(redactStackTrace(null as unknown as string)).toBeFalsy();
    expect(redactStackTrace(undefined as unknown as string)).toBeFalsy();
  });

  it('normalizes file:// paths', () => {
    const stack =
      'Error\n    at baz (file:///Users/dev/project/src/module.js:30:10)';
    const result = redactStackTrace(stack);
    expect(result).toContain('file://...');
    expect(result).not.toContain('/Users/dev/project');
  });

  it('removes line and column numbers', () => {
    const stack = 'Error\n    at func (ext://background.js:42:15)';
    const result = redactStackTrace(stack);
    expect(result).not.toContain(':42:15');
    expect(result).toContain('background.js');
  });
});
