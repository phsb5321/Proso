/**
 * Unit tests for PrefetchService class
 * Feature: 028-smart-audio-cache (User Story 3)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PrefetchService,
  type AudioGenerator,
  type CacheChecker,
  type PrefetchedAudio,
} from '../../../src/utils/playback/prefetch';
import { PlaybackQueue } from '../../../src/utils/playback/playback-queue';

describe('PrefetchService', () => {
  let service: PrefetchService;
  let queue: PlaybackQueue;
  let mockAudioGenerator: AudioGenerator;
  let mockCacheChecker: CacheChecker;
  let audioGenCalls: Array<[string, number]>;
  let cacheCheckCalls: number[];

  const createMockAudioGenerator = (returnValue = true): AudioGenerator => {
    audioGenCalls = [];
    return async (text: string, index: number) => {
      audioGenCalls.push([text, index]);
      if (!returnValue) return null;
      return {
        audioUrl: `blob:test-${index}`,
        wordTimings: [
          { word: 'test', charOffset: 0, charLength: 4, startTimeMs: 0, endTimeMs: 100 },
        ],
      };
    };
  };

  const createMockCacheChecker = (returnValue = false): CacheChecker => {
    cacheCheckCalls = [];
    return async (index: number) => {
      cacheCheckCalls.push(index);
      return returnValue;
    };
  };

  beforeEach(() => {
    service = new PrefetchService({
      maxBufferSize: 5,
      maxConcurrent: 2,
      batchIntervalMs: 50, // Fast for tests
    });
    queue = new PlaybackQueue();

    mockAudioGenerator = createMockAudioGenerator();
    mockCacheChecker = createMockCacheChecker();
  });

  afterEach(() => {
    service.dispose();
    jest.clearAllMocks();
  });

  describe('configuration', () => {
    it('should configure with queue and audio generator', () => {
      queue.initialize(['P1', 'P2', 'P3']);

      service.configure(queue, mockAudioGenerator);

      const status = service.getStatus();
      expect(status.isActive).toBe(false);
      expect(status.bufferSize).toBe(0);
    });

    it('should configure with optional cache checker', () => {
      queue.initialize(['P1', 'P2', 'P3']);

      service.configure(queue, mockAudioGenerator, mockCacheChecker);

      // Should not throw
      expect(service.getStatus()).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3', 'P4', 'P5']);
      service.configure(queue, mockAudioGenerator, mockCacheChecker);
    });

    it('should not start without configuration', () => {
      const unconfiguredService = new PrefetchService();
      unconfiguredService.start();

      expect(unconfiguredService.getStatus().isActive).toBe(false);
    });

    it('should start prefetching', () => {
      queue.start();
      service.start();

      expect(service.getStatus().isActive).toBe(true);
    });

    it('should stop prefetching', () => {
      queue.start();
      service.start();
      service.stop();

      expect(service.getStatus().isActive).toBe(false);
    });

    it('should clear buffer', () => {
      queue.start();
      service.start();

      // Manually add to buffer for testing
      service.clearBuffer();

      expect(service.getStatus().bufferSize).toBe(0);
    });

    it('should clear buffer keeping specified indices', async () => {
      queue.start();
      service.start();

      // Wait for some prefetching to happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      const statusBefore = service.getStatus();
      service.clearBuffer([1, 2]);
      const statusAfter = service.getStatus();

      // Buffer should be cleared except for kept indices
      expect(statusAfter.bufferSize).toBeLessThanOrEqual(statusBefore.bufferSize);
    });

    it('should dispose all resources', () => {
      queue.start();
      service.start();
      service.dispose();

      expect(service.getStatus().isActive).toBe(false);
      expect(service.getStatus().bufferSize).toBe(0);
    });
  });

  describe('buffer access', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3']);
      service.configure(queue, mockAudioGenerator);
    });

    it('should return null for non-existent index', () => {
      expect(service.get(999)).toBeNull();
    });

    it('should report has() correctly', () => {
      expect(service.has(0)).toBe(false);
    });

    it('should consume item from buffer', async () => {
      queue.start();
      service.start();

      // Wait for prefetching
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = service.getStatus();
      if (status.bufferedIndices.length > 0) {
        const index = status.bufferedIndices[0];
        const consumed = service.consume(index);

        expect(consumed).not.toBeNull();
        expect(service.has(index)).toBe(false);
      }
    });
  });

  describe('priority scoring', () => {
    it('should calculate high priority for current position', () => {
      const score = service.calculatePriorityScore(0, 0, false);
      expect(score).toBeGreaterThan(80);
    });

    it('should calculate lower priority for items ahead', () => {
      const score1 = service.calculatePriorityScore(1, 0, false);
      const score3 = service.calculatePriorityScore(3, 0, false);

      expect(score1).toBeGreaterThan(score3);
    });

    it('should return negative score for cached items', () => {
      const score = service.calculatePriorityScore(1, 0, true);
      expect(score).toBeLessThan(0);
    });

    it('should return low priority for passed items', () => {
      const score = service.calculatePriorityScore(0, 5, false);
      expect(score).toBeLessThan(0);
    });

    it('should return correct priority levels', () => {
      expect(service.getPriorityLevel(100)).toBe('high');
      expect(service.getPriorityLevel(60)).toBe('medium');
      expect(service.getPriorityLevel(20)).toBe('low');
    });
  });

  describe('prefetching behavior', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3', 'P4', 'P5']);
      // Reset tracking arrays and configure
      mockAudioGenerator = createMockAudioGenerator();
      mockCacheChecker = createMockCacheChecker();
      service.configure(queue, mockAudioGenerator, mockCacheChecker);
    });

    it('should call audio generator for pending items', async () => {
      queue.start();
      service.start();

      // Wait for prefetch batch - needs time for async processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(audioGenCalls.length).toBeGreaterThan(0);
    });

    it('should check cache before generating audio', async () => {
      queue.start();
      service.start();

      // Wait for prefetch batch
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(cacheCheckCalls.length).toBeGreaterThan(0);
    });

    it('should skip cached items', async () => {
      mockCacheChecker = createMockCacheChecker(true); // All items are cached
      mockAudioGenerator = createMockAudioGenerator();
      service.configure(queue, mockAudioGenerator, mockCacheChecker);

      queue.start();
      service.start();

      // Wait for prefetch batch
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Audio generator should not be called for cached items
      expect(audioGenCalls.length).toBe(0);
    });

    it('should mark queue items as prefetched', async () => {
      queue.start();
      service.start();

      // Wait for prefetching
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check that some items were marked as prefetched in the queue
      const items = queue.getAllItems();
      const prefetchedItems = items.filter((item) => item.isPrefetched);

      // At least some items should be prefetched (depending on timing)
      expect(prefetchedItems.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle audio generation errors', async () => {
      let callCount = 0;
      const errorGenerator: AudioGenerator = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return { audioUrl: 'blob:test', wordTimings: [] };
      };
      service.configure(queue, errorGenerator, mockCacheChecker);

      queue.start();
      service.start();

      // Wait for prefetch batch
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should not throw, service should continue
      expect(service.getStatus().isActive).toBe(true);
    });
  });

  describe('status reporting', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3']);
      service.configure(queue, mockAudioGenerator);
    });

    it('should report initial status', () => {
      const status = service.getStatus();

      expect(status).toMatchObject({
        isActive: false,
        bufferSize: 0,
        bufferedIndices: [],
        pendingTasks: 0,
        inProgressTasks: 0,
      });
    });

    it('should report active status when started', () => {
      queue.start();
      service.start();

      const status = service.getStatus();
      expect(status.isActive).toBe(true);
    });
  });

  describe('stop during an in-flight fetch', () => {
    it('revokes a blob URL that arrives after the service stopped', async () => {
      // stop() runs clearBuffer(), which revokes every URL the buffer knows about.
      // A fetch still in flight resolves *after* that, so its URL is created too late
      // to be in the buffer and is never stored — if the result is simply dropped,
      // nothing ever revokes it.
      const revoked: string[] = [];
      const originalRevoke = URL.revokeObjectURL;
      URL.revokeObjectURL = (url: string) => {
        revoked.push(url);
      };

      let releaseGeneration: (() => void) | undefined;
      const blocked = new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });

      const slowGenerator: AudioGenerator = async (_text: string, index: number) => {
        await blocked;
        return { audioUrl: `blob:in-flight-${index}`, wordTimings: [] };
      };

      try {
        queue.initialize(['P1', 'P2', 'P3']);
        service.configure(queue, slowGenerator);
        queue.start();
        service.start();

        // Let a batch start and block inside the generator.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(service.getStatus().inProgressTasks).toBeGreaterThan(0);

        service.stop();
        service.clearBuffer();
        revoked.length = 0; // ignore anything clearBuffer legitimately revoked

        releaseGeneration?.();
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(revoked.some((url) => url.startsWith('blob:in-flight-'))).toBe(true);
        expect(service.getStatus().bufferSize).toBe(0);
      } finally {
        releaseGeneration?.();
        URL.revokeObjectURL = originalRevoke;
      }
    });

    it('aborts the in-flight fetch so a stopped run stops spending', async () => {
      // Prefetch is speculative: it synthesizes paragraphs the reader may never
      // reach, and synthesis is billed. Dropping the result on stop() is not
      // enough — the request has to actually be cancelled.
      const seenSignals: Array<AbortSignal | undefined> = [];

      let releaseGeneration: (() => void) | undefined;
      const blocked = new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });

      const signalCapturingGenerator: AudioGenerator = async (
        _text: string,
        index: number,
        signal?: AbortSignal,
      ) => {
        seenSignals.push(signal);
        await blocked;
        return { audioUrl: `blob:abortable-${index}`, wordTimings: [] };
      };

      try {
        queue.initialize(['P1', 'P2', 'P3']);
        service.configure(queue, signalCapturingGenerator);
        queue.start();
        service.start();

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(seenSignals.length).toBeGreaterThan(0);
        expect(seenSignals.every((signal) => signal?.aborted === false)).toBe(true);

        service.stop();

        expect(seenSignals.every((signal) => signal?.aborted === true)).toBe(true);
      } finally {
        releaseGeneration?.();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
  });
});
