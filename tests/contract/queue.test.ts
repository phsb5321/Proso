/**
 * Queue Message Contract Tests
 * Tests for queue message handlers (T059)
 *
 * @module tests/contract/queue
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock browser API before importing modules
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

const mockTabsQuery = jest.fn(async () => []);
const mockTabsSendMessage = jest.fn(async () => {});

(globalThis as any).browser = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  tabs: {
    query: mockTabsQuery,
    sendMessage: mockTabsSendMessage,
  },
};

import {
  handleQueueAdd,
  handleQueueRemove,
  handleQueueReorder,
  handleQueueUpdateStatus,
  handleQueueUpdateProgress,
  handleQueueClear,
  handleQueueGetState,
  handleQueueGetItem,
  handleQueuePlay,
  handleQueuePlayNext,
  handleQueuePlayPrevious,
} from '../../utils/messaging/handlers/queue';

describe('Queue Message Contracts', () => {
  beforeEach(() => {
    // Clear storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
  });

  describe('queue.add', () => {
    it('should return success with id and position on valid request', async () => {
      const response = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      expect(response).toMatchObject({
        success: true,
        id: expect.any(String),
        position: 0,
      });
      expect(response.error).toBeUndefined();
    });

    it('should include optional fields in stored item', async () => {
      const response = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
        excerpt: 'This is an excerpt',
        author: 'John Doe',
        language: 'en',
        estimatedReadTime: 5,
      });

      expect(response.success).toBe(true);

      // Verify item was stored correctly
      const stateResponse = await handleQueueGetState(undefined as void);
      const item = stateResponse.items[0];
      expect(item.excerpt).toBe('This is an excerpt');
      expect(item.author).toBe('John Doe');
      expect(item.language).toBe('en');
      expect(item.estimatedReadTime).toBe(5);
    });

    it('should return error for duplicate URL', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Duplicate Article',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Article already in queue');
    });
  });

  describe('queue.remove', () => {
    it('should return success on valid removal', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueueRemove({ id: addResponse.id });

      expect(response).toEqual({ success: true });
    });

    it('should return error for non-existent item', async () => {
      const response = await handleQueueRemove({ id: 'nonexistent-id' });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Item not found in queue');
    });
  });

  describe('queue.reorder', () => {
    it('should return success with updated items', async () => {
      const item1 = await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });
      await handleQueueAdd({
        url: 'https://example.com/article-3',
        title: 'Article 3',
      });

      const response = await handleQueueReorder({
        id: item1.id,
        newPosition: 2,
      });

      expect(response.success).toBe(true);
      expect(response.items).toHaveLength(3);
      expect(response.items.map((i) => i.position)).toEqual([0, 1, 2]);
    });

    it('should return error for non-existent item', async () => {
      const response = await handleQueueReorder({
        id: 'nonexistent-id',
        newPosition: 0,
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Item not found in queue');
    });
  });

  describe('queue.updateStatus', () => {
    it('should return success on valid status update', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueueUpdateStatus({
        id: addResponse.id,
        status: 'reading',
      });

      expect(response).toEqual({ success: true });

      // Verify status was updated
      const itemResponse = await handleQueueGetItem({ id: addResponse.id });
      expect(itemResponse.item?.status).toBe('reading');
    });

    it('should accept all valid status values', async () => {
      const statuses = ['pending', 'reading', 'completed', 'archived'] as const;

      for (const status of statuses) {
        // Clear and add new item
        await handleQueueClear({ filter: 'all' });
        const addResponse = await handleQueueAdd({
          url: `https://example.com/article-${status}`,
          title: `Article ${status}`,
        });

        const response = await handleQueueUpdateStatus({
          id: addResponse.id,
          status,
        });

        expect(response.success).toBe(true);
      }
    });

    it('should return error for non-existent item', async () => {
      const response = await handleQueueUpdateStatus({
        id: 'nonexistent-id',
        status: 'reading',
      });

      expect(response.success).toBe(false);
    });
  });

  describe('queue.updateProgress', () => {
    it('should return success on valid progress update', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueueUpdateProgress({
        id: addResponse.id,
        progress: 50,
      });

      expect(response).toEqual({ success: true });

      // Verify progress was updated
      const itemResponse = await handleQueueGetItem({ id: addResponse.id });
      expect(itemResponse.item?.progress).toBe(50);
    });

    it('should update lastParagraphIndex when provided', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await handleQueueUpdateProgress({
        id: addResponse.id,
        progress: 50,
        lastParagraphIndex: 10,
      });

      const itemResponse = await handleQueueGetItem({ id: addResponse.id });
      expect(itemResponse.item?.lastParagraphIndex).toBe(10);
    });

    it('should return error for non-existent item', async () => {
      const response = await handleQueueUpdateProgress({
        id: 'nonexistent-id',
        progress: 50,
      });

      expect(response.success).toBe(false);
    });
  });

  describe('queue.clear', () => {
    it('should clear all items when filter is "all"', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      const response = await handleQueueClear({ filter: 'all' });

      expect(response.success).toBe(true);
      expect(response.removedCount).toBe(2);

      const stateResponse = await handleQueueGetState(undefined as void);
      expect(stateResponse.items).toHaveLength(0);
    });

    it('should clear only completed items when filter is "completed"', async () => {
      const item1 = await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await handleQueueUpdateStatus({ id: item1.id, status: 'completed' });

      const response = await handleQueueClear({ filter: 'completed' });

      expect(response.success).toBe(true);
      expect(response.removedCount).toBe(1);

      const stateResponse = await handleQueueGetState(undefined as void);
      expect(stateResponse.items).toHaveLength(1);
    });

    it('should clear only archived items when filter is "archived"', async () => {
      const item1 = await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await handleQueueUpdateStatus({ id: item1.id, status: 'archived' });

      const response = await handleQueueClear({ filter: 'archived' });

      expect(response.success).toBe(true);
      expect(response.removedCount).toBe(1);
    });
  });

  describe('queue.getState', () => {
    it('should return empty state for new queue', async () => {
      const response = await handleQueueGetState(undefined as void);

      expect(response.metadata).toMatchObject({
        version: 1,
        count: 0,
      });
      expect(response.items).toEqual([]);
    });

    it('should return all items with correct shape', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
        excerpt: 'Excerpt',
      });

      const response = await handleQueueGetState(undefined as void);

      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toMatchObject({
        id: expect.any(String),
        url: 'https://example.com/article',
        title: 'Test Article',
        domain: 'example.com',
        excerpt: 'Excerpt',
        addedAt: expect.any(Number),
        position: 0,
        status: 'pending',
        progress: 0,
      });
      expect(response.metadata.count).toBe(1);
    });
  });

  describe('queue.getItem', () => {
    it('should return item when found', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueueGetItem({ id: addResponse.id });

      expect(response.success).toBe(true);
      expect(response.item).toMatchObject({
        id: addResponse.id,
        url: 'https://example.com/article',
        title: 'Test Article',
      });
    });

    it('should return error when item not found', async () => {
      const response = await handleQueueGetItem({ id: 'nonexistent-id' });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Item not found');
    });
  });

  describe('queue.play', () => {
    it('should return error when queue is empty', async () => {
      const response = await handleQueuePlay({});

      expect(response.success).toBe(false);
      expect(response.error).toBe('No items to play');
    });

    it('should return success with current item when queue has items', async () => {
      const addResponse = await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      const response = await handleQueuePlay({});

      expect(response.success).toBe(true);
      expect(response.currentItem).toMatchObject({
        id: addResponse.id,
        url: 'https://example.com/article',
        title: 'Test Article',
      });
    });

    it('should start from specific item when startFromId is provided', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      const response = await handleQueuePlay({ startFromId: item2.id });

      expect(response.success).toBe(true);
      expect(response.currentItem?.id).toBe(item2.id);
    });
  });

  describe('queue.playNext', () => {
    it('should return success with next item', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await handleQueuePlay({});
      const response = await handleQueuePlayNext(undefined as void);

      expect(response.success).toBe(true);
      expect(response.currentItem?.id).toBe(item2.id);
    });

    it('should return hasMore false when at last item', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await handleQueuePlay({});
      const response = await handleQueuePlayNext(undefined as void);

      expect(response.hasMore).toBe(false);
    });
  });

  describe('queue.playPrevious', () => {
    it('should return success with previous item', async () => {
      const item1 = await handleQueueAdd({
        url: 'https://example.com/article-1',
        title: 'Article 1',
      });
      const item2 = await handleQueueAdd({
        url: 'https://example.com/article-2',
        title: 'Article 2',
      });

      await handleQueuePlay({ startFromId: item2.id });
      const response = await handleQueuePlayPrevious(undefined as void);

      expect(response.success).toBe(true);
      expect(response.currentItem?.id).toBe(item1.id);
    });

    it('should return null when at first item', async () => {
      await handleQueueAdd({
        url: 'https://example.com/article',
        title: 'Test Article',
      });

      await handleQueuePlay({});
      const response = await handleQueuePlayPrevious(undefined as void);

      expect(response.success).toBe(true);
      expect(response.currentItem).toBeUndefined();
    });
  });
});
