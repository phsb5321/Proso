/**
 * Audio Cache Module
 * LRU cache for audio segments to enable instant rewind and reduce API calls
 */

import { AudioSegment } from './audio-segment.js';

/**
 * LRU Cache configuration
 */
const CACHE_CONFIG = {
  maxEntries: 50,           // Maximum number of cached segments
  maxAgeMs: 30 * 60 * 1000, // 30 minutes max age
  maxSizeBytes: 100 * 1024 * 1024 // 100MB max total size
};

/**
 * LRU Audio Cache
 */
class AudioCache {
  constructor() {
    /** @type {Map<string, AudioSegment>} */
    this._cache = new Map();
    this._totalSize = 0;
  }

  /**
   * Generate a cache key for audio content
   * @param {string} provider - Provider ID
   * @param {string} voice - Voice ID
   * @param {string} text - Text content
   * @returns {string}
   */
  generateKey(provider, voice, text) {
    return AudioSegment.generateCacheKey(provider, voice, text);
  }

  /**
   * Check if a key exists in the cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    if (!this._cache.has(key)) {
      return false;
    }

    // Check if segment is stale
    const segment = this._cache.get(key);
    if (segment.isStale(CACHE_CONFIG.maxAgeMs)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get a cached audio segment
   * @param {string} key - Cache key
   * @returns {AudioSegment|null}
   */
  get(key) {
    if (!this.has(key)) {
      return null;
    }

    const segment = this._cache.get(key);
    segment.touch();

    // Move to end (most recently used)
    this._cache.delete(key);
    this._cache.set(key, segment);

    return segment;
  }

  /**
   * Store an audio segment in the cache
   * @param {string} key - Cache key
   * @param {ArrayBuffer} audioData - Audio data
   * @param {Object} metadata - Segment metadata
   * @returns {AudioSegment}
   */
  set(key, audioData, metadata = {}) {
    // Remove existing entry if present
    if (this._cache.has(key)) {
      this.delete(key);
    }

    // Evict entries if needed
    this._evictIfNeeded(audioData.byteLength);

    // Create and store new segment
    const segment = new AudioSegment(key, audioData, metadata);
    this._cache.set(key, segment);
    this._totalSize += segment.size;

    return segment;
  }

  /**
   * Delete a cached segment
   * @param {string} key - Cache key
   */
  delete(key) {
    const segment = this._cache.get(key);
    if (segment) {
      this._totalSize -= segment.size;
      this._cache.delete(key);
    }
  }

  /**
   * Clear all cached segments
   */
  clear() {
    this._cache.clear();
    this._totalSize = 0;
  }

  /**
   * Clear segments for a specific provider
   * @param {string} provider - Provider ID
   */
  clearForProvider(provider) {
    for (const [key, segment] of this._cache) {
      if (segment.provider === provider) {
        this.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      entries: this._cache.size,
      maxEntries: CACHE_CONFIG.maxEntries,
      totalSize: this._totalSize,
      maxSize: CACHE_CONFIG.maxSizeBytes,
      sizePercentage: (this._totalSize / CACHE_CONFIG.maxSizeBytes * 100).toFixed(1)
    };
  }

  /**
   * Evict entries if cache is full
   * @param {number} incomingSize - Size of new entry
   */
  _evictIfNeeded(incomingSize) {
    // Evict if too many entries
    while (this._cache.size >= CACHE_CONFIG.maxEntries) {
      this._evictOldest();
    }

    // Evict if size limit exceeded
    while (this._totalSize + incomingSize > CACHE_CONFIG.maxSizeBytes && this._cache.size > 0) {
      this._evictOldest();
    }

    // Evict stale entries
    this._evictStale();
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  _evictOldest() {
    const oldestKey = this._cache.keys().next().value;
    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Evict all stale entries
   */
  _evictStale() {
    for (const [key, segment] of this._cache) {
      if (segment.isStale(CACHE_CONFIG.maxAgeMs)) {
        this.delete(key);
      }
    }
  }
}

// Export singleton instance
export const audioCache = new AudioCache();
