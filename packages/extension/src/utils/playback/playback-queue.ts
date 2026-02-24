// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Playback Queue Module
 * Manages ordered queue of paragraphs for TTS playback with prefetch support.
 * Handles queue navigation, current position tracking, and prefetch window management.
 *
 * Feature: 028-smart-audio-cache (User Story 3)
 *
 * @module utils/playback/playback-queue
 */

import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Queue item status enum
 */
export const queueItemStatusSchema = z.enum([
  'pending', // Not yet processed
  'prefetching', // Currently being prefetched
  'ready', // Audio available (cached or prefetched)
  'playing', // Currently playing
  'completed', // Finished playing
  'error', // Failed to load/play
]);
export type QueueItemStatus = z.infer<typeof queueItemStatusSchema>;

/**
 * Queue item representing a single paragraph
 */
export interface QueueItem {
  /** Paragraph index (0-based) */
  index: number;
  /** Paragraph text content */
  text: string;
  /** Character count for cost estimation */
  characterCount: number;
  /** Current status of this item */
  status: QueueItemStatus;
  /** Whether audio is available from persistent cache */
  isCached: boolean;
  /** Whether audio is available in memory prefetch buffer */
  isPrefetched: boolean;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

/**
 * Queue state snapshot for UI updates
 */
export interface QueueState {
  /** Current playing/pending paragraph index (-1 if queue empty) */
  currentIndex: number;
  /** Total paragraphs in queue */
  totalItems: number;
  /** Number of items ready to play (cached + prefetched) */
  readyItems: number;
  /** Number of items currently prefetching */
  prefetchingItems: number;
  /** Number of completed items */
  completedItems: number;
  /** Indices of items in the prefetch window (current + next N) */
  prefetchWindow: number[];
  /** Whether playback is active */
  isPlaying: boolean;
}

/**
 * Options for queue initialization
 */
export interface QueueOptions {
  /** Number of paragraphs to prefetch ahead (default: 3) */
  prefetchAhead?: number;
  /** Start index for playback (default: 0) */
  startIndex?: number;
  /** Array of indices that are already cached */
  cachedIndices?: number[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PREFETCH_AHEAD = 3;

// ============================================================================
// PlaybackQueue Class
// ============================================================================

/**
 * Manages playback queue with prefetch window tracking
 */
export class PlaybackQueue {
  private items: QueueItem[] = [];
  private currentIndex = -1;
  private prefetchAhead: number;
  private isPlaying = false;
  private onStateChange?: (state: QueueState) => void;

  constructor(options: QueueOptions = {}) {
    this.prefetchAhead = options.prefetchAhead ?? DEFAULT_PREFETCH_AHEAD;
  }

  // ============================================================================
  // Queue Initialization
  // ============================================================================

  /**
   * Initialize queue with paragraphs
   *
   * @param paragraphs - Array of paragraph texts
   * @param options - Queue options including cached indices
   */
  initialize(paragraphs: string[], options: QueueOptions = {}): void {
    const { startIndex = 0, cachedIndices = [] } = options;
    const cachedSet = new Set(cachedIndices);

    this.items = paragraphs.map((text, index) => ({
      index,
      text,
      characterCount: text.length,
      status: cachedSet.has(index) ? 'ready' : 'pending',
      isCached: cachedSet.has(index),
      isPrefetched: false,
    }));

    this.currentIndex = Math.min(startIndex, this.items.length - 1);
    if (this.currentIndex >= 0) {
      this.items[this.currentIndex].status = 'pending';
    }

    this.notifyStateChange();
  }

  /**
   * Clear queue and reset state
   */
  clear(): void {
    this.items = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.notifyStateChange();
  }

  // ============================================================================
  // Playback Control
  // ============================================================================

  /**
   * Start or resume playback
   *
   * @param fromIndex - Optional index to start from
   * @returns The item to play, or null if queue is empty
   */
  start(fromIndex?: number): QueueItem | null {
    if (this.items.length === 0) return null;

    if (fromIndex !== undefined && fromIndex >= 0 && fromIndex < this.items.length) {
      // Mark items before the new start as completed (if jumping forward)
      // or reset them if jumping backward
      for (let i = 0; i < this.items.length; i++) {
        if (i < fromIndex) {
          this.items[i].status = 'completed';
        } else if (i > fromIndex && this.items[i].status === 'completed') {
          // Reset items after the new start if they were completed
          this.items[i].status = this.items[i].isCached ? 'ready' : 'pending';
        }
      }
      this.currentIndex = fromIndex;
    }

    this.isPlaying = true;
    const current = this.items[this.currentIndex];
    if (current) {
      current.status = 'playing';
    }

    this.notifyStateChange();
    return current ?? null;
  }

  /**
   * Pause playback (keeps current position)
   */
  pause(): void {
    this.isPlaying = false;
    const current = this.items[this.currentIndex];
    if (current && current.status === 'playing') {
      // Keep as 'ready' so it can resume
      current.status = current.isCached || current.isPrefetched ? 'ready' : 'pending';
    }
    this.notifyStateChange();
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    this.isPlaying = false;
    // Reset all items except cached ones
    for (const item of this.items) {
      if (item.status !== 'error') {
        item.status = item.isCached ? 'ready' : 'pending';
        item.isPrefetched = false;
      }
    }
    this.currentIndex = 0;
    this.notifyStateChange();
  }

  /**
   * Mark current item as completed and advance to next
   *
   * @returns The next item to play, or null if queue is finished
   */
  advance(): QueueItem | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.items.length) {
      return null;
    }

    // Mark current as completed
    this.items[this.currentIndex].status = 'completed';
    this.items[this.currentIndex].isPrefetched = false;

    // Move to next
    this.currentIndex++;

    if (this.currentIndex >= this.items.length) {
      // Queue finished
      this.isPlaying = false;
      this.notifyStateChange();
      return null;
    }

    // Mark next as playing
    this.items[this.currentIndex].status = 'playing';
    this.notifyStateChange();
    return this.items[this.currentIndex];
  }

  /**
   * Jump to a specific index
   *
   * @param index - Index to jump to
   * @returns The item at that index, or null if invalid
   */
  jumpTo(index: number): QueueItem | null {
    if (index < 0 || index >= this.items.length) {
      return null;
    }

    // Reset current item if playing
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      const current = this.items[this.currentIndex];
      if (current.status === 'playing') {
        current.status = current.isCached || current.isPrefetched ? 'ready' : 'pending';
      }
    }

    this.currentIndex = index;
    this.items[this.currentIndex].status = this.isPlaying ? 'playing' : 'pending';
    this.notifyStateChange();
    return this.items[this.currentIndex];
  }

  // ============================================================================
  // Prefetch Management
  // ============================================================================

  /**
   * Get indices that should be prefetched (current + next N)
   *
   * @returns Array of indices in prefetch window that aren't ready
   */
  getPrefetchWindow(): number[] {
    if (this.currentIndex < 0) return [];

    const window: number[] = [];
    const endIndex = Math.min(this.currentIndex + this.prefetchAhead + 1, this.items.length);

    for (let i = this.currentIndex; i < endIndex; i++) {
      const item = this.items[i];
      // Include items that are pending (not cached, not prefetched, not errored)
      if (item.status === 'pending') {
        window.push(i);
      }
    }

    return window;
  }

  /**
   * Mark an item as currently being prefetched
   *
   * @param index - Index to mark
   */
  markPrefetching(index: number): void {
    const item = this.items[index];
    if (item && item.status === 'pending') {
      item.status = 'prefetching';
      this.notifyStateChange();
    }
  }

  /**
   * Mark an item as prefetched (ready in memory)
   *
   * @param index - Index to mark
   */
  markPrefetched(index: number): void {
    const item = this.items[index];
    if (item && (item.status === 'prefetching' || item.status === 'pending')) {
      item.status = 'ready';
      item.isPrefetched = true;
      this.notifyStateChange();
    }
  }

  /**
   * Mark an item as cached (persisted to IndexedDB)
   *
   * @param index - Index to mark
   */
  markCached(index: number): void {
    const item = this.items[index];
    if (item) {
      item.isCached = true;
      if (item.status !== 'playing' && item.status !== 'completed') {
        item.status = 'ready';
      }
      this.notifyStateChange();
    }
  }

  /**
   * Mark an item as errored
   *
   * @param index - Index to mark
   * @param errorMessage - Error description
   */
  markError(index: number, errorMessage: string): void {
    const item = this.items[index];
    if (item) {
      item.status = 'error';
      item.errorMessage = errorMessage;
      this.notifyStateChange();
    }
  }

  /**
   * Update cached indices (e.g., after cache refresh)
   *
   * @param cachedIndices - Array of indices that are cached
   */
  updateCachedIndices(cachedIndices: number[]): void {
    const cachedSet = new Set(cachedIndices);
    for (const item of this.items) {
      const wasCached = item.isCached;
      item.isCached = cachedSet.has(item.index);

      // Update status if cache status changed
      if (!wasCached && item.isCached && item.status === 'pending') {
        item.status = 'ready';
      }
    }
    this.notifyStateChange();
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current queue state snapshot
   */
  getState(): QueueState {
    let readyItems = 0;
    let prefetchingItems = 0;
    let completedItems = 0;

    for (const item of this.items) {
      if (item.status === 'ready' || item.isCached || item.isPrefetched) {
        readyItems++;
      }
      if (item.status === 'prefetching') {
        prefetchingItems++;
      }
      if (item.status === 'completed') {
        completedItems++;
      }
    }

    return {
      currentIndex: this.currentIndex,
      totalItems: this.items.length,
      readyItems,
      prefetchingItems,
      completedItems,
      prefetchWindow: this.getPrefetchWindow(),
      isPlaying: this.isPlaying,
    };
  }

  /**
   * Get current item
   */
  getCurrentItem(): QueueItem | null {
    return this.items[this.currentIndex] ?? null;
  }

  /**
   * Get item by index
   */
  getItem(index: number): QueueItem | null {
    return this.items[index] ?? null;
  }

  /**
   * Get all items
   */
  getAllItems(): QueueItem[] {
    return [...this.items];
  }

  /**
   * Check if an item is ready to play (cached or prefetched)
   */
  isItemReady(index: number): boolean {
    const item = this.items[index];
    return item ? item.status === 'ready' || item.isCached || item.isPrefetched : false;
  }

  /**
   * Check if queue is finished
   */
  isFinished(): boolean {
    return this.currentIndex >= this.items.length;
  }

  /**
   * Check if there are more items after current
   */
  hasNext(): boolean {
    return this.currentIndex < this.items.length - 1;
  }

  /**
   * Check if there are items before current
   */
  hasPrevious(): boolean {
    return this.currentIndex > 0;
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  /**
   * Subscribe to state changes
   *
   * @param callback - Function called when state changes
   */
  onStateChanged(callback: (state: QueueState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Unsubscribe from state changes
   */
  offStateChanged(): void {
    this.onStateChange = undefined;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default playback queue instance for background script usage
 */
export const playbackQueue = new PlaybackQueue();

console.log('Proso: utils/playback/playback-queue.ts loaded');
