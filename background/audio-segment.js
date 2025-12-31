/**
 * AudioSegment Class
 * Represents a cached audio segment for TTS playback
 */

/**
 * @typedef {Object} AudioSegmentData
 * @property {string} cacheKey - Unique cache key (hash of provider+voice+text)
 * @property {ArrayBuffer} audioData - Raw audio data
 * @property {string} provider - Provider ID used to generate
 * @property {string} voice - Voice ID used to generate
 * @property {number} duration - Estimated duration in seconds
 * @property {number} createdAt - Timestamp when created
 * @property {number} lastAccessedAt - Timestamp when last accessed
 */

export class AudioSegment {
  /**
   * Create an AudioSegment
   * @param {string} cacheKey - Unique cache key
   * @param {ArrayBuffer} audioData - Raw audio data
   * @param {Object} metadata - Segment metadata
   */
  constructor(cacheKey, audioData, metadata = {}) {
    this.cacheKey = cacheKey;
    this.audioData = audioData;
    this.provider = metadata.provider || '';
    this.voice = metadata.voice || '';
    this.text = metadata.text || '';
    this.duration = metadata.duration || 0;
    this.createdAt = Date.now();
    this.lastAccessedAt = this.createdAt;
    this.size = audioData.byteLength;
  }

  /**
   * Update last accessed timestamp
   */
  touch() {
    this.lastAccessedAt = Date.now();
  }

  /**
   * Get the age of this segment in milliseconds
   * @returns {number}
   */
  getAge() {
    return Date.now() - this.createdAt;
  }

  /**
   * Check if segment is stale (older than maxAge)
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean}
   */
  isStale(maxAge) {
    return this.getAge() > maxAge;
  }

  /**
   * Create an Audio object from this segment
   * @returns {HTMLAudioElement}
   */
  createAudioElement() {
    const blob = new Blob([this.audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    // Clean up blob URL when audio is no longer needed
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);

    return audio;
  }

  /**
   * Generate a cache key from segment properties
   * @param {string} provider - Provider ID
   * @param {string} voice - Voice ID
   * @param {string} text - Text content
   * @returns {string}
   */
  static generateCacheKey(provider, voice, text) {
    // Simple hash function for cache key generation
    const input = `${provider}:${voice}:${text}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `audio_${provider}_${Math.abs(hash).toString(16)}`;
  }
}
