/**
 * VoxPage Log Buffer
 * Circular buffer for storing log entries before transmission
 *
 * @module background/log-buffer
 * @description Circular buffer with size limits for log storage (014-loki-remote-logging)
 */

import { getEntrySize, validateLogEntry } from './log-entry.js';
import { loggingDefaults, loggingConstants } from '../shared/config/logging-defaults.js';
import { StorageKey } from './constants.js';

/**
 * Circular buffer for log entries
 * Stores entries in browser.storage.local with size limits
 * Uses a simple bounded array that evicts oldest when full
 */
export class LogBuffer {
  /**
   * Create a new LogBuffer
   * @param {Object} [options] - Configuration options
   * @param {number} [options.maxBytes] - Maximum buffer size in bytes
   * @param {number} [options.maxEntries] - Maximum number of entries (calculated if not provided)
   */
  constructor(options = {}) {
    this.maxBytes = options.maxBytes || loggingDefaults.maxBufferBytes;
    // Estimate max entries based on average entry size (~200 bytes)
    this.maxEntries = options.maxEntries || Math.floor(this.maxBytes / 200);

    this.entries = [];
    this.totalBytes = 0;
    this.lastFlushAttempt = 0;
    this.consecutiveFailures = 0;
  }

  /**
   * Get current entry count
   * @returns {number}
   */
  get count() {
    return this.entries.length;
  }

  /**
   * Add a log entry to the buffer
   * If buffer is full, oldest entries are removed
   *
   * @param {Object} entry - Validated LogEntry to add
   * @returns {boolean} True if added successfully
   */
  add(entry) {
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
      this._evictOldest();
    }

    // Make room if at max entries
    while (this.entries.length >= this.maxEntries) {
      this._evictOldest();
    }

    // Add entry
    this.entries.push(entry);
    this.totalBytes += entrySize;
    return true;
  }

  /**
   * Evict the oldest entry from the buffer
   * @private
   */
  _evictOldest() {
    if (this.entries.length === 0) return;

    const oldEntry = this.entries.shift();
    if (oldEntry) {
      this.totalBytes -= getEntrySize(oldEntry);
    }
  }

  /**
   * Get all entries in chronological order
   * @returns {Array} Array of LogEntry objects
   */
  getAll() {
    return [...this.entries];
  }

  /**
   * Get and clear entries (for flushing)
   * @returns {Array} Array of LogEntry objects that were in buffer
   */
  flush() {
    const entries = this.getAll();
    this.clear();
    return entries;
  }

  /**
   * Clear all entries from buffer
   */
  clear() {
    this.entries = [];
    this.totalBytes = 0;
  }

  /**
   * Get current buffer state
   * @returns {Object} Buffer state
   */
  getState() {
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
   * @returns {boolean} True if no entries
   */
  isEmpty() {
    return this.count === 0;
  }

  /**
   * Check if buffer should be flushed
   * @param {number} batchSize - Maximum batch size
   * @returns {boolean} True if flush recommended
   */
  shouldFlush(batchSize = loggingDefaults.maxBatchSize) {
    return this.count >= batchSize || this.totalBytes >= this.maxBytes * 0.9;
  }

  /**
   * Record a flush attempt result
   * @param {boolean} success - Whether flush succeeded
   */
  recordFlushResult(success) {
    this.lastFlushAttempt = Date.now();
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
  }

  /**
   * Check if circuit breaker is tripped
   * @returns {boolean} True if too many consecutive failures
   */
  isCircuitBroken() {
    return this.consecutiveFailures >= loggingConstants.maxConsecutiveFailures;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
  }

  /**
   * Save buffer state to storage
   * @returns {Promise<void>}
   */
  async save() {
    try {
      await browser.storage.local.set({
        [StorageKey.LOG_BUFFER]: {
          entries: this.entries.filter(e => e !== null),
          totalBytes: this.totalBytes,
          lastFlushAttempt: this.lastFlushAttempt,
          consecutiveFailures: this.consecutiveFailures,
        },
      });
    } catch (err) {
      console.warn('LogBuffer: Failed to save to storage', err.message);
    }
  }

  /**
   * Load buffer state from storage
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const result = await browser.storage.local.get(StorageKey.LOG_BUFFER);
      const saved = result[StorageKey.LOG_BUFFER];

      if (saved && Array.isArray(saved.entries)) {
        this.entries = saved.entries.filter(e => validateLogEntry(e));
        this.totalBytes = saved.totalBytes || this._recalculateSize();
        this.lastFlushAttempt = saved.lastFlushAttempt || 0;
        this.consecutiveFailures = saved.consecutiveFailures || 0;
      }
    } catch (err) {
      console.warn('LogBuffer: Failed to load from storage', err.message);
    }
  }

  /**
   * Recalculate total bytes from entries
   * @private
   * @returns {number} Total bytes
   */
  _recalculateSize() {
    return this.entries.reduce((sum, entry) => sum + getEntrySize(entry), 0);
  }
}

/**
 * Create a LogBuffer instance
 * @param {Object} [options] - Configuration options
 * @returns {LogBuffer} New buffer instance
 */
export function createLogBuffer(options) {
  return new LogBuffer(options);
}

export default LogBuffer;
