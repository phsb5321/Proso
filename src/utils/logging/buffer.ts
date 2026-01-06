// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Log Buffer
 * Circular buffer for storing log entries before transmission
 *
 * @module utils/logging/buffer
 */

import { z } from 'zod';
import { type LogEntry, validateLogEntry, getEntrySize, loggingConstants } from './entry';

/**
 * Log buffer state schema
 */
export const logBufferStateSchema = z.object({
  count: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  maxBytes: z.number().positive(),
  maxEntries: z.number().int().positive(),
  lastFlushAttempt: z.number().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
});

export type LogBufferState = z.infer<typeof logBufferStateSchema>;

/**
 * Saved buffer state (in storage)
 */
interface SavedBufferState {
  entries: LogEntry[];
  totalBytes: number;
  lastFlushAttempt: number;
  consecutiveFailures: number;
}

/**
 * Buffer options schema
 */
export const bufferOptionsSchema = z.object({
  maxBytes: z.number().positive().optional(),
  maxEntries: z.number().int().positive().optional(),
});

export type BufferOptions = z.infer<typeof bufferOptionsSchema>;

/**
 * Storage key for log buffer
 */
const STORAGE_KEY = 'voxpage_log_buffer';

/**
 * Default logging configuration
 */
const loggingDefaults = {
  maxBufferBytes: loggingConstants.maxBufferBytes,
  maxBatchSize: 100,
};

/**
 * Circular buffer for log entries
 * Stores entries in browser.storage.local with size limits
 * Uses a simple bounded array that evicts oldest when full
 */
export class LogBuffer {
  private entries: LogEntry[] = [];
  private totalBytes: number = 0;
  private lastFlushAttempt: number = 0;
  private consecutiveFailures: number = 0;

  readonly maxBytes: number;
  readonly maxEntries: number;

  /**
   * Create a new LogBuffer
   * @param options - Configuration options
   */
  constructor(options: BufferOptions = {}) {
    this.maxBytes = options.maxBytes || loggingDefaults.maxBufferBytes;
    // Estimate max entries based on average entry size (~200 bytes)
    this.maxEntries = options.maxEntries || Math.floor(this.maxBytes / 200);
  }

  /**
   * Get current entry count
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Add a log entry to the buffer
   * If buffer is full, oldest entries are removed
   * @param entry - Validated LogEntry to add
   * @returns True if added successfully
   */
  add(entry: LogEntry): boolean {
    if (!validateLogEntry(entry)) {
      return false;
    }

    const entrySize = getEntrySize(entry);

    // Check if single entry exceeds limits
    if (entrySize > this.maxBytes) {
      console.warn('LogBuffer: Entry too large, dropping');
      return false;
    }

    // Make room if needed (evict oldest entries) - bytes limit
    while (this.entries.length > 0 && this.totalBytes + entrySize > this.maxBytes) {
      this.evictOldest();
    }

    // Make room if at max entries
    while (this.entries.length >= this.maxEntries) {
      this.evictOldest();
    }

    // Add entry
    this.entries.push(entry);
    this.totalBytes += entrySize;
    return true;
  }

  /**
   * Evict the oldest entry from the buffer
   */
  private evictOldest(): void {
    if (this.entries.length === 0) return;

    const oldEntry = this.entries.shift();
    if (oldEntry) {
      this.totalBytes -= getEntrySize(oldEntry);
    }
  }

  /**
   * Get all entries in chronological order
   */
  getAll(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get and clear entries (for flushing)
   * @returns Array of LogEntry objects that were in buffer
   */
  flush(): LogEntry[] {
    const entries = this.getAll();
    this.clear();
    return entries;
  }

  /**
   * Clear all entries from buffer
   */
  clear(): void {
    this.entries = [];
    this.totalBytes = 0;
  }

  /**
   * Get current buffer state
   */
  getState(): LogBufferState {
    return {
      count: this.count,
      totalBytes: this.totalBytes,
      maxBytes: this.maxBytes,
      maxEntries: this.maxEntries,
      lastFlushAttempt: this.lastFlushAttempt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if buffer should be flushed
   * @param batchSize - Maximum batch size
   */
  shouldFlush(batchSize: number = loggingDefaults.maxBatchSize): boolean {
    return this.count >= batchSize || this.totalBytes >= this.maxBytes * 0.9;
  }

  /**
   * Record a flush attempt result
   * @param success - Whether flush succeeded
   */
  recordFlushResult(success: boolean): void {
    this.lastFlushAttempt = Date.now();
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
  }

  /**
   * Check if circuit breaker is tripped
   */
  isCircuitBroken(): boolean {
    const maxFailures = 10; // loggingConstants.maxConsecutiveFailures
    return this.consecutiveFailures >= maxFailures;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Save buffer state to storage
   */
  async save(): Promise<void> {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY]: {
          entries: this.entries.filter(e => e !== null),
          totalBytes: this.totalBytes,
          lastFlushAttempt: this.lastFlushAttempt,
          consecutiveFailures: this.consecutiveFailures,
        },
      });
    } catch (err: any) {
      console.warn('LogBuffer: Failed to save to storage', err.message);
    }
  }

  /**
   * Load buffer state from storage
   */
  async load(): Promise<void> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY);
      const saved = result[STORAGE_KEY] as SavedBufferState | undefined;

      if (saved && Array.isArray(saved.entries)) {
        this.entries = saved.entries.filter((e: any) => validateLogEntry(e));
        this.totalBytes = saved.totalBytes || this.recalculateSize();
        this.lastFlushAttempt = saved.lastFlushAttempt || 0;
        this.consecutiveFailures = saved.consecutiveFailures || 0;
      }
    } catch (err: any) {
      console.warn('LogBuffer: Failed to load from storage', err.message);
    }
  }

  /**
   * Recalculate total bytes from entries
   */
  private recalculateSize(): number {
    return this.entries.reduce((sum, entry) => sum + getEntrySize(entry), 0);
  }
}

/**
 * Create a LogBuffer instance
 * @param options - Configuration options
 */
export function createLogBuffer(options?: BufferOptions): LogBuffer {
  return new LogBuffer(options);
}
