/**
 * Unit tests for PlaybackQueue class
 * Feature: 028-smart-audio-cache (User Story 3)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PlaybackQueue, type QueueState, type QueueItem } from '../../../src/utils/playback/playback-queue';

describe('PlaybackQueue', () => {
  let queue: PlaybackQueue;

  beforeEach(() => {
    queue = new PlaybackQueue();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const state = queue.getState();
      expect(state.currentIndex).toBe(-1);
      expect(state.totalItems).toBe(0);
      expect(state.isPlaying).toBe(false);
    });

    it('should initialize with paragraphs', () => {
      queue.initialize(['Para 1', 'Para 2', 'Para 3']);

      const state = queue.getState();
      expect(state.totalItems).toBe(3);
      expect(state.currentIndex).toBe(0);
    });

    it('should initialize with custom start index', () => {
      queue.initialize(['Para 1', 'Para 2', 'Para 3'], { startIndex: 1 });

      const state = queue.getState();
      expect(state.currentIndex).toBe(1);
    });

    it('should mark cached indices as ready', () => {
      queue.initialize(['Para 1', 'Para 2', 'Para 3'], { cachedIndices: [0, 2] });

      const item0 = queue.getItem(0);
      const item1 = queue.getItem(1);
      const item2 = queue.getItem(2);

      expect(item0?.isCached).toBe(true);
      expect(item1?.isCached).toBe(false);
      expect(item2?.isCached).toBe(true);
    });

    it('should clamp start index to valid range', () => {
      queue.initialize(['Para 1', 'Para 2'], { startIndex: 100 });

      const state = queue.getState();
      expect(state.currentIndex).toBe(1); // Clamped to last valid index
    });
  });

  describe('playback control', () => {
    beforeEach(() => {
      queue.initialize(['Para 1', 'Para 2', 'Para 3']);
    });

    it('should start playback', () => {
      const item = queue.start();

      expect(item).not.toBeNull();
      expect(item?.index).toBe(0);
      expect(item?.status).toBe('playing');
      expect(queue.getState().isPlaying).toBe(true);
    });

    it('should start playback from specific index', () => {
      const item = queue.start(2);

      expect(item?.index).toBe(2);
      expect(queue.getState().currentIndex).toBe(2);
    });

    it('should pause playback', () => {
      queue.start();
      queue.pause();

      expect(queue.getState().isPlaying).toBe(false);
    });

    it('should stop and reset playback', () => {
      queue.start();
      queue.advance();
      queue.stop();

      const state = queue.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentIndex).toBe(0);
    });

    it('should advance to next item', () => {
      queue.start();
      const nextItem = queue.advance();

      expect(nextItem?.index).toBe(1);
      expect(nextItem?.status).toBe('playing');
      expect(queue.getState().completedItems).toBe(1);
    });

    it('should return null when advancing past end', () => {
      queue.start(2); // Last item
      const nextItem = queue.advance();

      expect(nextItem).toBeNull();
      expect(queue.getState().isPlaying).toBe(false);
    });

    it('should jump to specific index', () => {
      queue.start();
      const jumpedItem = queue.jumpTo(2);

      expect(jumpedItem?.index).toBe(2);
      expect(queue.getState().currentIndex).toBe(2);
    });

    it('should return null when jumping to invalid index', () => {
      queue.start();
      const jumpedItem = queue.jumpTo(100);

      expect(jumpedItem).toBeNull();
    });
  });

  describe('prefetch management', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    });

    it('should return prefetch window', () => {
      queue.start();
      const window = queue.getPrefetchWindow();

      // Default prefetch ahead is 3, so window should include indices 0-3
      // But index 0 is current (playing), so it might not be in pending state
      expect(window.length).toBeGreaterThan(0);
    });

    it('should mark item as prefetching', () => {
      queue.start();
      queue.markPrefetching(1);

      const item = queue.getItem(1);
      expect(item?.status).toBe('prefetching');
    });

    it('should mark item as prefetched', () => {
      queue.start();
      queue.markPrefetching(1);
      queue.markPrefetched(1);

      const item = queue.getItem(1);
      expect(item?.status).toBe('ready');
      expect(item?.isPrefetched).toBe(true);
    });

    it('should mark item as cached', () => {
      queue.start();
      queue.markCached(1);

      const item = queue.getItem(1);
      expect(item?.isCached).toBe(true);
    });

    it('should mark item as error', () => {
      queue.start();
      queue.markError(1, 'Test error');

      const item = queue.getItem(1);
      expect(item?.status).toBe('error');
      expect(item?.errorMessage).toBe('Test error');
    });

    it('should update cached indices', () => {
      queue.start();
      queue.updateCachedIndices([1, 3, 5]);

      expect(queue.getItem(1)?.isCached).toBe(true);
      expect(queue.getItem(2)?.isCached).toBe(false);
      expect(queue.getItem(3)?.isCached).toBe(true);
    });
  });

  describe('state queries', () => {
    beforeEach(() => {
      queue.initialize(['P1', 'P2', 'P3'], { cachedIndices: [0] });
    });

    it('should report item ready status', () => {
      queue.start();

      expect(queue.isItemReady(0)).toBe(true); // Cached
      expect(queue.isItemReady(1)).toBe(false); // Pending
    });

    it('should report finished status', () => {
      queue.start(2);
      queue.advance();

      expect(queue.isFinished()).toBe(true);
    });

    it('should report hasNext/hasPrevious', () => {
      queue.start(1);

      expect(queue.hasNext()).toBe(true);
      expect(queue.hasPrevious()).toBe(true);
    });

    it('should get all items', () => {
      const items = queue.getAllItems();

      expect(items.length).toBe(3);
      expect(items[0].text).toBe('P1');
    });

    it('should get current item', () => {
      queue.start(1);
      const current = queue.getCurrentItem();

      expect(current?.index).toBe(1);
      expect(current?.text).toBe('P2');
    });
  });

  describe('state change notifications', () => {
    it('should notify on state changes', () => {
      const callback = jest.fn();
      queue.onStateChanged(callback);

      queue.initialize(['P1', 'P2']);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toMatchObject({
        totalItems: 2,
        currentIndex: 0,
      });
    });

    it('should unsubscribe from notifications', () => {
      const callback = jest.fn();
      queue.onStateChanged(callback);
      queue.offStateChanged();

      queue.initialize(['P1', 'P2']);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear queue and reset state', () => {
      queue.initialize(['P1', 'P2', 'P3']);
      queue.start();
      queue.clear();

      const state = queue.getState();
      expect(state.totalItems).toBe(0);
      expect(state.currentIndex).toBe(-1);
      expect(state.isPlaying).toBe(false);
    });
  });
});
