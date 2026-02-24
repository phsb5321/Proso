// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Queue Store for Proso
 * Manages reading queue persistence in browser.storage.local
 *
 * @module utils/queue/store
 */

import {
  type QueueItem,
  type QueueMetadata,
  type QueueState,
  type AddItemRequest,
  type QueueItemStatus,
  type QueueUpdateEvent,
  queueItemSchema,
  queueMetadataSchema,
  QUEUE_STORAGE_KEYS,
} from './types';
import { queueDefaults } from '../config/defaults';

/**
 * Queue Store class
 * Handles CRUD operations for the reading queue
 */
export class QueueStore {
  private maxQueueSize: number;
  private listeners: Set<(event: QueueUpdateEvent) => void> = new Set();

  constructor(maxQueueSize?: number) {
    this.maxQueueSize = maxQueueSize ?? queueDefaults.maxQueueSize;
  }

  /**
   * Add an article to the queue
   * @param request - Article data to add
   * @returns Promise resolving to the added item
   */
  async add(request: AddItemRequest): Promise<QueueItem> {
    const state = await this.getState();

    // Check if URL already exists
    const existingItem = state.items.find((item) => item.url === request.url);
    if (existingItem) {
      throw new Error('Article already in queue');
    }

    // Check queue size limit
    if (state.items.length >= this.maxQueueSize) {
      // Evict oldest completed/archived items first
      await this.evictOldest();
    }

    // Generate ID from URL hash
    const id = this.hashUrl(request.url);

    // Create new item
    const newItem: QueueItem = {
      id,
      url: request.url,
      title: request.title.slice(0, 100),
      domain: this.extractDomain(request.url),
      excerpt: request.excerpt?.slice(0, 200),
      author: request.author?.slice(0, 50),
      faviconUrl: request.faviconUrl,
      language: request.language,
      estimatedReadTime: request.estimatedReadTime,
      addedAt: Date.now(),
      position: state.items.length,
      status: 'pending',
      progress: 0,
    };

    // Validate
    queueItemSchema.parse(newItem);

    // Add to state
    state.items.push(newItem);
    await this.saveState(state);

    // Notify listeners
    this.notifyListeners({
      action: 'add',
      affectedIds: [id],
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });

    return newItem;
  }

  /**
   * Remove an article from the queue
   * @param id - Queue item ID
   */
  async remove(id: string): Promise<void> {
    const state = await this.getState();
    const index = state.items.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new Error('Item not found in queue');
    }

    state.items.splice(index, 1);

    // Recompute positions
    state.items.forEach((item, i) => {
      item.position = i;
    });

    await this.saveState(state);

    this.notifyListeners({
      action: 'remove',
      affectedIds: [id],
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });
  }

  /**
   * Reorder an item to a new position
   * @param id - Queue item ID
   * @param newPosition - New position index
   */
  async reorder(id: string, newPosition: number): Promise<QueueItem[]> {
    const state = await this.getState();
    const currentIndex = state.items.findIndex((item) => item.id === id);

    if (currentIndex === -1) {
      throw new Error('Item not found in queue');
    }

    // Clamp new position
    const targetPosition = Math.max(0, Math.min(state.items.length - 1, newPosition));

    // Remove from current position
    const [item] = state.items.splice(currentIndex, 1);

    // Insert at new position
    state.items.splice(targetPosition, 0, item);

    // Recompute all positions
    state.items.forEach((item, i) => {
      item.position = i;
    });

    await this.saveState(state);

    this.notifyListeners({
      action: 'reorder',
      affectedIds: [id],
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });

    return state.items;
  }

  /**
   * Update item status
   * @param id - Queue item ID
   * @param status - New status
   */
  async updateStatus(id: string, status: QueueItemStatus): Promise<void> {
    const state = await this.getState();
    const item = state.items.find((item) => item.id === id);

    if (!item) {
      throw new Error('Item not found in queue');
    }

    item.status = status;
    await this.saveState(state);

    this.notifyListeners({
      action: 'updateStatus',
      affectedIds: [id],
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });
  }

  /**
   * Update item reading progress
   * @param id - Queue item ID
   * @param progress - Progress percentage (0-100)
   * @param lastParagraphIndex - Optional last paragraph index
   */
  async updateProgress(id: string, progress: number, lastParagraphIndex?: number): Promise<void> {
    const state = await this.getState();
    const item = state.items.find((item) => item.id === id);

    if (!item) {
      throw new Error('Item not found in queue');
    }

    item.progress = Math.max(0, Math.min(100, progress));
    if (lastParagraphIndex !== undefined) {
      item.lastParagraphIndex = lastParagraphIndex;
    }

    await this.saveState(state);

    this.notifyListeners({
      action: 'updateProgress',
      affectedIds: [id],
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });
  }

  /**
   * Clear queue items by filter
   * @param filter - Filter for items to clear ('all', 'completed', 'archived')
   * @returns Number of items removed
   */
  async clear(filter?: 'all' | 'completed' | 'archived'): Promise<number> {
    const state = await this.getState();
    const originalCount = state.items.length;
    let removedIds: string[] = [];

    if (!filter || filter === 'all') {
      removedIds = state.items.map((item) => item.id);
      state.items = [];
    } else {
      const itemsToRemove = state.items.filter((item) => item.status === filter);
      removedIds = itemsToRemove.map((item) => item.id);
      state.items = state.items.filter((item) => item.status !== filter);
    }

    // Recompute positions
    state.items.forEach((item, i) => {
      item.position = i;
    });

    await this.saveState(state);

    const removedCount = originalCount - state.items.length;

    this.notifyListeners({
      action: 'clear',
      affectedIds: removedIds,
      metadata: {
        count: state.items.length,
        lastModified: state.metadata.lastModified,
      },
    });

    return removedCount;
  }

  /**
   * Get full queue state
   */
  async getState(): Promise<QueueState> {
    const result = await browser.storage.local.get([
      QUEUE_STORAGE_KEYS.METADATA,
      QUEUE_STORAGE_KEYS.ITEMS,
    ]);

    const metadata = result[QUEUE_STORAGE_KEYS.METADATA] as QueueMetadata | undefined;
    const items = (result[QUEUE_STORAGE_KEYS.ITEMS] as QueueItem[] | undefined) ?? [];

    return {
      metadata: metadata ?? {
        version: 1,
        count: items.length,
        lastModified: Date.now(),
        totalSize: 0,
      },
      items,
    };
  }

  /**
   * Get a single item by ID
   */
  async getItem(id: string): Promise<QueueItem | null> {
    const state = await this.getState();
    return state.items.find((item) => item.id === id) ?? null;
  }

  /**
   * Get next pending item in queue
   */
  async getNextPending(): Promise<QueueItem | null> {
    const state = await this.getState();
    return (
      state.items
        .filter((item) => item.status === 'pending' || item.status === 'reading')
        .sort((a, b) => a.position - b.position)[0] ?? null
    );
  }

  /**
   * Save state to storage
   */
  private async saveState(state: QueueState): Promise<void> {
    // Update metadata
    state.metadata.count = state.items.length;
    state.metadata.lastModified = Date.now();
    state.metadata.totalSize = new Blob([JSON.stringify(state.items)]).size;

    // Validate metadata
    queueMetadataSchema.parse(state.metadata);

    await browser.storage.local.set({
      [QUEUE_STORAGE_KEYS.METADATA]: state.metadata,
      [QUEUE_STORAGE_KEYS.ITEMS]: state.items,
    });
  }

  /**
   * Evict oldest completed/archived items to make room
   */
  private async evictOldest(): Promise<void> {
    const state = await this.getState();

    // Sort by status priority (archived first, then completed) and addedAt
    const evictionCandidates = state.items
      .filter((item) => item.status === 'archived' || item.status === 'completed')
      .sort((a, b) => {
        if (a.status === 'archived' && b.status !== 'archived') return -1;
        if (b.status === 'archived' && a.status !== 'archived') return 1;
        return a.addedAt - b.addedAt;
      });

    if (evictionCandidates.length > 0) {
      await this.remove(evictionCandidates[0].id);
    }
  }

  /**
   * Generate ID from URL hash
   */
  private hashUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).padStart(8, '0');
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Add update listener
   */
  addListener(callback: (event: QueueUpdateEvent) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Remove update listener
   */
  removeListener(callback: (event: QueueUpdateEvent) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of an update
   */
  private notifyListeners(event: QueueUpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Queue listener error:', error);
      }
    }
  }
}

/**
 * Create a new QueueStore instance
 */
export function createQueueStore(maxQueueSize?: number): QueueStore {
  return new QueueStore(maxQueueSize);
}
