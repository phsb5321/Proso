/**
 * Queue Player for VoxPage
 * Manages continuous playback of reading queue items
 *
 * @module utils/queue/player
 */

import type { QueueItem, QueueItemStatus } from './types';
import { QueueStore } from './store';

/**
 * Playback state
 */
export interface QueuePlaybackState {
  /** Whether queue playback is active */
  isPlaying: boolean;
  /** Current item being played */
  currentItem: QueueItem | null;
  /** Index in the playback order */
  currentIndex: number;
  /** Total items in playback queue */
  totalItems: number;
  /** Whether there are more items after current */
  hasNext: boolean;
  /** Whether there are items before current */
  hasPrevious: boolean;
}

/**
 * Playback event callback types
 */
export interface QueuePlayerCallbacks {
  /** Called when playback of an item starts */
  onItemStart?: (item: QueueItem) => void;
  /** Called when playback of an item completes */
  onItemComplete?: (item: QueueItem) => void;
  /** Called when queue playback finishes (no more items) */
  onQueueComplete?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error, item?: QueueItem) => void;
  /** Called when playback state changes */
  onStateChange?: (state: QueuePlaybackState) => void;
}

/**
 * Queue Player class
 * Orchestrates continuous playback through queue items
 */
export class QueuePlayer {
  private store: QueueStore;
  private callbacks: QueuePlayerCallbacks;
  private state: QueuePlaybackState;
  private playbackOrder: QueueItem[] = [];
  private autoPlayNext: boolean;

  constructor(store: QueueStore, callbacks: QueuePlayerCallbacks = {}) {
    this.store = store;
    this.callbacks = callbacks;
    this.autoPlayNext = true;
    this.state = {
      isPlaying: false,
      currentItem: null,
      currentIndex: -1,
      totalItems: 0,
      hasNext: false,
      hasPrevious: false,
    };
  }

  /**
   * Start playing the queue
   * @param startFromId - Optional ID to start from
   */
  async play(startFromId?: string): Promise<QueueItem | null> {
    const queueState = await this.store.getState();

    // Filter to pending and reading items
    this.playbackOrder = queueState.items
      .filter((item) => item.status === 'pending' || item.status === 'reading')
      .sort((a, b) => a.position - b.position);

    if (this.playbackOrder.length === 0) {
      return null;
    }

    // Find starting position
    let startIndex = 0;
    if (startFromId) {
      const index = this.playbackOrder.findIndex((item) => item.id === startFromId);
      if (index !== -1) {
        startIndex = index;
      }
    }

    // Set current item
    const currentItem = this.playbackOrder[startIndex];
    await this.setCurrentItem(currentItem, startIndex);

    return currentItem;
  }

  /**
   * Play the next item in the queue
   */
  async playNext(): Promise<{ item: QueueItem | null; hasMore: boolean }> {
    if (!this.state.isPlaying || this.state.currentIndex === -1) {
      return { item: null, hasMore: false };
    }

    // Mark current item as completed
    if (this.state.currentItem) {
      await this.store.updateStatus(this.state.currentItem.id, 'completed');
      await this.store.updateProgress(this.state.currentItem.id, 100);
      this.callbacks.onItemComplete?.(this.state.currentItem);
    }

    const nextIndex = this.state.currentIndex + 1;

    if (nextIndex >= this.playbackOrder.length) {
      // Queue complete
      this.state.isPlaying = false;
      this.state.currentItem = null;
      this.state.currentIndex = -1;
      this.notifyStateChange();
      this.callbacks.onQueueComplete?.();
      return { item: null, hasMore: false };
    }

    const nextItem = this.playbackOrder[nextIndex];
    await this.setCurrentItem(nextItem, nextIndex);

    return {
      item: nextItem,
      hasMore: nextIndex < this.playbackOrder.length - 1,
    };
  }

  /**
   * Play the previous item in the queue
   */
  async playPrevious(): Promise<QueueItem | null> {
    if (!this.state.isPlaying || this.state.currentIndex <= 0) {
      return null;
    }

    const prevIndex = this.state.currentIndex - 1;
    const prevItem = this.playbackOrder[prevIndex];

    // Reset the previous item's status
    await this.store.updateStatus(prevItem.id, 'reading');
    await this.setCurrentItem(prevItem, prevIndex);

    return prevItem;
  }

  /**
   * Stop queue playback
   */
  async stop(): Promise<void> {
    if (this.state.currentItem) {
      // Keep progress but mark as pending
      await this.store.updateStatus(this.state.currentItem.id, 'pending');
    }

    this.state.isPlaying = false;
    this.state.currentItem = null;
    this.state.currentIndex = -1;
    this.state.hasNext = false;
    this.state.hasPrevious = false;
    this.notifyStateChange();
  }

  /**
   * Pause queue playback (keeps current position)
   */
  pause(): void {
    this.state.isPlaying = false;
    this.notifyStateChange();
  }

  /**
   * Resume queue playback
   */
  resume(): void {
    if (this.state.currentItem) {
      this.state.isPlaying = true;
      this.notifyStateChange();
    }
  }

  /**
   * Get current playback state
   */
  getState(): QueuePlaybackState {
    return { ...this.state };
  }

  /**
   * Set auto-play next setting
   */
  setAutoPlayNext(value: boolean): void {
    this.autoPlayNext = value;
  }

  /**
   * Called when current item playback completes
   * Should be called by the audio playback system
   */
  async onCurrentItemComplete(): Promise<void> {
    if (this.autoPlayNext) {
      await this.playNext();
    } else {
      if (this.state.currentItem) {
        await this.store.updateStatus(this.state.currentItem.id, 'completed');
        await this.store.updateProgress(this.state.currentItem.id, 100);
        this.callbacks.onItemComplete?.(this.state.currentItem);
      }
      this.pause();
    }
  }

  /**
   * Update progress of current item
   * @param progress - Progress percentage (0-100)
   * @param paragraphIndex - Current paragraph index
   */
  async updateCurrentProgress(
    progress: number,
    paragraphIndex?: number
  ): Promise<void> {
    if (!this.state.currentItem) return;

    await this.store.updateProgress(
      this.state.currentItem.id,
      progress,
      paragraphIndex
    );
  }

  /**
   * Set current item and update state
   */
  private async setCurrentItem(item: QueueItem, index: number): Promise<void> {
    // Update item status to reading
    await this.store.updateStatus(item.id, 'reading');

    this.state = {
      isPlaying: true,
      currentItem: item,
      currentIndex: index,
      totalItems: this.playbackOrder.length,
      hasNext: index < this.playbackOrder.length - 1,
      hasPrevious: index > 0,
    };

    this.notifyStateChange();
    this.callbacks.onItemStart?.(item);
  }

  /**
   * Notify state change callback
   */
  private notifyStateChange(): void {
    this.callbacks.onStateChange?.({ ...this.state });
  }
}

/**
 * Create a new QueuePlayer instance
 */
export function createQueuePlayer(
  store: QueueStore,
  callbacks?: QueuePlayerCallbacks
): QueuePlayer {
  return new QueuePlayer(store, callbacks);
}
