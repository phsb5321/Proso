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

  constructor(private readonly deps: PlaybackServiceDependencies) {
    this.state = initialPlaybackState;
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
    this.state = playbackStateTransitions.startLoading(this.state, paragraphs, tabId, pageUrl);

    // Show footer and highlight first paragraph
    await this.deps.highlightSync.showFooter(tabId);
    await this.deps.highlightSync.highlightParagraph(tabId, 0, true);

    // Generate audio for first paragraph
    const result = await this.generateAndPlayParagraph(0);
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
    // Stop audio
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }

    // Revoke object URL
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    // Clear highlights and hide footer
    if (this.state.activeTabId !== null) {
      await this.deps.highlightSync.clearHighlights(this.state.activeTabId);
      await this.deps.highlightSync.hideFooter(this.state.activeTabId);
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

    // Generate audio for next paragraph
    const result = await this.generateAndPlayParagraph(this.state.currentParagraphIndex);
    if (isErr(result)) {
      return result;
    }

    return Ok(this.state);
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

    // Generate audio for previous paragraph
    const result = await this.generateAndPlayParagraph(this.state.currentParagraphIndex);
    if (isErr(result)) {
      return result;
    }

    return Ok(this.state);
  }

  /**
   * Seek to specific paragraph.
   */
  async seekToParagraph(index: number): Promise<Result<PlaybackState, PlaybackError>> {
    if (!playbackStateValidation.isValidParagraphIndex(this.state, index)) {
      return Err(playbackError.invalidParagraphIndex(index, this.state.totalParagraphs));
    }

    this.state = playbackStateTransitions.seekToParagraph(this.state, index);

    // Generate audio for target paragraph
    const result = await this.generateAndPlayParagraph(index);
    if (isErr(result)) {
      return result;
    }

    return Ok(this.state);
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

  /**
   * Generate audio for a paragraph and start playing.
   */
  private async generateAndPlayParagraph(
    index: number,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    const text = this.state.paragraphs[index];
    if (!text) {
      return Err(playbackError.invalidParagraphIndex(index, this.state.totalParagraphs));
    }

    // Check cache first
    const cacheKey = this.createCacheKey(index, text);
    const cachedResult = await this.deps.cacheStore.get(cacheKey);

    let audioResponse: AudioResponse;

    if (isOk(cachedResult) && cachedResult.value !== null) {
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
        language: null, // TODO: Add language detection
      };

      const generateResult = await this.deps.audioGenerator.generateAudio(request);

      if (isErr(generateResult)) {
        const error = this.convertAudioError(generateResult.error);
        this.state = playbackStateTransitions.setError(this.state, error);
        return Err(error);
      }

      audioResponse = generateResult.value;

      // Cache the result
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
    }

    // Play the audio
    await this.playAudio(audioResponse.audioBlob);

    // Update state to playing
    this.state = playbackStateTransitions.startPlaying(this.state);

    // Update highlights
    if (this.state.activeTabId !== null) {
      await this.deps.highlightSync.highlightParagraph(this.state.activeTabId, index, true);
    }

    // Update footer state
    await this.updateFooterState();

    return Ok(this.state);
  }

  /**
   * Play audio blob.
   */
  private async playAudio(blob: Blob): Promise<void> {
    // Clean up previous audio
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
    }

    // Create new audio element if needed
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.setupAudioEventListeners();
    }

    // Create object URL and play
    this.currentAudioUrl = URL.createObjectURL(blob);
    this.audioElement.src = this.currentAudioUrl;
    this.audioElement.playbackRate = this.state.speed;

    await this.audioElement.play();
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
      default:
        return playbackError.audioGeneration(
          this.state.provider,
          error.type === 'network' ? error.message : `Provider error: ${error.type}`,
        );
    }
  }

  /**
   * Update footer state in content script.
   */
  private async updateFooterState(): Promise<void> {
    if (this.state.activeTabId === null) return;

    const footerState: FooterState = {
      status: this.state.status,
      currentIndex: this.state.currentParagraphIndex,
      totalParagraphs: this.state.totalParagraphs,
      progress: this.state.progress,
      currentText: this.state.paragraphs[this.state.currentParagraphIndex] ?? '',
      speed: this.state.speed,
    };

    await this.deps.highlightSync.updateFooterState(this.state.activeTabId, footerState);
  }
}
