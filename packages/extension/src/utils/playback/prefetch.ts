// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Prefetch Service Module
 * Manages intelligent prefetching of audio for upcoming paragraphs.
 * Integrates with cache store and playback queue for buffer-free playback.
 *
 * Feature: 028-smart-audio-cache (User Story 3)
 *
 * @module utils/playback/prefetch
 */

import { z } from "zod";
import type { PlaybackQueue, QueueState } from "./playback-queue";

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Prefetch priority level - higher means more urgent
 */
export const prefetchPrioritySchema = z.enum(["high", "medium", "low"]);
export type PrefetchPriority = z.infer<typeof prefetchPrioritySchema>;

/**
 * Prefetch task representing a pending prefetch operation
 */
export interface PrefetchTask {
  /** Paragraph index */
  index: number;
  /** Paragraph text */
  text: string;
  /** Priority level */
  priority: PrefetchPriority;
  /** Priority score (higher = more urgent) */
  score: number;
  /** Whether task is currently in progress */
  inProgress: boolean;
}

/**
 * Prefetched audio entry stored in memory
 */
export interface PrefetchedAudio {
  /** Paragraph index */
  index: number;
  /** Audio blob URL for playback */
  audioUrl: string;
  /** Raw audio data for persistent cache storage (T046) */
  audioData?: ArrayBuffer;
  /** Word timing data for sync highlighting */
  wordTimings: WordTiming[];
  /** When this was prefetched (for cleanup) */
  prefetchedAt: number;
}

/**
 * Word timing for highlight sync
 * Compatible with ElevenLabs WordTiming interface
 */
export interface WordTiming {
  word: string;
  charOffset: number;
  charLength: number;
  startTimeMs: number;
  endTimeMs: number;
}

/**
 * Prefetch service status
 */
export interface PrefetchStatus {
  /** Whether prefetching is active */
  isActive: boolean;
  /** Number of items in prefetch buffer */
  bufferSize: number;
  /** Indices currently in buffer */
  bufferedIndices: number[];
  /** Number of pending tasks */
  pendingTasks: number;
  /** Number of tasks in progress */
  inProgressTasks: number;
}

/**
 * Audio generator function signature (injected dependency)
 */
export type AudioGenerator = (
  text: string,
  index: number,
) => Promise<{ audioUrl: string; audioData?: ArrayBuffer; wordTimings: WordTiming[] } | null>;

/**
 * Cache checker function signature (injected dependency)
 */
export type CacheChecker = (index: number) => Promise<boolean>;

/**
 * Prefetch service options
 */
export interface PrefetchServiceOptions {
  /** Maximum items to keep in prefetch buffer */
  maxBufferSize?: number;
  /** Maximum concurrent prefetch operations */
  maxConcurrent?: number;
  /** Minimum interval between prefetch batches (ms) */
  batchIntervalMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_BUFFER_SIZE = 5;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_BATCH_INTERVAL_MS = 500;

/**
 * Safely revoke a blob URL (handles test environment where URL.revokeObjectURL may not exist)
 */
function safeRevokeObjectURL(url: string): void {
  if (
    url.startsWith("blob:") &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

// Priority weights for scoring
const PRIORITY_WEIGHTS = {
  // Distance from current (closer = higher priority)
  distance: 10,
  // Already cached (skip prefetch)
  cached: -1000,
  // Currently playing (highest priority)
  current: 100,
};

// ============================================================================
// PrefetchService Class
// ============================================================================

/**
 * Manages prefetching of audio for upcoming paragraphs
 */
export class PrefetchService {
  private buffer: Map<number, PrefetchedAudio> = new Map();
  private pendingTasks: Map<number, PrefetchTask> = new Map();
  private inProgressIndices: Set<number> = new Set();
  private isActive = false;
  private queue: PlaybackQueue | null = null;
  private generateAudio: AudioGenerator | null = null;
  private checkCache: CacheChecker | null = null;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly maxBufferSize: number;
  private readonly maxConcurrent: number;
  private readonly batchIntervalMs: number;

  constructor(options: PrefetchServiceOptions = {}) {
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.batchIntervalMs = options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Configure the prefetch service with dependencies
   *
   * @param queue - PlaybackQueue instance to watch
   * @param generateAudio - Function to generate audio for a paragraph
   * @param checkCache - Function to check if paragraph is cached
   */
  configure(queue: PlaybackQueue, generateAudio: AudioGenerator, checkCache?: CacheChecker): void {
    this.queue = queue;
    this.generateAudio = generateAudio;
    this.checkCache = checkCache ?? null;

    // Listen to queue state changes
    queue.onStateChanged(this.handleQueueStateChange.bind(this));
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start prefetching based on current queue state
   */
  start(): void {
    if (!this.queue || !this.generateAudio) {
      console.warn("[Prefetch] Cannot start - not configured");
      return;
    }

    this.isActive = true;
    console.log("[Prefetch] Started");

    // Immediately process current queue state
    const currentState = this.queue.getState();
    this.updatePendingTasks(currentState);

    this.scheduleBatch();
  }

  /**
   * Stop prefetching and clear pending tasks
   */
  stop(): void {
    this.isActive = false;
    this.pendingTasks.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    console.log("[Prefetch] Stopped");
  }

  /**
   * Clear prefetch buffer (e.g., on playback stop)
   *
   * @param keepIndices - Optional indices to keep in buffer
   */
  clearBuffer(keepIndices?: number[]): void {
    const keepSet = new Set(keepIndices ?? []);

    for (const [index, audio] of this.buffer) {
      if (!keepSet.has(index)) {
        // Revoke blob URL to free memory
        safeRevokeObjectURL(audio.audioUrl);
        this.buffer.delete(index);
      }
    }

    console.log("[Prefetch] Buffer cleared, kept:", keepIndices?.length ?? 0);
  }

  /**
   * Clear all resources
   */
  dispose(): void {
    this.stop();
    this.clearBuffer();
    this.buffer.clear();
    this.queue?.offStateChanged();
    this.queue = null;
    this.generateAudio = null;
    this.checkCache = null;
  }

  // ============================================================================
  // Buffer Access
  // ============================================================================

  /**
   * Get prefetched audio for an index
   *
   * @param index - Paragraph index
   * @returns Prefetched audio or null
   */
  get(index: number): PrefetchedAudio | null {
    return this.buffer.get(index) ?? null;
  }

  /**
   * Check if index is in prefetch buffer
   */
  has(index: number): boolean {
    return this.buffer.has(index);
  }

  /**
   * Remove an item from buffer (after it's been used)
   *
   * @param index - Index to remove
   */
  consume(index: number): PrefetchedAudio | null {
    const audio = this.buffer.get(index);
    if (audio) {
      this.buffer.delete(index);
      console.log("[Prefetch] Consumed index", index, "- buffer size:", this.buffer.size);
    }
    return audio ?? null;
  }

  /**
   * Get current service status
   */
  getStatus(): PrefetchStatus {
    return {
      isActive: this.isActive,
      bufferSize: this.buffer.size,
      bufferedIndices: Array.from(this.buffer.keys()),
      pendingTasks: this.pendingTasks.size,
      inProgressTasks: this.inProgressIndices.size,
    };
  }

  // ============================================================================
  // Priority Scoring (T044)
  // ============================================================================

  /**
   * Calculate priority score for prefetching a paragraph
   *
   * Higher scores = higher priority
   *
   * @param index - Paragraph index
   * @param currentIndex - Current playback position
   * @param isCached - Whether paragraph is already cached
   */
  calculatePriorityScore(index: number, currentIndex: number, isCached: boolean): number {
    if (isCached) {
      // Don't prefetch cached items
      return PRIORITY_WEIGHTS.cached;
    }

    let score = 0;

    // Distance from current position (closer = higher priority)
    const distance = index - currentIndex;
    if (distance < 0) {
      // Already passed, low priority
      score -= 50;
    } else {
      // Ahead of current, use inverse distance
      score += PRIORITY_WEIGHTS.distance * Math.max(1, 10 - distance);
    }

    // Current item gets highest priority
    if (distance === 0) {
      score += PRIORITY_WEIGHTS.current;
    }

    return score;
  }

  /**
   * Get priority level from score
   */
  getPriorityLevel(score: number): PrefetchPriority {
    if (score >= 80) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle queue state changes to update prefetch tasks
   */
  private handleQueueStateChange(state: QueueState): void {
    if (!this.isActive) return;

    // Update pending tasks based on new prefetch window
    this.updatePendingTasks(state);

    // Clean up buffer (remove old entries)
    this.cleanupBuffer(state.currentIndex);

    // Schedule next batch if not already scheduled
    this.scheduleBatch();
  }

  /**
   * Update pending tasks based on current queue state
   */
  private updatePendingTasks(state: QueueState): void {
    if (!this.queue) return;

    // Get indices that need prefetching
    const prefetchWindow = state.prefetchWindow;

    // Remove tasks for indices no longer in window or already buffered
    for (const index of this.pendingTasks.keys()) {
      if (!prefetchWindow.includes(index) || this.buffer.has(index)) {
        this.pendingTasks.delete(index);
      }
    }

    // Add new tasks for items in prefetch window
    for (const index of prefetchWindow) {
      if (
        this.pendingTasks.has(index) ||
        this.buffer.has(index) ||
        this.inProgressIndices.has(index)
      ) {
        continue;
      }

      const item = this.queue.getItem(index);
      if (!item) continue;

      const score = this.calculatePriorityScore(index, state.currentIndex, item.isCached);
      if (score < 0) continue; // Skip cached items

      const task: PrefetchTask = {
        index,
        text: item.text,
        priority: this.getPriorityLevel(score),
        score,
        inProgress: false,
      };

      this.pendingTasks.set(index, task);
    }
  }

  /**
   * Schedule next prefetch batch
   */
  private scheduleBatch(): void {
    if (this.batchTimer || !this.isActive) return;

    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.processBatch();
    }, this.batchIntervalMs);
  }

  /**
   * Process a batch of prefetch tasks
   */
  private async processBatch(): Promise<void> {
    if (!this.isActive || !this.generateAudio) return;

    // Get highest priority tasks that aren't in progress
    const availableTasks = Array.from(this.pendingTasks.values())
      .filter((t) => !t.inProgress && !this.inProgressIndices.has(t.index))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxConcurrent - this.inProgressIndices.size);

    if (availableTasks.length === 0) return;

    console.log(
      "[Prefetch] Processing batch:",
      availableTasks.map((t) => t.index),
    );

    // Start prefetch for each task
    const promises = availableTasks.map((task) => this.prefetchOne(task));

    // Wait for all to complete
    await Promise.allSettled(promises);

    // Schedule next batch if more tasks pending
    if (this.pendingTasks.size > 0 && this.isActive) {
      this.scheduleBatch();
    }
  }

  /**
   * Prefetch a single paragraph
   */
  private async prefetchOne(task: PrefetchTask): Promise<void> {
    if (!this.generateAudio || !this.queue) return;

    // Mark in progress
    task.inProgress = true;
    this.inProgressIndices.add(task.index);
    this.queue.markPrefetching(task.index);

    try {
      // Check cache first if checker available (T045)
      if (this.checkCache) {
        const isCached = await this.checkCache(task.index);
        if (isCached) {
          console.log("[Prefetch] Index", task.index, "is cached, skipping");
          this.pendingTasks.delete(task.index);
          this.queue.markCached(task.index);
          return;
        }
      }

      // Generate audio
      const result = await this.generateAudio(task.text, task.index);

      if (!result || !this.isActive) {
        // Generation failed or service stopped
        this.queue.markError(task.index, "Prefetch failed");
        return;
      }

      // Store in buffer
      const prefetchedAudio: PrefetchedAudio = {
        index: task.index,
        audioUrl: result.audioUrl,
        audioData: result.audioData, // T046: Store raw data for persistent cache
        wordTimings: result.wordTimings,
        prefetchedAt: Date.now(),
      };

      this.buffer.set(task.index, prefetchedAudio);
      this.queue.markPrefetched(task.index);

      console.log("[Prefetch] Completed index", task.index, "- buffer size:", this.buffer.size);

      // Remove from pending
      this.pendingTasks.delete(task.index);

      // Trim buffer if over limit
      this.trimBuffer();
    } catch (error) {
      console.error("[Prefetch] Error prefetching index", task.index, error);
      this.queue.markError(task.index, error instanceof Error ? error.message : "Unknown error");
    } finally {
      task.inProgress = false;
      this.inProgressIndices.delete(task.index);
    }
  }

  /**
   * Clean up buffer by removing old entries behind current position
   */
  private cleanupBuffer(currentIndex: number): void {
    // Remove entries more than 2 positions behind current
    const threshold = currentIndex - 2;
    for (const [index, audio] of this.buffer) {
      if (index < threshold) {
        safeRevokeObjectURL(audio.audioUrl);
        this.buffer.delete(index);
      }
    }
  }

  /**
   * Trim buffer to max size by removing oldest entries
   */
  private trimBuffer(): void {
    if (this.buffer.size <= this.maxBufferSize) return;

    // Sort by prefetch time and remove oldest
    const entries = Array.from(this.buffer.entries()).sort(
      (a, b) => a[1].prefetchedAt - b[1].prefetchedAt,
    );

    const toRemove = entries.slice(0, this.buffer.size - this.maxBufferSize);
    for (const [index, audio] of toRemove) {
      safeRevokeObjectURL(audio.audioUrl);
      this.buffer.delete(index);
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default prefetch service instance for background script usage
 */
export const prefetchService = new PrefetchService();

console.log("Proso: utils/playback/prefetch.ts loaded");
