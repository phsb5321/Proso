/**
 * Queue Store Unit Tests
 * Tests for QueueStore class (T057)
 *
 * @module tests/unit/queue-store
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

import { QueueStore, createQueueStore } from '../../utils/queue/store';
import type { QueueItem, QueueUpdateEvent } from '../../utils/queue/types';

describe('QueueStore', () => {
  beforeEach(() => {
    // Clear storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create instance with QueueStore class', () => {
      const store = new QueueStore();
      expect(store).toBeInstanceOf(QueueStore);
    });

    it('should create instance with createQueueStore factory', () => {
      const store = createQueueStore();
      expect(store).toBeInstanceOf(QueueStore);
    });

    it('should accept custom maxQueueSize', () => {
      const store = new QueueStore(100);
      expect(store).toBeInstanceOf(QueueStore);
    });
  });

  describe('add', () => {
    it('should add an item to empty queue', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      expect(item).toMatchObject({
        url: 'https://example.com/article',
        title: 'Test Article',
        status: 'pending',
        progress: 0,
        position: 0,
      });
      expect(item.id).toBeTruthy();
      expect(item.addedAt).toBeGreaterThan(0);
      expect(item.domain).toBe('example.com');
    });

    it('should generate unique ID from URL hash', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      expect(item1.id).not.toBe(item2.id);
      expect(item1.id.length).toBeGreaterThanOrEqual(8);
    });

    it('should truncate long titles', async () => {
      const store = new QueueStore();
      const longTitle = 'A'.repeat(150);

      const item = await store.add({
        url: 'https://example.com/article',
        title: longTitle,
      });

      expect(item.title.length).toBe(100);
    });

    it('should include optional fields', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
        excerpt: 'This is a test excerpt',
        author: 'Test Author',
        language: 'en',
        estimatedReadTime: 5,
      });

      expect(item.excerpt).toBe('This is a test excerpt');
      expect(item.author).toBe('Test Author');
      expect(item.language).toBe('en');
      expect(item.estimatedReadTime).toBe(5);
    });

    it('should reject duplicate URLs', async () => {
      const store = new QueueStore();

      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await expect(
        store.add({
          url: 'https://example.com/article',
          title: 'Duplicate Article',
        })
      ).rejects.toThrow('Article already in queue');
    });

    it('should assign correct position for multiple items', async () => {
      const store = new QueueStore();

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

      expect(item1.position).toBe(0);
      expect(item2.position).toBe(1);
      expect(item3.position).toBe(2);
    });

    it('should notify listeners on add', async () => {
      const store = new QueueStore();
      const listener = jest.fn();
      store.addListener(listener);

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      expect(listener).toHaveBeenCalledWith({
        action: 'add',
        affectedIds: [item.id],
        metadata: expect.objectContaining({
          count: 1,
          lastModified: expect.any(Number),
        }),
      });
    });
  });

  describe('remove', () => {
    it('should remove an item from the queue', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await store.remove(item.id);

      const state = await store.getState();
      expect(state.items).toHaveLength(0);
    });

    it('should throw error for non-existent item', async () => {
      const store = new QueueStore();

      await expect(store.remove('nonexistent-id')).rejects.toThrow(
        'Item not found in queue'
      );
    });

    it('should recompute positions after removal', async () => {
      const store = new QueueStore();

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

      await store.remove(item2.id);

      const state = await store.getState();
      expect(state.items[0].position).toBe(0);
      expect(state.items[1].position).toBe(1);
      expect(state.items[0].id).toBe(item1.id);
      expect(state.items[1].id).toBe(item3.id);
    });

    it('should notify listeners on remove', async () => {
      const store = new QueueStore();
      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const listener = jest.fn();
      store.addListener(listener);

      await store.remove(item.id);

      expect(listener).toHaveBeenCalledWith({
        action: 'remove',
        affectedIds: [item.id],
        metadata: expect.objectContaining({
          count: 0,
          lastModified: expect.any(Number),
        }),
      });
    });
  });

  describe('reorder', () => {
    it('should move item to new position', async () => {
      const store = new QueueStore();

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

      await store.reorder(item3.id, 0);

      const state = await store.getState();
      expect(state.items[0].id).toBe(item3.id);
      expect(state.items[1].id).toBe(item1.id);
      expect(state.items[2].id).toBe(item2.id);
    });

    it('should clamp position to valid range', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await store.reorder(item1.id, 100);

      const state = await store.getState();
      expect(state.items[0].id).toBe(item2.id);
      expect(state.items[1].id).toBe(item1.id);
    });

    it('should throw error for non-existent item', async () => {
      const store = new QueueStore();

      await expect(store.reorder('nonexistent-id', 0)).rejects.toThrow(
        'Item not found in queue'
      );
    });

    it('should update all positions after reorder', async () => {
      const store = new QueueStore();

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

      const reorderedItems = await store.reorder(item3.id, 1);

      expect(reorderedItems[0].position).toBe(0);
      expect(reorderedItems[1].position).toBe(1);
      expect(reorderedItems[2].position).toBe(2);
    });
  });

  describe('updateStatus', () => {
    it('should update item status', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await store.updateStatus(item.id, 'reading');

      const updatedItem = await store.getItem(item.id);
      expect(updatedItem?.status).toBe('reading');
    });

    it('should throw error for non-existent item', async () => {
      const store = new QueueStore();

      await expect(store.updateStatus('nonexistent-id', 'reading')).rejects.toThrow(
        'Item not found in queue'
      );
    });

    it('should notify listeners on status update', async () => {
      const store = new QueueStore();
      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const listener = jest.fn();
      store.addListener(listener);

      await store.updateStatus(item.id, 'completed');

      expect(listener).toHaveBeenCalledWith({
        action: 'updateStatus',
        affectedIds: [item.id],
        metadata: expect.objectContaining({
          count: 1,
          lastModified: expect.any(Number),
        }),
      });
    });
  });

  describe('updateProgress', () => {
    it('should update item progress', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await store.updateProgress(item.id, 50);

      const updatedItem = await store.getItem(item.id);
      expect(updatedItem?.progress).toBe(50);
    });

    it('should clamp progress to 0-100 range', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await store.updateProgress(item.id, 150);
      let updatedItem = await store.getItem(item.id);
      expect(updatedItem?.progress).toBe(100);

      await store.updateProgress(item.id, -10);
      updatedItem = await store.getItem(item.id);
      expect(updatedItem?.progress).toBe(0);
    });

    it('should update lastParagraphIndex when provided', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await store.updateProgress(item.id, 50, 5);

      const updatedItem = await store.getItem(item.id);
      expect(updatedItem?.lastParagraphIndex).toBe(5);
    });

    it('should throw error for non-existent item', async () => {
      const store = new QueueStore();

      await expect(store.updateProgress('nonexistent-id', 50)).rejects.toThrow(
        'Item not found in queue'
      );
    });
  });

  describe('clear', () => {
    it('should clear all items when filter is "all"', async () => {
      const store = new QueueStore();

      await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      const removedCount = await store.clear('all');

      expect(removedCount).toBe(2);
      const state = await store.getState();
      expect(state.items).toHaveLength(0);
    });

    it('should clear only completed items when filter is "completed"', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await store.updateStatus(item1.id, 'completed');

      const removedCount = await store.clear('completed');

      expect(removedCount).toBe(1);
      const state = await store.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe(item2.id);
    });

    it('should clear only archived items when filter is "archived"', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await store.updateStatus(item2.id, 'archived');

      const removedCount = await store.clear('archived');

      expect(removedCount).toBe(1);
      const state = await store.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe(item1.id);
    });

    it('should recompute positions after clear', async () => {
      const store = new QueueStore();

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

      await store.updateStatus(item2.id, 'completed');
      await store.clear('completed');

      const state = await store.getState();
      expect(state.items[0].position).toBe(0);
      expect(state.items[1].position).toBe(1);
    });
  });

  describe('getState', () => {
    it('should return empty state for new store', async () => {
      const store = new QueueStore();

      const state = await store.getState();

      expect(state.items).toHaveLength(0);
      expect(state.metadata.count).toBe(0);
    });

    it('should return all items and metadata', async () => {
      const store = new QueueStore();

      await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      const state = await store.getState();

      expect(state.items).toHaveLength(2);
      expect(state.metadata.count).toBe(2);
      expect(state.metadata.version).toBe(1);
    });
  });

  describe('getItem', () => {
    it('should return item by ID', async () => {
      const store = new QueueStore();

      const addedItem = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const item = await store.getItem(addedItem.id);

      expect(item).toMatchObject({
        id: addedItem.id,
        url: 'https://example.com/article',
        title: 'Test Article',
      });
    });

    it('should return null for non-existent ID', async () => {
      const store = new QueueStore();

      const item = await store.getItem('nonexistent-id');

      expect(item).toBeNull();
    });
  });

  describe('getNextPending', () => {
    it('should return first pending item', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      const nextItem = await store.getNextPending();

      expect(nextItem?.id).toBe(item1.id);
    });

    it('should return reading item before pending if at lower position', async () => {
      const store = new QueueStore();

      const item1 = await store.add({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await store.updateStatus(item1.id, 'reading');

      const nextItem = await store.getNextPending();

      expect(nextItem?.id).toBe(item1.id);
    });

    it('should return null when no pending items', async () => {
      const store = new QueueStore();

      const item = await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });
      await store.updateStatus(item.id, 'completed');

      const nextItem = await store.getNextPending();

      expect(nextItem).toBeNull();
    });
  });

  describe('listeners', () => {
    it('should add and remove listeners', async () => {
      const store = new QueueStore();
      const listener = jest.fn();

      store.addListener(listener);
      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });
      expect(listener).toHaveBeenCalledTimes(1);

      store.removeListener(listener);
      await store.add({
        url: 'https://example.com/article-2',
        title: 'Test Article 2',
      });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle listener errors gracefully', async () => {
      const store = new QueueStore();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      store.addListener(errorListener as (event: QueueUpdateEvent) => void);

      // Should not throw
      await store.add({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest archived items when queue is full', async () => {
      const store = new QueueStore(3);

      const item1 = await store.add({
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

      await store.updateStatus(item1.id, 'archived');

      // This should trigger eviction
      await store.add({
        url: 'https://example.com/article-4',
        title: 'Article 4',
      });

      const state = await store.getState();
      expect(state.items).toHaveLength(3);
      expect(state.items.find((item) => item.id === item1.id)).toBeUndefined();
    });

    it('should evict completed items if no archived items', async () => {
      const store = new QueueStore(3);

      const item1 = await store.add({
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

      await store.updateStatus(item1.id, 'completed');

      // This should trigger eviction
      await store.add({
        url: 'https://example.com/article-4',
        title: 'Article 4',
      });

      const state = await store.getState();
      expect(state.items).toHaveLength(3);
      expect(state.items.find((item) => item.id === item1.id)).toBeUndefined();
    });
  });
});
