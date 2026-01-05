/**
 * Queue Player Unit Tests
 * Tests for QueuePlayer class (T058)
 *
 * @module tests/unit/queue-player
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock browser.storage.local before importing the module
const mockStorage: Record<string, unknown> = {};
const mockStorageGet = jest.fn(async (keys: string | string[]) => {
  if (typeof keys === 'string') {
    return { [keys]: mockStorage[keys] };
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in mockStorage) {
      result[key] = mockStorage[key];
    }
  }
  return result;
});

const mockStorageSet = jest.fn(async (items: Record<string, unknown>) => {
  Object.assign(mockStorage, items);
});

// Mock global browser object
(globalThis as any).browser = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
};

import { QueuePlayer, createQueuePlayer, type QueuePlaybackState, type QueuePlayerCallbacks } from '../../utils/queue/player';
import { QueueStore, createQueueStore } from '../../utils/queue/store';
import type { QueueItem } from '../../utils/queue/types';

describe('QueuePlayer', () => {
  let store: QueueStore;

  beforeEach(() => {
    // Clear storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
    store = createQueueStore();
  });

  describe('constructor and factory', () => {
    it('should create instance with QueuePlayer class', () => {
      const player = new QueuePlayer(store);
      expect(player).toBeInstanceOf(QueuePlayer);
    });

    it('should create instance with createQueuePlayer factory', () => {
      const player = createQueuePlayer(store);
      expect(player).toBeInstanceOf(QueuePlayer);
    });

    it('should accept callbacks', () => {
      const callbacks: QueuePlayerCallbacks = {
        onItemStart: jest.fn(),
        onItemComplete: jest.fn(),
      };
      const player = new QueuePlayer(store, callbacks);
      expect(player).toBeInstanceOf(QueuePlayer);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const player = new QueuePlayer(store);
      const state = player.getState();

      expect(state).toEqual({
        isPlaying: false,
        currentItem: null,
        currentIndex: -1,
        totalItems: 0,
        hasNext: false,
        hasPrevious: false,
      });
    });

    it('should return copy of state (not reference)', () => {
      const player = new QueuePlayer(store);
      const state1 = player.getState();
      const state2 = player.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('play', () => {
    it('should return null when queue is empty', async () => {
      const player = new QueuePlayer(store);
      const item = await player.play();
      expect(item).toBeNull();
    });

    it('should start playing first pending item', async () => {
      const player = new QueuePlayer(store);
      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const currentItem = await player.play();

      expect(currentItem).not.toBeNull();
      expect(currentItem?.id).toBe(addedItem.id);

      const state = player.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.currentItem?.id).toBe(addedItem.id);
      expect(state.currentIndex).toBe(0);
    });

    it('should update item status to reading', async () => {
      const player = new QueuePlayer(store);
      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();

      const item = await store.getItem(addedItem.id);
      expect(item?.status).toBe('reading');
    });

    it('should start from specific item when startFromId is provided', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });
      await store.add({
        url: 'https://example.com/article-3',
        title: 'Article 3',
      });

      const currentItem = await player.play(item2.id);

      expect(currentItem?.id).toBe(item2.id);
      const state = player.getState();
      expect(state.currentIndex).toBe(1);
      expect(state.hasPrevious).toBe(true);
      expect(state.hasNext).toBe(true);
    });

    it('should skip completed and archived items', async () => {
      const player = new QueuePlayer(store);
      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });
      const item3 = await store.add({
        url: 'https://example.com/article-3',
        title: 'Article 3',
      });

      await store.updateStatus(item1.id, 'completed');
      await store.updateStatus(item2.id, 'archived');

      const currentItem = await player.play();

      expect(currentItem?.id).toBe(item3.id);
    });

    it('should call onItemStart callback', async () => {
      const onItemStart = jest.fn();
      const player = new QueuePlayer(store, { onItemStart });

      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();

      expect(onItemStart).toHaveBeenCalledWith(
        expect.objectContaining({ id: addedItem.id })
      );
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = jest.fn();
      const player = new QueuePlayer(store, { onStateChange });

      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();

      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
          currentIndex: 0,
        })
      );
    });
  });

  describe('playNext', () => {
    it('should return null when not playing', async () => {
      const player = new QueuePlayer(store);
      const result = await player.playNext();
      expect(result.item).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('should move to next item', async () => {
      const player = new QueuePlayer(store);
      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await player.play();
      const result = await player.playNext();

      expect(result.item?.id).toBe(item2.id);
      expect(result.hasMore).toBe(false);

      // Check previous item was marked completed
      const prevItem = await store.getItem(item1.id);
      expect(prevItem?.status).toBe('completed');
      expect(prevItem?.progress).toBe(100);
    });

    it('should call onQueueComplete when no more items', async () => {
      const onQueueComplete = jest.fn();
      const player = new QueuePlayer(store, { onQueueComplete });

      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.playNext();

      expect(onQueueComplete).toHaveBeenCalled();

      const state = player.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentItem).toBeNull();
    });

    it('should call onItemComplete callback', async () => {
      const onItemComplete = jest.fn();
      const player = new QueuePlayer(store, { onItemComplete });

      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.playNext();

      expect(onItemComplete).toHaveBeenCalledWith(
        expect.objectContaining({ id: addedItem.id })
      );
    });
  });

  describe('playPrevious', () => {
    it('should return null when not playing', async () => {
      const player = new QueuePlayer(store);
      const item = await player.playPrevious();
      expect(item).toBeNull();
    });

    it('should return null when at first item', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      const item = await player.playPrevious();

      expect(item).toBeNull();
    });

    it('should move to previous item', async () => {
      const player = new QueuePlayer(store);
      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await player.play(item2.id);
      const prevItem = await player.playPrevious();

      expect(prevItem?.id).toBe(item1.id);

      const state = player.getState();
      expect(state.currentIndex).toBe(0);
      expect(state.hasPrevious).toBe(false);
    });

    it('should reset previous item status to reading', async () => {
      const player = new QueuePlayer(store);
      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await player.play();
      await player.playNext();
      await player.playPrevious();

      const item = await store.getItem(item1.id);
      expect(item?.status).toBe('reading');
    });
  });

  describe('stop', () => {
    it('should stop playback and reset state', async () => {
      const player = new QueuePlayer(store);
      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.stop();

      const state = player.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentItem).toBeNull();
      expect(state.currentIndex).toBe(-1);

      // Item should be reset to pending
      const item = await store.getItem(addedItem.id);
      expect(item?.status).toBe('pending');
    });
  });

  describe('pause and resume', () => {
    it('should pause playback', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      player.pause();

      const state = player.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentItem).not.toBeNull(); // Item still tracked
    });

    it('should resume playback', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      player.pause();
      player.resume();

      const state = player.getState();
      expect(state.isPlaying).toBe(true);
    });

    it('should not resume if no current item', () => {
      const player = new QueuePlayer(store);
      player.resume();

      const state = player.getState();
      expect(state.isPlaying).toBe(false);
    });
  });

  describe('setAutoPlayNext', () => {
    it('should set autoPlayNext setting', async () => {
      const onQueueComplete = jest.fn();
      const player = new QueuePlayer(store, { onQueueComplete });
      player.setAutoPlayNext(false);

      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.onCurrentItemComplete();

      // Should not auto-advance, just pause
      expect(onQueueComplete).not.toHaveBeenCalled();

      const state = player.getState();
      expect(state.isPlaying).toBe(false);
    });
  });

  describe('onCurrentItemComplete', () => {
    it('should auto-advance when autoPlayNext is true', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await player.play();
      await player.onCurrentItemComplete();

      const state = player.getState();
      expect(state.currentItem?.id).toBe(item2.id);
    });

    it('should pause when autoPlayNext is false', async () => {
      const onItemComplete = jest.fn();
      const player = new QueuePlayer(store, { onItemComplete });
      player.setAutoPlayNext(false);

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.onCurrentItemComplete();

      expect(onItemComplete).toHaveBeenCalled();

      // Check item was marked completed
      const updatedItem = await store.getItem(item.id);
      expect(updatedItem?.status).toBe('completed');
      expect(updatedItem?.progress).toBe(100);
    });
  });

  describe('updateCurrentProgress', () => {
    it('should update progress of current item', async () => {
      const player = new QueuePlayer(store);
      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await player.play();
      await player.updateCurrentProgress(50, 5);

      const item = await store.getItem(addedItem.id);
      expect(item?.progress).toBe(50);
      expect(item?.lastParagraphIndex).toBe(5);
    });

    it('should do nothing when no current item', async () => {
      const player = new QueuePlayer(store);

      // Should not throw
      await player.updateCurrentProgress(50);
    });
  });

  describe('hasNext and hasPrevious', () => {
    it('should correctly track navigation availability', async () => {
      const player = new QueuePlayer(store);
      await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });
      await store.add({
        url: 'https://example.com/article-3',
        title: 'Article 3',
      });

      await player.play();
      let state = player.getState();
      expect(state.hasPrevious).toBe(false);
      expect(state.hasNext).toBe(true);

      await player.playNext();
      state = player.getState();
      expect(state.hasPrevious).toBe(true);
      expect(state.hasNext).toBe(true);

      await player.playNext();
      state = player.getState();
      expect(state.hasPrevious).toBe(true);
      expect(state.hasNext).toBe(false);
    });
  });
});
