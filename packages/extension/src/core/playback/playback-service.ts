/**
 * Playback Service
 *
 * Core domain service for TTS playback orchestration.
 * Coordinates audio generation, caching, and highlight synchronization.
 *
 * @module core/playback/playback-service
 */

import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
} from '../../ports/audio-generator.port';
import type { IAudioUrlProvider } from '../../ports/audio-url.port';
import type { CacheEntry, CacheKey, ICacheStore } from '../../ports/cache-store.port';
import type { FooterState, IHighlightSynchronizer } from '../../ports/highlight-sync.port';
import type { ISettingsStore, Settings } from '../../ports/settings-store.port';
import type { AudioError, ExtractionMode, PlaybackError, ProviderId } from '../shared/errors';
import { playbackError } from '../shared/errors';
import type { Result } from '../shared/result';
import { Err, Ok, isErr, isOk } from '../shared/result';
import {
  type PlaybackState,
  initialPlaybackState,
  playbackStateTransitions,
  playbackStateValidation,
} from './playback-state';

/**
 * Dependencies required by PlaybackService.
 */
export interface PlaybackServiceDependencies {
  readonly audioGenerator: IAudioGenerator;
  readonly audioUrlProvider: IAudioUrlProvider;
  readonly cacheStore: ICacheStore;
  readonly highlightSync: IHighlightSynchronizer;
  readonly settingsStore: ISettingsStore;
}

/**
 * Playback service for TTS audio orchestration.
 */
export class PlaybackService {
  private state: PlaybackState;
  private audioElement: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private playbackGeneration = 0;

  // Detected page language (set externally via setLanguage)
  private detectedLanguage: string | null = null;

  // Word-level sync state
  private currentWordTimings: Array<{
    word: string;
    charOffset: number;
    charLength: number;
    startTimeMs: number;
    endTimeMs: number;
  }> = [];
  private currentWordIndex = -1;

  // Mutable audio generator reference (updated on provider switch)
  private audioGenerator: IAudioGenerator;

  constructor(private readonly deps: PlaybackServiceDependencies) {
    this.state = initialPlaybackState;
    this.audioGenerator = deps.audioGenerator;
  }

  /**
   * Replace the audio generator (called when provider is switched).
   * This fixes the stale reference issue where PlaybackService held
   * a reference to the old generator after container reconfiguration.
   */
  setAudioGenerator(generator: IAudioGenerator): void {
    this.audioGenerator = generator;
  }

  /**
   * Get current playback state.
   */
  getState(): PlaybackState {
    return this.state;
  }

  /**
   * Start playback from extracted paragraphs.
   */
  async start(
    paragraphs: readonly string[],
    tabId: number,
    pageUrl: string,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    // Validate we can start
    if (!playbackStateValidation.canStart(this.state)) {
      // If already playing, stop first
      await this.stop();
    }

    // Validate content
    if (paragraphs.length === 0) {
      const error = playbackError.noContent(this.state.mode);
      this.state = playbackStateTransitions.setError(this.state, error);
      return Err(error);
    }

    // Update state to loading
    const generation = ++this.playbackGeneration;
    this.state = playbackStateTransitions.startLoading(this.state, paragraphs, tabId, pageUrl);

    // Show footer and highlight first paragraph
    await this.deps.highlightSync.showFooter(tabId);
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);
    await this.deps.highlightSync.highlightParagraph(
      tabId,
      0,
      true,
      paragraphs[0] ?? '',
      Date.now(),
    );
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    // Generate audio for first paragraph
    const result = await this.generateAndPlayParagraph(0, generation);
    if (isErr(result)) {
      return result;
    }

    return Ok(this.state);
  }

  /**
   * Pause current playback.
   */
  async pause(): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.canPause(this.state)) {
      return Err(playbackError.playbackFailed('Cannot pause: not playing'));
    }

    this.audioElement?.pause();

    this.state = playbackStateTransitions.pause(this.state);

    // Update footer state
    await this.updateFooterState();

    return Ok(this.state);
  }

  /**
   * Resume paused playback.
   */
  async resume(): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.canResume(this.state)) {
      return Err(playbackError.playbackFailed('Cannot resume: not paused'));
    }

    this.audioElement?.play();

    this.state = playbackStateTransitions.resume(this.state);

    // Update footer state
    await this.updateFooterState();

    return Ok(this.state);
  }

  /**
   * Stop playback and reset.
   */
  async stop(): Promise<Result<PlaybackState, PlaybackError>> {
    const generation = ++this.playbackGeneration;

    // Stop audio element playback
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }

    // Revoke object URL (no-op for data URLs)
    this.deps.audioUrlProvider.revokeUrl(this.currentAudioUrl);
    this.currentAudioUrl = null;

    // Clear word timings
    this.clearWordTimings();

    // Clear highlights and hide footer
    if (this.state.activeTabId !== null) {
      await this.deps.highlightSync.clearHighlights(this.state.activeTabId);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);
      await this.deps.highlightSync.hideFooter(this.state.activeTabId);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);
    }

    this.state = playbackStateTransitions.stop(this.state);

    return Ok(this.state);
  }

  /**
   * Move to next paragraph.
   */
  async next(): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.hasNext(this.state)) {
      // At end, stop playback
      return this.stop();
    }

    this.state = playbackStateTransitions.nextParagraph(this.state);
    return this.generateCurrentParagraph();
  }

  /**
   * Move to previous paragraph.
   */
  async previous(): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.hasPrevious(this.state)) {
      // At beginning, restart current paragraph
      return this.seek(0);
    }

    this.state = playbackStateTransitions.previousParagraph(this.state);
    return this.generateCurrentParagraph();
  }

  /**
   * Seek to specific paragraph.
   */
  async seekToParagraph(index: number): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.isValidParagraphIndex(this.state, index)) {
      return Err(playbackError.invalidParagraphIndex(index, this.state.totalParagraphs));
    }

    this.state = playbackStateTransitions.seekToParagraph(this.state, index);
    return this.generateCurrentParagraph();
  }

  /**
   * Seek within current paragraph (0-1 progress).
   */
  async seek(progress: number): Promise<Result<PlaybackState, PlaybackError>> {
    if (this.audioElement && this.audioElement.duration) {
      this.audioElement.currentTime = progress * this.audioElement.duration;
    }

    this.state = playbackStateTransitions.updateProgress(this.state, progress);

    return Ok(this.state);
  }

  /**
   * Update playback speed.
   */
  async setSpeed(speed: number): Promise<Result<PlaybackState, PlaybackError>> {
    // Clamp speed to valid range
    const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));

    this.state = playbackStateTransitions.updateSettings(this.state, {
      speed: clampedSpeed,
    });

    // Update audio element playback rate
    if (this.audioElement) {
      this.audioElement.playbackRate = clampedSpeed;
    }

    // Update footer state
    await this.updateFooterState();

    return Ok(this.state);
  }

  /**
   * Update provider (requires regenerating audio).
   */
  async setProvider(provider: ProviderId): Promise<void> {
    this.state = playbackStateTransitions.updateSettings(this.state, {
      provider,
    });
  }

  /**
   * Update voice (requires regenerating audio).
   */
  async setVoice(voice: string | null): Promise<void> {
    this.state = playbackStateTransitions.updateSettings(this.state, {
      voice,
    });
  }

  /**
   * Set detected language for audio requests.
   */
  setLanguage(language: string | null): void {
    this.detectedLanguage = language;
  }

  /**
   * Update extraction mode.
   */
  async setMode(mode: ExtractionMode): Promise<void> {
    this.state = playbackStateTransitions.updateSettings(this.state, {
      mode,
    });
  }

  /**
   * Subscribe to settings changes.
   */
  subscribeToSettings(): void {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }

    this.settingsUnsubscribe = this.deps.settingsStore.subscribe((settings: Settings) => {
      this.state = playbackStateTransitions.updateSettings(this.state, {
        provider: settings.provider,
        voice: settings.voice,
        speed: settings.speed,
        mode: settings.mode,
      });
    });
  }

  /**
   * Unsubscribe from settings changes.
   */
  unsubscribeFromSettings(): void {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.unsubscribeFromSettings();
    this.stop();
    this.audioElement = null;
  }

  // Private methods

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.playbackGeneration;
  }

  private generateCurrentParagraph(): Promise<Result<PlaybackState, PlaybackError>> {
    const generation = ++this.playbackGeneration;
    return this.generateAndPlayParagraph(this.state.currentParagraphIndex, generation);
  }
  /**
   * Convert provider word timings (startMs/endMs) to internal format with charOffset/charLength.
   * Matches each provider word against the paragraph text sequentially.
   */
  private convertProviderTimings(
    providerTimings: readonly { word: string; startMs: number; endMs: number }[],
    paragraphText: string,
  ): Array<{
    word: string;
    charOffset: number;
    charLength: number;
    startTimeMs: number;
    endTimeMs: number;
  }> {
    const result: Array<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }> = [];

    let searchFrom = 0;

    for (const wt of providerTimings) {
      const wordClean = wt.word.trim();
      if (!wordClean) continue;

      const idx = paragraphText.indexOf(wordClean, searchFrom);
      if (idx >= 0) {
        result.push({
          word: wordClean,
          charOffset: idx,
          charLength: wordClean.length,
          startTimeMs: wt.startMs,
          endTimeMs: wt.endMs,
        });
        searchFrom = idx + wordClean.length;
      } else {
        result.push({
          word: wordClean,
          charOffset: searchFrom,
          charLength: wordClean.length,
          startTimeMs: wt.startMs,
          endTimeMs: wt.endMs,
        });
      }
    }

    return result;
  }

  /**
   * Count syllables in a word using vowel cluster heuristic.
   */
  private countSyllables(word: string): number {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!clean) return 1;

    const vowelClusters = clean.match(/[aeiouy]+/g);
    let count = vowelClusters ? vowelClusters.length : 1;

    // Subtract silent 'e' at end (but not for short words like "the")
    if (clean.length > 3 && clean.endsWith('e') && !/[aeiouy]e$/i.test(clean.slice(-2))) {
      count = Math.max(1, count - 1);
    }

    return Math.max(1, count);
  }

  /**
   * Check if text contains primarily Latin-script characters.
   */
  private isLatinScript(text: string): boolean {
    const latinChars = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, '').length;
    const totalAlpha = text.replace(
      /[^a-zA-Z\u00C0-\u024F\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF]/g,
      '',
    ).length;
    return totalAlpha === 0 || latinChars / totalAlpha > 0.5;
  }

  /**
   * Estimate word timings by distributing duration proportionally by syllable count (Latin)
   * or character count (non-Latin).
   */
  private estimateWordTimings(
    text: string,
    durationMs: number,
  ): Array<{
    word: string;
    charOffset: number;
    charLength: number;
    startTimeMs: number;
    endTimeMs: number;
  }> {
    const words: Array<{ word: string; charOffset: number; charLength: number }> = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      words.push({
        word: match[0],
        charOffset: match.index,
        charLength: match[0].length,
      });
    }

    if (words.length === 0) return [];

    const useSyllables = this.isLatinScript(text);
    const weights = words.map((w) => (useSyllables ? this.countSyllables(w.word) : w.charLength));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return [];

    const timings: Array<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }> = [];
    let currentTimeMs = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      const wordDurationMs = (weights[i]! / totalWeight) * durationMs;
      timings.push({
        word: w.word,
        charOffset: w.charOffset,
        charLength: w.charLength,
        startTimeMs: currentTimeMs,
        endTimeMs: currentTimeMs + wordDurationMs,
      });
      currentTimeMs += wordDurationMs;
    }

    return timings;
  }

  /**
   * Binary search for the word index at a given playback time.
   */
  private findWordIndexAtTime(timeMs: number): number {
    const timings = this.currentWordTimings;
    if (timings.length === 0) return -1;

    // If before first word, return -1
    if (timeMs < timings[0]!.startTimeMs) return -1;
    // If at or past last word start, return last
    if (timeMs >= timings[timings.length - 1]!.startTimeMs) return timings.length - 1;

    let lo = 0;
    let hi = timings.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = timings[mid]!;
      if (timeMs >= entry.startTimeMs && timeMs < entry.endTimeMs) {
        return mid;
      }
      if (timeMs < entry.startTimeMs) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    return lo < timings.length ? lo : timings.length - 1;
  }

  /**
   * Clear word sync state.
   */
  private clearWordTimings(): void {
    this.currentWordTimings = [];
    this.currentWordIndex = -1;
  }

  /**
   * Generate audio for a paragraph and start playing.
   */
  private async generateAndPlayParagraph(
    index: number,
    generation: number,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    // Clear previous word timings on paragraph transition
    this.clearWordTimings();

    const text = this.state.paragraphs[index];
    if (!text) {
      return Err(playbackError.invalidParagraphIndex(index, this.state.totalParagraphs));
    }

    // Check cache first
    const cacheKey = this.createCacheKey(index, text);
    const cachedResult = await this.deps.cacheStore.get(cacheKey);
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    let audioResponse: AudioResponse;

    if (
      isOk(cachedResult) &&
      cachedResult.value !== null &&
      // T030: Treat 0-byte cache entries as cache misses
      cachedResult.value.sizeBytes > 0 &&
      cachedResult.value.audioBlob.size > 0
    ) {
      // Use cached audio
      audioResponse = {
        audioBlob: cachedResult.value.audioBlob,
        durationMs: cachedResult.value.durationMs,
        wordTimings: cachedResult.value.wordTimings,
      };
    } else {
      // Generate new audio
      const request: AudioRequest = {
        text,
        voice: this.state.voice,
        speed: this.state.speed,
        language: this.detectedLanguage,
      };

      console.log('[PlaybackService] Generating audio with:', this.audioGenerator.constructor.name);
      const generateResult = await this.audioGenerator.generateAudio(request);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);

      if (isErr(generateResult)) {
        console.error('[PlaybackService] Audio generation failed:', generateResult.error);
        const error = this.convertAudioError(generateResult.error);
        this.state = playbackStateTransitions.setError(this.state, error);
        return Err(error);
      }

      audioResponse = generateResult.value;

      // Cache the generated audio
      const cacheEntry: CacheEntry = {
        audioBlob: audioResponse.audioBlob,
        durationMs: audioResponse.durationMs,
        wordTimings: audioResponse.wordTimings,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        sizeBytes: audioResponse.audioBlob.size,
      };

      await this.deps.cacheStore.set(cacheKey, cacheEntry);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);
    }

    // Play the audio via HTMLAudioElement
    const played = await this.playAudio(audioResponse.audioBlob, generation);
    if (!played) return Ok(this.state);

    // Update state to playing
    this.state = playbackStateTransitions.startPlaying(this.state);

    // Update highlights
    if (this.state.activeTabId !== null) {
      const paragraphText = this.state.paragraphs[index] ?? '';
      await this.deps.highlightSync.highlightParagraph(
        this.state.activeTabId,
        index,
        true,
        paragraphText,
        Date.now(),
      );
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);

      // Use real provider word timings when available, else estimate
      const audioDurationMs = this.audioElement?.duration
        ? this.audioElement.duration * 1000
        : (audioResponse.durationMs ?? 0);

      if (audioDurationMs > 0) {
        let wordTimings: Array<{
          word: string;
          charOffset: number;
          charLength: number;
          startTimeMs: number;
          endTimeMs: number;
        }>;

        if (audioResponse.wordTimings && audioResponse.wordTimings.length > 0) {
          // Use real provider timestamps (e.g. ElevenLabs, cached entries)
          wordTimings = this.convertProviderTimings(audioResponse.wordTimings, paragraphText);
        } else {
          wordTimings = this.estimateWordTimings(paragraphText, audioDurationMs);
        }

        this.currentWordTimings = wordTimings;
        this.currentWordIndex = -1;

        if (wordTimings.length > 0) {
          await this.deps.highlightSync.setWordTimeline(this.state.activeTabId, index, wordTimings);
          if (!this.isCurrentGeneration(generation)) return Ok(this.state);
        }
      }
    }

    // Update footer state
    await this.updateFooterState();
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    return Ok(this.state);
  }

  /**
   * Play audio blob.
   */
  private async playAudio(blob: Blob, generation: number): Promise<boolean> {
    if (!this.isCurrentGeneration(generation)) return false;

    // Clean up previous audio (no-op for data URLs)
    this.deps.audioUrlProvider.revokeUrl(this.currentAudioUrl);

    // Create new audio element if needed
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.setupAudioEventListeners();
    }

    // Create audio URL (uses data URL in service worker, blob URL in DOM)
    const audioUrl = await this.deps.audioUrlProvider.createUrl(blob);
    if (!this.isCurrentGeneration(generation)) {
      this.deps.audioUrlProvider.revokeUrl(audioUrl);
      return false;
    }
    this.currentAudioUrl = audioUrl;
    this.audioElement.src = this.currentAudioUrl;
    this.audioElement.playbackRate = this.state.speed;

    await this.audioElement.play();
    return this.isCurrentGeneration(generation);
  }

  /**
   * Set up audio element event listeners.
   */
  private setupAudioEventListeners(): void {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement && this.audioElement.duration) {
        const progress = this.audioElement.currentTime / this.audioElement.duration;
        this.state = playbackStateTransitions.updateProgress(this.state, progress);
        this.updateFooterState();

        // Send audio position to content script for rAF-based word sync
        if (this.state.activeTabId !== null) {
          const currentTimeMs = this.audioElement.currentTime * 1000;
          this.deps.highlightSync.sendAudioPosition(
            this.state.activeTabId,
            currentTimeMs,
            !this.audioElement.paused,
            this.state.speed,
          );
        }
      }
    });

    this.audioElement.addEventListener('ended', () => {
      // Move to next paragraph
      this.next();
    });

    this.audioElement.addEventListener('error', () => {
      const error = playbackError.playbackFailed('Audio playback error');
      this.state = playbackStateTransitions.setError(this.state, error);
    });
  }

  /**
   * Create cache key for a paragraph.
   */
  private createCacheKey(index: number, text: string): CacheKey {
    // Simple hash function for content
    const contentHash = this.hashString(text);
    const urlHash = this.hashString(this.state.currentPageUrl ?? '');

    return {
      urlHash,
      paragraphIndex: index,
      provider: this.state.provider,
      voice: this.state.voice ?? 'default',
      contentHash,
    };
  }

  /**
   * Simple string hash (djb2).
   */
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Convert AudioError to PlaybackError.
   */
  private convertAudioError(error: AudioError): PlaybackError {
    switch (error.type) {
      case 'invalid_credentials':
        return playbackError.providerUnavailable(this.state.provider);
      case 'provider_error':
        return playbackError.audioGeneration(
          this.state.provider,
          error.message || `Provider error: ${error.code}`,
        );
      default:
        return playbackError.audioGeneration(
          this.state.provider,
          'message' in error ? error.message : `Audio error: ${error.type}`,
        );
    }
  }

  /**
   * Update footer state in content script.
   */
  private async updateFooterState(): Promise<void> {
    if (this.state.activeTabId === null) return;

    // Estimate current/total time from progress and paragraph count
    const avgSecondsPerParagraph = 15; // rough estimate
    const totalSeconds = this.state.totalParagraphs * avgSecondsPerParagraph;
    const currentSeconds = Math.round(this.state.progress * totalSeconds);
    const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const footerState: FooterState = {
      status: this.state.status,
      currentIndex: this.state.currentParagraphIndex,
      totalParagraphs: this.state.totalParagraphs,
      progress: this.state.progress,
      currentTime: formatTime(currentSeconds),
      totalTime: formatTime(totalSeconds),
      speed: this.state.speed,
    };

    await this.deps.highlightSync.updateFooterState(this.state.activeTabId, footerState);
  }
}
