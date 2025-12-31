/**
 * VoxPage Playback Sync Module
 * Manages synchronization state between audio playback and text highlighting
 */

/**
 * Timing data for a single paragraph
 * @typedef {Object} ParagraphTiming
 * @property {number} index - Paragraph index
 * @property {number} startTimeMs - Start time in milliseconds
 * @property {number} endTimeMs - End time in milliseconds
 * @property {number} durationMs - Duration in milliseconds
 */

/**
 * Word boundary data for word-level highlighting
 * @typedef {Object} WordBoundary
 * @property {string} word - The word text
 * @property {number} charOffset - Character offset within segment
 * @property {number} charLength - Character length
 * @property {number} startTimeMs - Start time in milliseconds
 * @property {number} endTimeMs - End time in milliseconds
 */

/**
 * PlaybackSyncState manages the synchronization between audio playback
 * and text highlighting, supporting both paragraph and word-level sync.
 */
export class PlaybackSyncState {
  constructor() {
    /** @type {ParagraphTiming[]} */
    this.paragraphTimeline = [];

    /** @type {WordBoundary[]|null} */
    this.wordTimeline = null;

    /** @type {number} */
    this._currentTimeMs = 0;

    /** @type {number} */
    this._totalDurationMs = 0;

    /** @type {number} */
    this._currentParagraphIndex = 0;

    /** @type {number|null} */
    this._currentWordIndex = null;

    /** @type {number} */
    this._lastSyncTimestamp = 0;

    /** @type {boolean} */
    this._isRunning = false;

    /** @type {number|null} */
    this._animationFrameId = null;

    /** @type {Function|null} */
    this._onParagraphChange = null;

    /** @type {Function|null} */
    this._onWordChange = null;

    /** @type {Function|null} */
    this._onProgress = null;

    /** @type {HTMLAudioElement|null} */
    this._audioElement = null;

    /** @type {boolean} - Whether initial paragraph callback has fired (T002) */
    this._hasInitialSyncFired = false;

    /** @type {boolean} - Whether timeline uses actual audio duration (T003) */
    this._isTimelineAccurate = false;

    /** @type {number} - Drift detection: last known audio time (006-robust-audio-highlight-sync) */
    this._lastKnownAudioTime = 0;

    /** @type {number} - Detected drift in milliseconds */
    this._driftMs = 0;

    /** @type {number} - Drift warning threshold in ms (FR-011) */
    this._driftThresholdMs = 200;

    /** @type {number} - Performance: last sync loop duration (T052) */
    this._lastSyncDurationMs = 0;

    /** @type {number} - Performance: max sync loop duration observed */
    this._maxSyncDurationMs = 0;

    /** @type {boolean} - Enable performance logging */
    this._perfLogging = false;
  }

  /**
   * Get current paragraph index
   * @returns {number}
   */
  get currentParagraphIndex() {
    return this._currentParagraphIndex;
  }

  /**
   * Get current time in milliseconds
   * @returns {number}
   */
  get currentTimeMs() {
    return this._currentTimeMs;
  }

  /**
   * Get total duration in milliseconds
   * @returns {number}
   */
  get totalDurationMs() {
    return this._totalDurationMs;
  }

  /**
   * Get current word index (null if word-level sync unavailable)
   * @returns {number|null}
   */
  get currentWordIndex() {
    return this._currentWordIndex;
  }

  /**
   * Check if word-level timing is available
   * @returns {boolean}
   */
  get hasWordTiming() {
    return this.wordTimeline !== null && this.wordTimeline.length > 0;
  }

  /**
   * Get progress as percentage (0-100)
   * @returns {number}
   */
  get progressPercent() {
    if (this._totalDurationMs === 0) return 0;
    return Math.min(100, (this._currentTimeMs / this._totalDurationMs) * 100);
  }

  /**
   * Get current drift in milliseconds (006-robust-audio-highlight-sync)
   * @returns {number}
   */
  get driftMs() {
    return this._driftMs;
  }

  /**
   * Check if currently drifting beyond threshold (FR-011)
   * @returns {boolean}
   */
  get isDrifting() {
    return Math.abs(this._driftMs) > this._driftThresholdMs;
  }

  /**
   * Get last sync loop duration in ms (T052)
   * @returns {number}
   */
  get lastSyncDurationMs() {
    return this._lastSyncDurationMs;
  }

  /**
   * Get max observed sync loop duration in ms (T052)
   * @returns {number}
   */
  get maxSyncDurationMs() {
    return this._maxSyncDurationMs;
  }

  /**
   * Enable/disable performance logging (T052)
   * @param {boolean} enabled
   */
  set perfLogging(enabled) {
    this._perfLogging = enabled;
  }

  /**
   * Build paragraph timeline from paragraphs and estimated durations
   * @param {string[]} paragraphs - Array of paragraph texts
   * @param {number} totalDurationMs - Total estimated duration in milliseconds
   */
  buildParagraphTimeline(paragraphs, totalDurationMs) {
    this._totalDurationMs = totalDurationMs;
    this.paragraphTimeline = [];

    if (paragraphs.length === 0) return;

    // Calculate word counts for proportional timing
    const wordCounts = paragraphs.map(p => p.split(/\s+/).filter(w => w.length > 0).length);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);

    if (totalWords === 0) {
      // Equal distribution if no words
      const durationPerParagraph = totalDurationMs / paragraphs.length;
      let currentTime = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        this.paragraphTimeline.push({
          index: i,
          startTimeMs: currentTime,
          endTimeMs: currentTime + durationPerParagraph,
          durationMs: durationPerParagraph
        });
        currentTime += durationPerParagraph;
      }
    } else {
      // Proportional distribution based on word count
      let currentTime = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        const proportion = wordCounts[i] / totalWords;
        const durationMs = totalDurationMs * proportion;

        this.paragraphTimeline.push({
          index: i,
          startTimeMs: currentTime,
          endTimeMs: currentTime + durationMs,
          durationMs: durationMs
        });
        currentTime += durationMs;
      }
    }

    this._currentParagraphIndex = 0;
    this._currentTimeMs = 0;

    // Mark timeline as not yet accurate (using estimates)
    this._isTimelineAccurate = false;
  }

  /**
   * Rebuild timeline with actual audio duration (T007, T008)
   * Called when audio.loadedmetadata fires with actual duration
   * @param {number} actualDurationMs - Actual audio duration from audio.duration * 1000
   */
  rebuildTimelineWithDuration(actualDurationMs) {
    if (this.paragraphTimeline.length === 0) return;
    if (this._totalDurationMs === 0) return;

    // Calculate scaling factor
    const scaleFactor = actualDurationMs / this._totalDurationMs;

    // Scale all timing values
    for (let i = 0; i < this.paragraphTimeline.length; i++) {
      const timing = this.paragraphTimeline[i];
      timing.startTimeMs = timing.startTimeMs * scaleFactor;
      timing.endTimeMs = timing.endTimeMs * scaleFactor;
      timing.durationMs = timing.durationMs * scaleFactor;
    }

    // T008: Close timing gaps - ensure each paragraph.endTimeMs = next.startTimeMs
    for (let i = 0; i < this.paragraphTimeline.length - 1; i++) {
      const current = this.paragraphTimeline[i];
      const next = this.paragraphTimeline[i + 1];
      // Close any gap by setting end time to next start time
      current.endTimeMs = next.startTimeMs;
      current.durationMs = current.endTimeMs - current.startTimeMs;
    }

    // Ensure last paragraph extends to the actual end
    if (this.paragraphTimeline.length > 0) {
      const last = this.paragraphTimeline[this.paragraphTimeline.length - 1];
      last.endTimeMs = actualDurationMs;
      last.durationMs = last.endTimeMs - last.startTimeMs;
    }

    // Update total duration and mark as accurate
    this._totalDurationMs = actualDurationMs;
    this._isTimelineAccurate = true;
  }

  /**
   * Set word timeline for the current paragraph
   * @param {WordBoundary[]} wordTimeline - Array of word timing data
   */
  setWordTimeline(wordTimeline) {
    this.wordTimeline = wordTimeline;
    this._currentWordIndex = wordTimeline && wordTimeline.length > 0 ? 0 : null;
  }

  /**
   * Set the actual duration for the current paragraph's audio
   * Used to scale word timings when actual duration differs from estimated
   * Does NOT affect the document-level paragraph timeline
   * @param {number} durationMs - Actual audio duration in milliseconds
   */
  setCurrentParagraphDuration(durationMs) {
    this._currentParagraphDurationMs = durationMs;

    // If we have word timings, scale them to match actual duration
    if (this.wordTimeline && this.wordTimeline.length > 0) {
      const lastWord = this.wordTimeline[this.wordTimeline.length - 1];
      const estimatedDuration = lastWord.endTimeMs || lastWord.endMs;

      if (estimatedDuration > 0 && Math.abs(durationMs - estimatedDuration) > 100) {
        const scaleFactor = durationMs / estimatedDuration;
        console.log(`VoxPage: Scaling word timings by ${scaleFactor.toFixed(2)} (${estimatedDuration}ms -> ${durationMs}ms)`);

        for (const word of this.wordTimeline) {
          if (word.startTimeMs !== undefined) {
            word.startTimeMs = Math.round(word.startTimeMs * scaleFactor);
            word.endTimeMs = Math.round(word.endTimeMs * scaleFactor);
          } else if (word.startMs !== undefined) {
            word.startMs = Math.round(word.startMs * scaleFactor);
            word.endMs = Math.round(word.endMs * scaleFactor);
          }
        }
      }
    }
  }

  /**
   * Clear word timeline (fallback to paragraph-only)
   */
  clearWordTimeline() {
    this.wordTimeline = null;
    this._currentWordIndex = null;
  }

  /**
   * Register callback for paragraph changes
   * @param {Function} callback - Called with (paragraphIndex, timestamp)
   */
  onParagraphChange(callback) {
    this._onParagraphChange = callback;
  }

  /**
   * Register callback for word changes
   * @param {Function} callback - Called with (paragraphIndex, wordIndex, timestamp)
   */
  onWordChange(callback) {
    this._onWordChange = callback;
  }

  /**
   * Register callback for progress updates
   * @param {Function} callback - Called with (progressPercent, timeRemainingMs)
   */
  onProgress(callback) {
    this._onProgress = callback;
  }

  /**
   * Sync to the correct paragraph based on current time (T028, T029)
   * @private
   */
  syncToParagraph() {
    if (this.paragraphTimeline.length === 0) return;

    const currentTime = this._currentTimeMs;
    let newIndex = this._currentParagraphIndex;
    let foundExact = false;

    // Find the paragraph that contains the current time
    for (let i = 0; i < this.paragraphTimeline.length; i++) {
      const timing = this.paragraphTimeline[i];
      // T028: Handle exact boundary - include time at startTimeMs
      if (currentTime >= timing.startTimeMs && currentTime < timing.endTimeMs) {
        newIndex = i;
        foundExact = true;
        break;
      }
      // Handle case where we're past the last paragraph
      if (i === this.paragraphTimeline.length - 1 && currentTime >= timing.startTimeMs) {
        newIndex = i;
        foundExact = true;
      }
    }

    // T029: Fallback - find closest paragraph if no exact match (e.g., before first paragraph)
    if (!foundExact && this.paragraphTimeline.length > 0) {
      if (currentTime < this.paragraphTimeline[0].startTimeMs) {
        // Before first paragraph - use first
        newIndex = 0;
      } else {
        // Find closest by distance to midpoint
        let closestDist = Infinity;
        for (let i = 0; i < this.paragraphTimeline.length; i++) {
          const timing = this.paragraphTimeline[i];
          const midpoint = (timing.startTimeMs + timing.endTimeMs) / 2;
          const dist = Math.abs(currentTime - midpoint);
          if (dist < closestDist) {
            closestDist = dist;
            newIndex = i;
          }
        }
      }
    }

    if (newIndex !== this._currentParagraphIndex) {
      this._currentParagraphIndex = newIndex;
      this._lastSyncTimestamp = Date.now();

      if (this._onParagraphChange) {
        this._onParagraphChange(newIndex, this._lastSyncTimestamp);
      }
    }
  }

  /**
   * Sync to the correct word based on current time (T024, FR-005)
   * Uses binary search for efficiency with large word lists (O(log n) vs O(n))
   * Handles both startMs/endMs and startTimeMs/endTimeMs naming conventions
   * @private
   */
  syncToWord() {
    if (!this.wordTimeline || this.wordTimeline.length === 0) return;

    const currentTime = this._currentTimeMs;
    let newWordIndex = this._binarySearchWord(currentTime);

    if (newWordIndex !== this._currentWordIndex) {
      this._currentWordIndex = newWordIndex;
      this._lastSyncTimestamp = Date.now();

      if (this._onWordChange && newWordIndex !== null) {
        this._onWordChange(this._currentParagraphIndex, newWordIndex, this._lastSyncTimestamp);
      }
    }
  }

  /**
   * Binary search to find the word index for a given time (T024, FR-005)
   * For 500 words: ~9 comparisons vs ~250 for linear scan
   * @param {number} timeMs - Current time in milliseconds
   * @returns {number} Word index, or -1 if not found
   * @private
   */
  _binarySearchWord(timeMs) {
    const timeline = this.wordTimeline;
    if (!timeline || timeline.length === 0) return -1;

    let left = 0;
    let right = timeline.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const word = timeline[mid];
      const startMs = word.startMs ?? word.startTimeMs ?? 0;
      const endMs = word.endMs ?? word.endTimeMs ?? 0;

      if (timeMs >= startMs && timeMs < endMs) {
        // Found exact match
        return mid;
      } else if (timeMs < startMs) {
        // Time is before this word
        right = mid - 1;
      } else {
        // Time is after this word, but it might be the closest
        result = mid;
        left = mid + 1;
      }
    }

    // Return the last word we passed (handles gaps between words)
    return result >= 0 ? result : 0;
  }

  /**
   * Calculate and format time remaining
   * @returns {string} Formatted time remaining (e.g., "2:34")
   */
  getTimeRemaining() {
    const remainingMs = Math.max(0, this._totalDurationMs - this._currentTimeMs);
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Main sync loop using requestAnimationFrame (FR-001, FR-002, FR-003)
   * Uses audio.currentTime as authoritative source and updates on every frame
   * Implements drift detection and auto-correction (FR-006, T046, T047)
   * @private
   */
  _syncLoop() {
    if (!this._isRunning) return;

    // Performance measurement start (T052)
    const syncStart = performance.now();

    // FR-001: Use audio.currentTime as authoritative time source
    if (this._audioElement && !this._audioElement.paused) {
      const audioTimeMs = this._audioElement.currentTime * 1000;

      // Drift detection (FR-006, T046)
      if (this._lastKnownAudioTime > 0) {
        const timeSinceLastSync = syncStart - this._lastSyncTimestamp;
        const expectedTime = this._lastKnownAudioTime + (timeSinceLastSync * this._audioElement.playbackRate);
        this._driftMs = audioTimeMs - expectedTime;

        // FR-006: Auto-correct when drift exceeds threshold (T047)
        if (Math.abs(this._driftMs) > this._driftThresholdMs) {
          console.warn(`VoxPage: Sync drift detected: ${this._driftMs.toFixed(0)}ms - auto-correcting`);
          // Snap to correct position smoothly (don't jarring jump)
          this._currentTimeMs = audioTimeMs;
          this._driftMs = 0;
          // Force immediate word sync update
          if (this.hasWordTiming) {
            const newWordIndex = this._binarySearchWord(audioTimeMs);
            if (newWordIndex !== this._currentWordIndex && this._onWordChange) {
              this._currentWordIndex = newWordIndex;
              this._onWordChange(this._currentParagraphIndex, newWordIndex, Date.now());
            }
          }
        }
      }

      // Always use authoritative audio time - continuous correction
      this._currentTimeMs = audioTimeMs;
      this._lastKnownAudioTime = audioTimeMs;
      this._lastSyncTimestamp = syncStart;
    }

    // NOTE: We do NOT call syncToParagraph() here because VoxPage plays
    // paragraphs one at a time (discrete audio files), not as continuous audio.
    // Paragraph highlighting is handled directly by playCurrentParagraph().
    // The sync loop is ONLY for word-level sync within the current paragraph.

    // Sync word if available (FR-004: <100ms latency)
    if (this.hasWordTiming) {
      this.syncToWord();
    }

    // Report progress
    if (this._onProgress) {
      this._onProgress(this.progressPercent, this.getTimeRemaining());
    }

    // Performance measurement end (T052)
    this._lastSyncDurationMs = performance.now() - syncStart;
    if (this._lastSyncDurationMs > this._maxSyncDurationMs) {
      this._maxSyncDurationMs = this._lastSyncDurationMs;
    }
    // Warn if sync takes longer than 5ms target
    if (this._perfLogging && this._lastSyncDurationMs > 5) {
      console.warn(`VoxPage: Sync loop exceeded 5ms target: ${this._lastSyncDurationMs.toFixed(2)}ms`);
    }

    // Schedule next frame (~60fps, FR-003)
    this._animationFrameId = requestAnimationFrame(() => this._syncLoop());
  }

  /**
   * Start the sync loop (T009)
   * @param {HTMLAudioElement} [audioElement] - Optional audio element to track
   */
  start(audioElement = null) {
    this._audioElement = audioElement;
    this._isRunning = true;

    // NOTE: We do NOT fire onParagraphChange here because VoxPage plays
    // paragraphs one at a time and highlights them directly in playCurrentParagraph().
    // The sync loop is ONLY for word-level sync within the current paragraph.

    this._syncLoop();
  }

  /**
   * Stop the sync loop
   */
  stop() {
    this._isRunning = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Pause the sync loop (maintains state)
   */
  pause() {
    this._isRunning = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Resume the sync loop
   */
  resume() {
    if (!this._isRunning) {
      this._isRunning = true;
      this._syncLoop();
    }
  }

  /**
   * Seek to a specific time (T039)
   * Immediately updates highlight to match new position
   * @param {number} timeMs - Time in milliseconds
   */
  seekTo(timeMs) {
    this._currentTimeMs = Math.max(0, Math.min(timeMs, this._totalDurationMs));

    // Reset drift tracking on seek
    this._lastKnownAudioTime = this._currentTimeMs;
    this._driftMs = 0;

    // Immediately sync to new position (FR-010)
    this.syncToParagraph();
    if (this.hasWordTiming) {
      this.syncToWord();
    }
  }

  /**
   * Seek to a specific paragraph
   * @param {number} paragraphIndex - Paragraph index
   */
  seekToParagraph(paragraphIndex) {
    if (paragraphIndex >= 0 && paragraphIndex < this.paragraphTimeline.length) {
      const timing = this.paragraphTimeline[paragraphIndex];
      this.seekTo(timing.startTimeMs);
    }
  }

  /**
   * Reset sync state (FR-013)
   */
  reset() {
    this.stop();
    this.paragraphTimeline = [];
    this.wordTimeline = null;
    this._currentTimeMs = 0;
    this._totalDurationMs = 0;
    this._currentParagraphIndex = 0;
    this._currentWordIndex = null;
    this._lastSyncTimestamp = 0;
    this._audioElement = null;
    // Reset initial sync flag so next playback fires callback again
    this._hasInitialSyncFired = false;
    this._isTimelineAccurate = false;
    // Reset drift tracking (006-robust-audio-highlight-sync)
    this._lastKnownAudioTime = 0;
    this._driftMs = 0;
    // Reset performance counters (T052)
    this._lastSyncDurationMs = 0;
    this._maxSyncDurationMs = 0;
  }

  /**
   * Handle playback speed change (T048)
   * Word timings scale proportionally with speed
   * @param {number} speed - Playback speed multiplier (e.g., 1.0, 1.5, 2.0)
   */
  setPlaybackSpeed(speed) {
    // Note: Audio element handles actual speed change
    // Timeline doesn't need adjustment as audio.currentTime
    // already reflects actual playback position
    // This method is here for future enhancements if needed
  }
}

/**
 * Normalize word timing data to handle both naming conventions (T004, FR-004)
 * Groq returns startMs/endMs, ElevenLabs returns startTimeMs/endTimeMs
 * @param {Object} rawTiming - Raw word timing object
 * @returns {Object} Normalized timing with consistent property names
 */
export function normalizeWordTiming(rawTiming) {
  if (!rawTiming) return null;

  return {
    word: rawTiming.word || '',
    startTimeMs: rawTiming.startTimeMs ?? rawTiming.startMs ?? (rawTiming.start * 1000) ?? 0,
    endTimeMs: rawTiming.endTimeMs ?? rawTiming.endMs ?? (rawTiming.end * 1000) ?? 0,
    charOffset: rawTiming.charOffset ?? 0,
    charLength: rawTiming.charLength ?? rawTiming.word?.length ?? 0,
    confidence: rawTiming.confidence ?? 1.0
  };
}

/**
 * Normalize an array of word timings (T004)
 * @param {Array} rawTimings - Array of raw word timing objects
 * @returns {Array} Array of normalized timings
 */
export function normalizeWordTimeline(rawTimings) {
  if (!Array.isArray(rawTimings)) return [];
  return rawTimings.map(normalizeWordTiming).filter(t => t !== null);
}

// Export singleton instance for convenience
export const playbackSync = new PlaybackSyncState();
