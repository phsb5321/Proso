/**
 * VoxPage Playback Sync Module
 * Manages synchronization state between audio playback and text highlighting
 *
 * @module utils/audio/playback-sync
 */

import { z } from 'zod';

/**
 * Timing data for a single paragraph
 */
export const paragraphTimingSchema = z.object({
  index: z.number().int().nonnegative(),
  startTimeMs: z.number().nonnegative(),
  endTimeMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});

/**
 * Word boundary data for word-level highlighting
 */
export const wordBoundarySchema = z.object({
  word: z.string(),
  charOffset: z.number().int().nonnegative().optional(),
  charLength: z.number().int().nonnegative().optional(),
  startTimeMs: z.number().nonnegative().optional(),
  endTimeMs: z.number().nonnegative().optional(),
  startMs: z.number().nonnegative().optional(), // Legacy format
  endMs: z.number().nonnegative().optional(), // Legacy format
  start: z.number().nonnegative().optional(), // Legacy format (seconds)
  end: z.number().nonnegative().optional(), // Legacy format (seconds)
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Inferred TypeScript types from Zod schemas
 */
export type ParagraphTiming = z.infer<typeof paragraphTimingSchema>;
export type WordBoundary = z.infer<typeof wordBoundarySchema>;

/**
 * Normalized word boundary with consistent property names
 */
export interface NormalizedWordBoundary {
  word: string;
  startTimeMs: number;
  endTimeMs: number;
  charOffset: number;
  charLength: number;
  confidence: number;
}

/**
 * Callback types
 */
type ParagraphChangeCallback = (paragraphIndex: number, timestamp: number) => void;
type WordChangeCallback = (paragraphIndex: number, wordIndex: number, timestamp: number) => void;
type ProgressCallback = (progressPercent: number, timeRemaining: string) => void;

/**
 * PlaybackSyncState manages the synchronization between audio playback
 * and text highlighting, supporting both paragraph and word-level sync.
 */
export class PlaybackSyncState {
  paragraphTimeline: ParagraphTiming[] = [];
  wordTimeline: NormalizedWordBoundary[] | null = null;

  private _currentTimeMs = 0;
  private _totalDurationMs = 0;
  private _currentParagraphIndex = 0;
  private _currentWordIndex: number | null = null;
  private _lastSyncTimestamp = 0;
  private _isRunning = false;
  private _animationFrameId: number | null = null;
  private _onParagraphChange: ParagraphChangeCallback | null = null;
  private _onWordChange: WordChangeCallback | null = null;
  private _onProgress: ProgressCallback | null = null;
  private _audioElement: HTMLAudioElement | null = null;
  private _hasInitialSyncFired = false;
  private _isTimelineAccurate = false;
  private _lastKnownAudioTime = 0;
  private _driftMs = 0;
  private _driftThresholdMs = 200;
  private _lastSyncDurationMs = 0;
  private _maxSyncDurationMs = 0;
  private _perfLogging = false;
  private _timelineReady = true;
  private _pendingTimelineParagraph = -1;
  private _currentParagraphDurationMs = 0;

  /**
   * Check if timeline is ready for highlighting
   */
  get timelineReady(): boolean {
    return this._timelineReady;
  }

  /**
   * Mark timeline as not ready (called before sending timeline to content)
   */
  setTimelinePending(paragraphIndex: number): void {
    this._timelineReady = false;
    this._pendingTimelineParagraph = paragraphIndex;
  }

  /**
   * Mark timeline as ready (called when TIMELINE_READY ACK received from content)
   */
  setTimelineReady(paragraphIndex: number): void {
    if (paragraphIndex === this._pendingTimelineParagraph || this._pendingTimelineParagraph === -1) {
      this._timelineReady = true;
      this._pendingTimelineParagraph = -1;
    } else {
      console.warn(
        `VoxPage: Ignoring TIMELINE_READY for paragraph ${paragraphIndex}, expected ${this._pendingTimelineParagraph}`
      );
    }
  }

  get currentParagraphIndex(): number {
    return this._currentParagraphIndex;
  }

  get currentTimeMs(): number {
    return this._currentTimeMs;
  }

  get totalDurationMs(): number {
    return this._totalDurationMs;
  }

  get currentWordIndex(): number | null {
    return this._currentWordIndex;
  }

  get hasWordTiming(): boolean {
    return this.wordTimeline !== null && this.wordTimeline.length > 0;
  }

  get progressPercent(): number {
    if (this._totalDurationMs === 0) return 0;
    return Math.min(100, (this._currentTimeMs / this._totalDurationMs) * 100);
  }

  get driftMs(): number {
    return this._driftMs;
  }

  get isDrifting(): boolean {
    return Math.abs(this._driftMs) > this._driftThresholdMs;
  }

  get lastSyncDurationMs(): number {
    return this._lastSyncDurationMs;
  }

  get maxSyncDurationMs(): number {
    return this._maxSyncDurationMs;
  }

  set perfLogging(enabled: boolean) {
    this._perfLogging = enabled;
  }

  /**
   * Build paragraph timeline from paragraphs and estimated durations
   */
  buildParagraphTimeline(paragraphs: string[], totalDurationMs: number): void {
    this._totalDurationMs = totalDurationMs;
    this.paragraphTimeline = [];

    if (paragraphs.length === 0) return;

    const wordCounts = paragraphs.map((p) => p.split(/\s+/).filter((w) => w.length > 0).length);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);

    if (totalWords === 0) {
      const durationPerParagraph = totalDurationMs / paragraphs.length;
      let currentTime = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        this.paragraphTimeline.push({
          index: i,
          startTimeMs: currentTime,
          endTimeMs: currentTime + durationPerParagraph,
          durationMs: durationPerParagraph,
        });
        currentTime += durationPerParagraph;
      }
    } else {
      let currentTime = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        const proportion = wordCounts[i] / totalWords;
        const durationMs = totalDurationMs * proportion;

        this.paragraphTimeline.push({
          index: i,
          startTimeMs: currentTime,
          endTimeMs: currentTime + durationMs,
          durationMs: durationMs,
        });
        currentTime += durationMs;
      }
    }

    this._currentParagraphIndex = 0;
    this._currentTimeMs = 0;
    this._isTimelineAccurate = false;
  }

  /**
   * Rebuild timeline with actual audio duration
   */
  rebuildTimelineWithDuration(actualDurationMs: number): void {
    if (this.paragraphTimeline.length === 0) return;
    if (this._totalDurationMs === 0) return;

    const scaleFactor = actualDurationMs / this._totalDurationMs;

    for (let i = 0; i < this.paragraphTimeline.length; i++) {
      const timing = this.paragraphTimeline[i];
      timing.startTimeMs = timing.startTimeMs * scaleFactor;
      timing.endTimeMs = timing.endTimeMs * scaleFactor;
      timing.durationMs = timing.durationMs * scaleFactor;
    }

    for (let i = 0; i < this.paragraphTimeline.length - 1; i++) {
      const current = this.paragraphTimeline[i];
      const next = this.paragraphTimeline[i + 1];
      current.endTimeMs = next.startTimeMs;
      current.durationMs = current.endTimeMs - current.startTimeMs;
    }

    if (this.paragraphTimeline.length > 0) {
      const last = this.paragraphTimeline[this.paragraphTimeline.length - 1];
      last.endTimeMs = actualDurationMs;
      last.durationMs = last.endTimeMs - last.startTimeMs;
    }

    this._totalDurationMs = actualDurationMs;
    this._isTimelineAccurate = true;
  }

  /**
   * Set word timeline for the current paragraph
   */
  setWordTimeline(wordTimeline: WordBoundary[]): void {
    this.wordTimeline = normalizeWordTimeline(wordTimeline);
    this._currentWordIndex = this.wordTimeline && this.wordTimeline.length > 0 ? 0 : null;
  }

  /**
   * Set the actual duration for the current paragraph's audio
   */
  setCurrentParagraphDuration(durationMs: number): void {
    this._currentParagraphDurationMs = durationMs;

    if (this.wordTimeline && this.wordTimeline.length > 0) {
      const lastWord = this.wordTimeline[this.wordTimeline.length - 1];
      const estimatedDuration = lastWord.endTimeMs;

      if (estimatedDuration > 0 && Math.abs(durationMs - estimatedDuration) > 100) {
        const scaleFactor = durationMs / estimatedDuration;
        console.log(
          `VoxPage: Scaling word timings by ${scaleFactor.toFixed(2)} (${estimatedDuration}ms -> ${durationMs}ms)`
        );

        for (const word of this.wordTimeline) {
          word.startTimeMs = Math.round(word.startTimeMs * scaleFactor);
          word.endTimeMs = Math.round(word.endTimeMs * scaleFactor);
        }
      }
    }
  }

  /**
   * Clear word timeline (fallback to paragraph-only)
   */
  clearWordTimeline(): void {
    this.wordTimeline = null;
    this._currentWordIndex = null;
  }

  /**
   * Register callback for paragraph changes
   */
  onParagraphChange(callback: ParagraphChangeCallback): void {
    this._onParagraphChange = callback;
  }

  /**
   * Register callback for word changes
   */
  onWordChange(callback: WordChangeCallback): void {
    this._onWordChange = callback;
  }

  /**
   * Register callback for progress updates
   */
  onProgress(callback: ProgressCallback): void {
    this._onProgress = callback;
  }

  /**
   * Sync to the correct paragraph based on current time
   * @private
   */
  private syncToParagraph(): void {
    if (this.paragraphTimeline.length === 0) return;

    const currentTime = this._currentTimeMs;
    let newIndex = this._currentParagraphIndex;
    let foundExact = false;

    for (let i = 0; i < this.paragraphTimeline.length; i++) {
      const timing = this.paragraphTimeline[i];
      if (currentTime >= timing.startTimeMs && currentTime < timing.endTimeMs) {
        newIndex = i;
        foundExact = true;
        break;
      }
      if (i === this.paragraphTimeline.length - 1 && currentTime >= timing.startTimeMs) {
        newIndex = i;
        foundExact = true;
      }
    }

    if (!foundExact && this.paragraphTimeline.length > 0) {
      if (currentTime < this.paragraphTimeline[0].startTimeMs) {
        newIndex = 0;
      } else {
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
      this._lastSyncTimestamp = performance.now();

      if (this._onParagraphChange) {
        this._onParagraphChange(newIndex, Date.now());
      }
    }
  }

  /**
   * Sync to the correct word based on current time
   * Uses binary search for efficiency with large word lists (O(log n) vs O(n))
   * @private
   */
  private syncToWord(): void {
    if (!this.wordTimeline || this.wordTimeline.length === 0) return;

    const currentTime = this._currentTimeMs;
    const newWordIndex = this._binarySearchWord(currentTime);

    if (newWordIndex !== this._currentWordIndex) {
      this._currentWordIndex = newWordIndex;
      this._lastSyncTimestamp = performance.now();

      if (this._onWordChange && newWordIndex !== null) {
        this._onWordChange(this._currentParagraphIndex, newWordIndex, Date.now());
      }
    }
  }

  /**
   * Binary search to find the word index for a given time
   * @private
   */
  private _binarySearchWord(timeMs: number): number {
    const timeline = this.wordTimeline;
    if (!timeline || timeline.length === 0) return -1;

    let left = 0;
    let right = timeline.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const word = timeline[mid];
      const startMs = word.startTimeMs;
      const endMs = word.endTimeMs;

      if (timeMs >= startMs && timeMs < endMs) {
        return mid;
      } else if (timeMs < startMs) {
        right = mid - 1;
      } else {
        result = mid;
        left = mid + 1;
      }
    }

    return result >= 0 ? result : 0;
  }

  /**
   * Calculate and format time remaining
   */
  getTimeRemaining(): string {
    const remainingMs = Math.max(0, this._totalDurationMs - this._currentTimeMs);
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Main sync loop using requestAnimationFrame
   * @private
   */
  private _syncLoop(): void {
    if (!this._isRunning) return;

    const syncStart = performance.now();

    if (this._audioElement && !this._audioElement.paused) {
      const audioTimeMs = this._audioElement.currentTime * 1000;

      if (this._lastKnownAudioTime > 0) {
        const timeSinceLastSync = syncStart - this._lastSyncTimestamp;
        const expectedTime =
          this._lastKnownAudioTime + timeSinceLastSync * this._audioElement.playbackRate;
        this._driftMs = audioTimeMs - expectedTime;

        if (Math.abs(this._driftMs) > this._driftThresholdMs) {
          console.warn(`VoxPage: Sync drift detected: ${this._driftMs.toFixed(0)}ms - auto-correcting`);
          this._currentTimeMs = audioTimeMs;
          this._driftMs = 0;
          if (this.hasWordTiming) {
            const newWordIndex = this._binarySearchWord(audioTimeMs);
            if (newWordIndex !== this._currentWordIndex && this._onWordChange) {
              this._currentWordIndex = newWordIndex;
              this._onWordChange(this._currentParagraphIndex, newWordIndex, Date.now());
            }
          }
        }
      }

      this._currentTimeMs = audioTimeMs;
      this._lastKnownAudioTime = audioTimeMs;
      this._lastSyncTimestamp = syncStart;
    }

    if (this.hasWordTiming && this._timelineReady) {
      this.syncToWord();
    } else if (this.hasWordTiming && !this._timelineReady) {
      if (this._perfLogging) {
        console.debug('VoxPage: Skipping word sync - timeline not ready yet');
      }
    }

    if (this._onProgress) {
      this._onProgress(this.progressPercent, this.getTimeRemaining());
    }

    this._lastSyncDurationMs = performance.now() - syncStart;
    if (this._lastSyncDurationMs > this._maxSyncDurationMs) {
      this._maxSyncDurationMs = this._lastSyncDurationMs;
    }
    if (this._perfLogging && this._lastSyncDurationMs > 5) {
      console.warn(`VoxPage: Sync loop exceeded 5ms target: ${this._lastSyncDurationMs.toFixed(2)}ms`);
    }

    this._animationFrameId = requestAnimationFrame(() => this._syncLoop());
  }

  /**
   * Start the sync loop
   */
  start(audioElement: HTMLAudioElement | null = null): void {
    this._audioElement = audioElement;
    this._isRunning = true;
    this._syncLoop();
  }

  /**
   * Stop the sync loop
   */
  stop(): void {
    this._isRunning = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Pause the sync loop (maintains state)
   */
  pause(): void {
    this._isRunning = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Resume the sync loop
   */
  resume(): void {
    if (!this._isRunning) {
      this._isRunning = true;
      this._syncLoop();
    }
  }

  /**
   * Seek to a specific time
   */
  seekTo(timeMs: number): void {
    this._currentTimeMs = Math.max(0, Math.min(timeMs, this._totalDurationMs));
    this._lastKnownAudioTime = this._currentTimeMs;
    this._driftMs = 0;
    this.syncToParagraph();
    if (this.hasWordTiming) {
      this.syncToWord();
    }
  }

  /**
   * Seek to a specific paragraph
   */
  seekToParagraph(paragraphIndex: number): void {
    if (paragraphIndex >= 0 && paragraphIndex < this.paragraphTimeline.length) {
      const timing = this.paragraphTimeline[paragraphIndex];
      this.seekTo(timing.startTimeMs);
    }
  }

  /**
   * Reset sync state
   */
  reset(): void {
    this.stop();
    this.paragraphTimeline = [];
    this.wordTimeline = null;
    this._currentTimeMs = 0;
    this._totalDurationMs = 0;
    this._currentParagraphIndex = 0;
    this._currentWordIndex = null;
    this._lastSyncTimestamp = 0;
    this._audioElement = null;
    this._hasInitialSyncFired = false;
    this._isTimelineAccurate = false;
    this._lastKnownAudioTime = 0;
    this._driftMs = 0;
    this._lastSyncDurationMs = 0;
    this._maxSyncDurationMs = 0;
    this._timelineReady = true;
    this._pendingTimelineParagraph = -1;
  }

  /**
   * Handle playback speed change
   */
  setPlaybackSpeed(speed: number): void {
    // Note: Audio element handles actual speed change
    // Timeline doesn't need adjustment as audio.currentTime
    // already reflects actual playback position
  }
}

/**
 * Normalize word timing data to handle both naming conventions
 */
export function normalizeWordTiming(rawTiming: WordBoundary): NormalizedWordBoundary {
  const usedLegacyFormat = rawTiming.startMs !== undefined || rawTiming.start !== undefined;
  if (usedLegacyFormat) {
    console.debug('VoxPage: normalizeWordTiming converting legacy format', {
      hasStartMs: rawTiming.startMs !== undefined,
      hasStart: rawTiming.start !== undefined,
      word: rawTiming.word,
    });
  }

  return {
    word: rawTiming.word || '',
    startTimeMs:
      rawTiming.startTimeMs ??
      rawTiming.startMs ??
      (rawTiming.start !== undefined ? rawTiming.start * 1000 : 0),
    endTimeMs:
      rawTiming.endTimeMs ?? rawTiming.endMs ?? (rawTiming.end !== undefined ? rawTiming.end * 1000 : 0),
    charOffset: rawTiming.charOffset ?? 0,
    charLength: rawTiming.charLength ?? rawTiming.word?.length ?? 0,
    confidence: rawTiming.confidence ?? 1.0,
  };
}

/**
 * Normalize an array of word timings
 */
export function normalizeWordTimeline(rawTimings: WordBoundary[]): NormalizedWordBoundary[] {
  if (!Array.isArray(rawTimings)) return [];
  return rawTimings.map(normalizeWordTiming);
}

// Export singleton instance for convenience
export const playbackSync = new PlaybackSyncState();
