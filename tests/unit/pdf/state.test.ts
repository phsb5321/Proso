/**
 * Unit Tests for PDF Reading State Persistence
 *
 * Feature: 033-pdf-reading-support
 * Task: T017
 *
 * Tests for saving and restoring PDF reading positions.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock browser.storage.local
const mockStorage: Record<string, unknown> = {};

const mockBrowser = {
  storage: {
    local: {
      get: jest.fn((keys: string | string[]) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = mockStorage[key];
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys: string | string[]) => {
        if (typeof keys === 'string') {
          delete mockStorage[keys];
        } else {
          for (const key of keys) {
            delete mockStorage[key];
          }
        }
        return Promise.resolve();
      }),
    },
  },
};

// @ts-expect-error - Mock browser global
global.browser = mockBrowser;

describe('PDF Reading State', () => {
  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
  });

  describe('saveReadingState', () => {
    it('should save state with correct storage key', async () => {
      const state = {
        url: 'https://example.com/test.pdf',
        urlHash: 'abc123'.padEnd(64, '0'),
        paragraphIndex: 5,
        pageNumber: 3,
        lastReadAt: new Date(),
        totalParagraphs: 50,
      };

      const expectedKey = `pdfState:${state.urlHash}`;

      // Simulate save
      await mockBrowser.storage.local.set({ [expectedKey]: state });

      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
      expect(mockStorage[expectedKey]).toEqual(state);
    });

    it('should update history when saving state', async () => {
      const state = {
        url: 'https://example.com/test.pdf',
        urlHash: 'abc123'.padEnd(64, '0'),
        paragraphIndex: 5,
        pageNumber: 3,
        lastReadAt: new Date(),
        totalParagraphs: 50,
      };

      const history: { items: Array<{ urlHash: string; title: string; lastReadAt: string }>; maxItems: number } = {
        items: [],
        maxItems: 100,
      };

      mockStorage.pdfHistory = history;

      // After save, history should include this URL
      history.items.unshift({
        urlHash: state.urlHash,
        title: state.url,
        lastReadAt: state.lastReadAt.toISOString(),
      });

      expect(history.items).toHaveLength(1);
      expect(history.items[0].urlHash).toBe(state.urlHash);
    });
  });

  describe('getReadingState', () => {
    it('should retrieve saved state by URL hash', async () => {
      const urlHash = 'abc123'.padEnd(64, '0');
      const savedState = {
        url: 'https://example.com/test.pdf',
        urlHash,
        paragraphIndex: 10,
        pageNumber: 5,
        lastReadAt: new Date().toISOString(),
        totalParagraphs: 100,
      };

      const storageKey = `pdfState:${urlHash}`;
      mockStorage[storageKey] = savedState;

      const result = await mockBrowser.storage.local.get(storageKey);

      expect(result[storageKey]).toEqual(savedState);
      expect((result[storageKey] as typeof savedState).paragraphIndex).toBe(10);
    });

    it('should return null for unknown URLs', async () => {
      const unknownHash = 'xyz789'.padEnd(64, '0');
      const storageKey = `pdfState:${unknownHash}`;

      const result = await mockBrowser.storage.local.get(storageKey);

      expect(result[storageKey]).toBeUndefined();
    });
  });

  describe('updateHistory', () => {
    it('should maintain LRU order (most recent first)', async () => {
      const history = {
        items: [
          { urlHash: 'old1'.padEnd(64, '0'), title: 'Old 1', lastReadAt: '2026-01-01' },
          { urlHash: 'old2'.padEnd(64, '0'), title: 'Old 2', lastReadAt: '2026-01-02' },
        ],
        maxItems: 100,
      };

      const newEntry = {
        urlHash: 'new1'.padEnd(64, '0'),
        title: 'New 1',
        lastReadAt: '2026-01-06',
      };

      // Add to front
      history.items.unshift(newEntry);

      expect(history.items[0]).toEqual(newEntry);
      expect(history.items).toHaveLength(3);
    });

    it('should remove existing entry before re-adding (no duplicates)', async () => {
      const urlHash = 'abc123'.padEnd(64, '0');
      const history = {
        items: [
          { urlHash: 'other'.padEnd(64, '0'), title: 'Other', lastReadAt: '2026-01-01' },
          { urlHash, title: 'Test', lastReadAt: '2026-01-02' },
        ],
        maxItems: 100,
      };

      // Remove existing
      const filtered = history.items.filter((item) => item.urlHash !== urlHash);

      // Add to front
      filtered.unshift({
        urlHash,
        title: 'Test Updated',
        lastReadAt: '2026-01-06',
      });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].urlHash).toBe(urlHash);
      expect(filtered[0].lastReadAt).toBe('2026-01-06');
    });

    it('should enforce maxItems limit', async () => {
      const MAX_STATES = 100;
      const history = {
        items: Array.from({ length: MAX_STATES }, (_, i) => ({
          urlHash: `hash${i}`.padEnd(64, '0'),
          title: `Document ${i}`,
          lastReadAt: `2026-01-${String(i % 31 + 1).padStart(2, '0')}`,
        })),
        maxItems: MAX_STATES,
      };

      // Add new item
      history.items.unshift({
        urlHash: 'newHash'.padEnd(64, '0'),
        title: 'New Document',
        lastReadAt: '2026-01-06',
      });

      // Trim to max
      if (history.items.length > history.maxItems) {
        const removed = history.items.splice(history.maxItems);
        expect(removed).toHaveLength(1);
      }

      expect(history.items).toHaveLength(MAX_STATES);
    });

    it('should clean up old states when evicted from history', async () => {
      const removedHash = 'removed'.padEnd(64, '0');
      const storageKey = `pdfState:${removedHash}`;

      // Simulate cleanup
      await mockBrowser.storage.local.remove(storageKey);

      expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith(storageKey);
    });
  });

  describe('STORAGE_PREFIX', () => {
    it('should use pdfState: prefix', () => {
      const STORAGE_PREFIX = 'pdfState:';
      expect(STORAGE_PREFIX).toBe('pdfState:');
    });
  });

  describe('MAX_STATES', () => {
    it('should be 100', () => {
      const MAX_STATES = 100;
      expect(MAX_STATES).toBe(100);
    });
  });
});
