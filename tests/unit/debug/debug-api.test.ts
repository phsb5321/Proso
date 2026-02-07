/**
 * Tests for Debug API
 * Contract: specs/056-production-readiness-sprint/contracts/debug-infrastructure.yaml
 *
 * Test cases:
 * 1. Debug API exposes all documented state
 * 2. Debug API does NOT expose API keys
 * 3. Debug API returns serializable data (JSON.stringify succeeds)
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { resolve } from 'node:path';

const {
  getDebugSnapshot,
  registerDebugProviders,
  unregisterDebugProviders,
  isDebugApiAvailable,
} = await import(resolve('src/utils/debug/debug-api'));

import type { DebugStateProviders, DebugSnapshot } from '../../../src/utils/debug/debug-api';
import type { LogEntry } from '../../../src/utils/logging/entry';

/**
 * Create mock state providers for testing
 */
function createMockProviders(overrides?: Partial<DebugStateProviders>): DebugStateProviders {
  return {
    getExtractedParagraphs: jest.fn<() => string[]>().mockReturnValue(['Hello world.', 'Second paragraph.']),
    getPlaybackState: jest.fn<() => { status: string; currentParagraph: number; totalParagraphs: number; progress: number; speed: number; provider: string; voice: string }>().mockReturnValue({
      status: 'playing',
      currentParagraph: 1,
      totalParagraphs: 5,
      progress: 0.2,
      speed: 1.0,
      provider: 'elevenlabs',
      voice: 'Rachel',
    }),
    getCacheStats: jest.fn<() => { entries: number; totalSize: number; maxSize: number; hitCount: number; missCount: number; hitRate: number }>().mockReturnValue({
      entries: 10,
      totalSize: 524288,
      maxSize: 10485760,
      hitCount: 42,
      missCount: 8,
      hitRate: 0.84,
    }),
    getLogBuffer: jest.fn<() => LogEntry[]>().mockReturnValue([
      {
        timestamp: '1234567890123456789',
        level: 'info',
        message: 'Test log entry',
        component: 'handler',
        metadata: null,
      },
    ]),
    getHandlerNames: jest.fn<() => string[]>().mockReturnValue([
      'playback.start',
      'playback.stop',
      'cache.getStats',
    ]),
    getHandlerCount: jest.fn<() => number>().mockReturnValue(3),
    getDispatchStats: jest.fn<() => { hexTotal: number; legacyTotal: number; unknownTotal: number; hexPercentage: number }>().mockReturnValue({
      hexTotal: 100,
      legacyTotal: 20,
      unknownTotal: 2,
      hexPercentage: 82.0,
    }),
    getProviderConfig: jest.fn<() => { provider: string; voice: string; speed: number }>().mockReturnValue({
      provider: 'elevenlabs',
      voice: 'Rachel',
      speed: 1.0,
    }),
    ...overrides,
  };
}

describe('Debug API', () => {
  afterEach(() => {
    unregisterDebugProviders();
  });

  describe('isDebugApiAvailable', () => {
    it('returns true (in dev/test builds)', () => {
      expect(isDebugApiAvailable()).toBe(true);
    });
  });

  describe('getDebugSnapshot without providers', () => {
    it('returns null when no providers are registered', () => {
      const snapshot = getDebugSnapshot();
      expect(snapshot).toBeNull();
    });
  });

  // Test 1: Debug API exposes all documented state
  describe('exposes all documented state', () => {
    it('returns a snapshot with all 6 top-level keys', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot).toHaveProperty('extractedText');
      expect(snapshot).toHaveProperty('playbackState');
      expect(snapshot).toHaveProperty('cacheStats');
      expect(snapshot).toHaveProperty('logBuffer');
      expect(snapshot).toHaveProperty('handlerRegistry');
      expect(snapshot).toHaveProperty('providerConfig');
    });

    it('extractedText contains paragraphCount and paragraphs array', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.extractedText.paragraphCount).toBe(2);
      expect(snapshot.extractedText.paragraphs).toEqual(['Hello world.', 'Second paragraph.']);
    });

    it('playbackState contains all expected fields', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.playbackState.status).toBe('playing');
      expect(snapshot.playbackState.currentParagraph).toBe(1);
      expect(snapshot.playbackState.totalParagraphs).toBe(5);
      expect(snapshot.playbackState.progress).toBe(0.2);
      expect(snapshot.playbackState.speed).toBe(1.0);
      expect(snapshot.playbackState.provider).toBe('elevenlabs');
      expect(snapshot.playbackState.voice).toBe('Rachel');
    });

    it('cacheStats contains hit/miss ratio and size info', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.cacheStats.entries).toBe(10);
      expect(snapshot.cacheStats.totalSizeBytes).toBe(524288);
      expect(snapshot.cacheStats.maxSizeBytes).toBe(10485760);
      expect(snapshot.cacheStats.hitCount).toBe(42);
      expect(snapshot.cacheStats.missCount).toBe(8);
      expect(snapshot.cacheStats.hitRate).toBe(0.84);
    });

    it('logBuffer contains recent log entries', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.logBuffer).toHaveLength(1);
      expect(snapshot.logBuffer[0].message).toBe('Test log entry');
    });

    it('logBuffer is limited to last 100 entries', () => {
      const manyEntries = Array.from({ length: 150 }, (_, i) => ({
        timestamp: '1234567890123456789',
        level: 'info' as const,
        message: `Entry ${i}`,
        component: 'handler' as const,
        metadata: null,
      }));
      registerDebugProviders(
        createMockProviders({
          getLogBuffer: jest.fn<() => LogEntry[]>().mockReturnValue(manyEntries),
        }),
      );
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.logBuffer).toHaveLength(100);
      // Should be the LAST 100 entries (50-149)
      expect(snapshot.logBuffer[0].message).toBe('Entry 50');
      expect(snapshot.logBuffer[99].message).toBe('Entry 149');
    });

    it('handlerRegistry contains handler names and dispatch stats', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.handlerRegistry.handlerCount).toBe(3);
      expect(snapshot.handlerRegistry.handlerNames).toEqual([
        'playback.start',
        'playback.stop',
        'cache.getStats',
      ]);
      expect(snapshot.handlerRegistry.dispatchStats.hexTotal).toBe(100);
      expect(snapshot.handlerRegistry.dispatchStats.legacyTotal).toBe(20);
      expect(snapshot.handlerRegistry.dispatchStats.unknownTotal).toBe(2);
      expect(snapshot.handlerRegistry.dispatchStats.hexPercentage).toBe(82.0);
    });

    it('providerConfig contains provider, voice, and speed', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(snapshot.providerConfig.provider).toBe('elevenlabs');
      expect(snapshot.providerConfig.voice).toBe('Rachel');
      expect(snapshot.providerConfig.speed).toBe(1.0);
    });
  });

  // Test 2: Debug API does NOT expose API keys
  describe('API key exclusion', () => {
    it('providerConfig does not contain apiKey field', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      const configStr = JSON.stringify(snapshot.providerConfig);
      expect(configStr).not.toContain('apiKey');
      expect(configStr).not.toContain('api_key');
      expect(configStr).not.toContain('token');
      expect(configStr).not.toContain('secret');
    });

    it('no part of the snapshot contains API key patterns', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      const fullStr = JSON.stringify(snapshot);
      // Should not contain typical API key field names
      expect(fullStr).not.toContain('"apiKey"');
      expect(fullStr).not.toContain('"api_key"');
      expect(fullStr).not.toContain('"secret"');
      // Provider config should only have provider/voice/speed
      const configKeys = Object.keys(snapshot.providerConfig);
      expect(configKeys.sort()).toEqual(['provider', 'speed', 'voice']);
    });

    it('playbackState does not expose sensitive data', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      const playbackKeys = Object.keys(snapshot.playbackState);
      expect(playbackKeys).not.toContain('apiKey');
      expect(playbackKeys).not.toContain('token');
    });
  });

  // Test 3: Debug API returns serializable data
  describe('JSON serializability', () => {
    it('JSON.stringify succeeds on the full snapshot', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    });

    it('roundtrip serialization preserves data', () => {
      registerDebugProviders(createMockProviders());
      const snapshot = getDebugSnapshot()!;
      const json = JSON.stringify(snapshot);
      const parsed = JSON.parse(json) as DebugSnapshot;
      expect(parsed.extractedText.paragraphCount).toBe(snapshot.extractedText.paragraphCount);
      expect(parsed.playbackState.status).toBe(snapshot.playbackState.status);
      expect(parsed.cacheStats.entries).toBe(snapshot.cacheStats.entries);
      expect(parsed.handlerRegistry.handlerCount).toBe(snapshot.handlerRegistry.handlerCount);
      expect(parsed.providerConfig.provider).toBe(snapshot.providerConfig.provider);
    });

    it('handles empty state gracefully', () => {
      registerDebugProviders(
        createMockProviders({
          getExtractedParagraphs: jest.fn<() => string[]>().mockReturnValue([]),
          getLogBuffer: jest.fn<() => LogEntry[]>().mockReturnValue([]),
          getHandlerNames: jest.fn<() => string[]>().mockReturnValue([]),
          getHandlerCount: jest.fn<() => number>().mockReturnValue(0),
        }),
      );
      const snapshot = getDebugSnapshot()!;
      expect(() => JSON.stringify(snapshot)).not.toThrow();
      expect(snapshot.extractedText.paragraphCount).toBe(0);
      expect(snapshot.logBuffer).toHaveLength(0);
      expect(snapshot.handlerRegistry.handlerCount).toBe(0);
    });
  });

  // Registration lifecycle
  describe('provider registration lifecycle', () => {
    it('registerDebugProviders enables getDebugSnapshot', () => {
      expect(getDebugSnapshot()).toBeNull();
      registerDebugProviders(createMockProviders());
      expect(getDebugSnapshot()).not.toBeNull();
    });

    it('unregisterDebugProviders disables getDebugSnapshot', () => {
      registerDebugProviders(createMockProviders());
      expect(getDebugSnapshot()).not.toBeNull();
      unregisterDebugProviders();
      expect(getDebugSnapshot()).toBeNull();
    });

    it('calls all provider functions when taking snapshot', () => {
      const providers = createMockProviders();
      registerDebugProviders(providers);
      getDebugSnapshot();

      expect(providers.getExtractedParagraphs).toHaveBeenCalledTimes(1);
      expect(providers.getPlaybackState).toHaveBeenCalledTimes(1);
      expect(providers.getCacheStats).toHaveBeenCalledTimes(1);
      expect(providers.getLogBuffer).toHaveBeenCalledTimes(1);
      expect(providers.getHandlerNames).toHaveBeenCalledTimes(1);
      expect(providers.getHandlerCount).toHaveBeenCalledTimes(1);
      expect(providers.getDispatchStats).toHaveBeenCalledTimes(1);
      expect(providers.getProviderConfig).toHaveBeenCalledTimes(1);
    });
  });
});
