/**
 * Dispatch Logger Tests
 *
 * Tests for the telemetry dispatch logger module.
 * Verifies hex, legacy, and unknown message tracking (T1.3).
 *
 * @module tests/unit/telemetry/dispatch-logger
 */

import {
  logDispatch,
  logUnknownMessage,
  getDispatchStats,
  getUnknownMessageStats,
  resetDispatchStats,
  getMessageStats,
  getTrackedMessageTypes,
  isFullyMigrated,
  getPendingMigrations,
} from '../../../src/utils/telemetry';

describe('Dispatch Logger', () => {
  beforeEach(() => {
    resetDispatchStats();
  });

  describe('logDispatch', () => {
    it('should track hex dispatches', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.hexTotal).toBe(1);
      expect(stats.legacyTotal).toBe(0);
      expect(stats.hexPercentage).toBe(100);
    });

    it('should track legacy dispatches', () => {
      logDispatch({
        type: 'startPlayback',
        path: 'legacy',
        durationMs: 15,
        success: true,
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.hexTotal).toBe(0);
      expect(stats.legacyTotal).toBe(1);
      expect(stats.hexPercentage).toBe(0);
    });

    it('should calculate hex percentage correctly', () => {
      // 3 hex, 1 legacy = 75%
      for (let i = 0; i < 3; i++) {
        logDispatch({
          type: 'playback.start',
          path: 'hex',
          durationMs: 10,
          success: true,
          timestamp: Date.now(),
        });
      }
      logDispatch({
        type: 'startPlayback',
        path: 'legacy',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.hexTotal).toBe(3);
      expect(stats.legacyTotal).toBe(1);
      expect(stats.hexPercentage).toBe(75);
    });

    it('should track by message type', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logDispatch({
        type: 'playback.start',
        path: 'legacy',
        durationMs: 15,
        success: true,
        timestamp: Date.now(),
      });

      const typeStats = getMessageStats('playback.start');
      expect(typeStats).toBeDefined();
      expect(typeStats?.hexCount).toBe(1);
      expect(typeStats?.legacyCount).toBe(1);
    });
  });

  describe('unknown message tracking (T1.3)', () => {
    it('should track unknown dispatches', () => {
      logDispatch({
        type: 'invalid.message',
        path: 'unknown',
        durationMs: 0,
        success: false,
        error: 'No handler found',
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.unknownTotal).toBe(1);
      expect(stats.unknownTypes['invalid.message']).toBeDefined();
      expect(stats.unknownTypes['invalid.message'].count).toBe(1);
    });

    it('should count multiple unknown messages of same type', () => {
      for (let i = 0; i < 5; i++) {
        logDispatch({
          type: 'bad.action',
          path: 'unknown',
          durationMs: 0,
          success: false,
          timestamp: Date.now(),
        });
      }

      const stats = getDispatchStats();
      expect(stats.unknownTotal).toBe(5);
      expect(stats.unknownTypes['bad.action'].count).toBe(5);
    });

    it('should track multiple different unknown types', () => {
      logDispatch({
        type: 'unknown.one',
        path: 'unknown',
        durationMs: 0,
        success: false,
        timestamp: Date.now(),
      });
      logDispatch({
        type: 'unknown.two',
        path: 'unknown',
        durationMs: 0,
        success: false,
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.unknownTotal).toBe(2);
      expect(Object.keys(stats.unknownTypes)).toHaveLength(2);
    });

    it('should not affect hex/legacy counts or percentage', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logDispatch({
        type: 'unknown.action',
        path: 'unknown',
        durationMs: 0,
        success: false,
        timestamp: Date.now(),
      });

      const stats = getDispatchStats();
      expect(stats.hexTotal).toBe(1);
      expect(stats.legacyTotal).toBe(0);
      expect(stats.unknownTotal).toBe(1);
      expect(stats.hexPercentage).toBe(100); // Unknown doesn't affect percentage
    });

    it('should track lastSeen timestamp for unknown types', () => {
      const before = Date.now();
      logDispatch({
        type: 'test.unknown',
        path: 'unknown',
        durationMs: 0,
        success: false,
        timestamp: before,
      });

      const stats = getDispatchStats();
      expect(stats.unknownTypes['test.unknown'].lastSeen).toBe(before);
    });
  });

  describe('logUnknownMessage helper', () => {
    it('should log unknown message with default values', () => {
      logUnknownMessage('my.unknown.action');

      const stats = getDispatchStats();
      expect(stats.unknownTotal).toBe(1);
      expect(stats.unknownTypes['my.unknown.action']).toBeDefined();
      expect(stats.unknownTypes['my.unknown.action'].count).toBe(1);
    });

    it('should work for multiple calls', () => {
      logUnknownMessage('action.a');
      logUnknownMessage('action.b');
      logUnknownMessage('action.a');

      const stats = getDispatchStats();
      expect(stats.unknownTotal).toBe(3);
      expect(stats.unknownTypes['action.a'].count).toBe(2);
      expect(stats.unknownTypes['action.b'].count).toBe(1);
    });
  });

  describe('getUnknownMessageStats', () => {
    it('should return empty stats when no unknown messages', () => {
      const unknownStats = getUnknownMessageStats();
      expect(unknownStats.total).toBe(0);
      expect(Object.keys(unknownStats.types)).toHaveLength(0);
    });

    it('should return correct stats after unknown messages', () => {
      logUnknownMessage('foo.bar');
      logUnknownMessage('foo.bar');
      logUnknownMessage('baz.qux');

      const unknownStats = getUnknownMessageStats();
      expect(unknownStats.total).toBe(3);
      expect(unknownStats.types['foo.bar'].count).toBe(2);
      expect(unknownStats.types['baz.qux'].count).toBe(1);
    });

    it('should return a copy of types (not reference)', () => {
      logUnknownMessage('test.type');
      const stats1 = getUnknownMessageStats();
      const stats2 = getUnknownMessageStats();

      expect(stats1.types).not.toBe(stats2.types);
      expect(stats1.types).toEqual(stats2.types);
    });
  });

  describe('resetDispatchStats', () => {
    it('should reset all stats including unknown', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logUnknownMessage('test.unknown');

      resetDispatchStats();

      const stats = getDispatchStats();
      expect(stats.hexTotal).toBe(0);
      expect(stats.legacyTotal).toBe(0);
      expect(stats.unknownTotal).toBe(0);
      expect(Object.keys(stats.unknownTypes)).toHaveLength(0);
      expect(Object.keys(stats.byType)).toHaveLength(0);
    });
  });

  describe('getTrackedMessageTypes', () => {
    it('should return hex and legacy types (not unknown)', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logUnknownMessage('unknown.type');

      const types = getTrackedMessageTypes();
      expect(types).toContain('playback.start');
      expect(types).not.toContain('unknown.type');
    });
  });

  describe('isFullyMigrated', () => {
    it('should return true for hex-only types', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });

      expect(isFullyMigrated('playback.start')).toBe(true);
    });

    it('should return false for types with legacy dispatches', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logDispatch({
        type: 'playback.start',
        path: 'legacy',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });

      expect(isFullyMigrated('playback.start')).toBe(false);
    });

    it('should return false for unknown types', () => {
      expect(isFullyMigrated('never.dispatched')).toBe(false);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return types that still use legacy', () => {
      logDispatch({
        type: 'playback.start',
        path: 'hex',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });
      logDispatch({
        type: 'startPlayback',
        path: 'legacy',
        durationMs: 10,
        success: true,
        timestamp: Date.now(),
      });

      const pending = getPendingMigrations();
      expect(pending).toContain('startPlayback');
      expect(pending).not.toContain('playback.start');
    });
  });
});
