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
import type { PlaybackQueue } from '../../utils/playback/playback-queue';
import type { PrefetchService, PrefetchedAudio } from '../../utils/playback/prefetch';
import type {
  AudioError,
  ExtractionMode,
  HighlightError,
  PlaybackError,
  ProviderId,
} from '../shared/errors';
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
  /**
   * Optional lookahead prefetch pipeline (S3, T012). When absent, playback
   * degrades to the pre-existing serial cache→network path unchanged — every
   * test that constructs a PlaybackService without this field keeps working.
   */
  readonly prefetch?: {
    readonly service: PrefetchService;
    readonly queue: PlaybackQueue;
  };
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
  // Real cancellation of the in-flight generateAudio call for the current
  // generation (T015) — replaces "let it finish, discard via generation
  // check" with an actual abort, so a superseded fetch stops consuming
  // network/credits instead of completing uselessly.
  private currentAbortController: AbortController | null = null;

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
      await this.setError(error, tabId);
      return Err(error);
    }

    // Update state to loading
    const generation = this.beginGeneration();
    this.state = playbackStateTransitions.startLoading(this.state, paragraphs, tabId, pageUrl);

    // Show footer and highlight first paragraph
    const footerResult = await this.deps.highlightSync.showFooter(tabId);
    await this.checkHighlight('showFooter', footerResult);
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);
    const firstHighlightResult = await this.deps.highlightSync.highlightParagraph(
      tabId,
      0,
      true,
      paragraphs[0] ?? '',
      Date.now(),
    );
    await this.checkHighlight('highlightParagraph', firstHighlightResult);
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    // Wire the prefetch pipeline to the new paragraph sequence (T014) before
    // the first paragraph's own fetch starts, so index 0 is already marked
    // 'playing' (excluded from the prefetch window) by the time the queue
    // computes it — avoids a duplicate fetch for the paragraph about to play.
    if (this.deps.prefetch) {
      this.deps.prefetch.queue.initialize([...paragraphs], { startIndex: 0 });
      this.deps.prefetch.queue.start(0);
      this.deps.prefetch.service.start();
    }

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

    // Halt prefetch while paused (FR-010) — buffered entries are kept, only
    // new fetches stop starting; resume() restarts from the same position.
    this.deps.prefetch?.queue.pause();
    this.deps.prefetch?.service.stop();

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

    // Awaiting play() below opens a window this method never used to have, and
    // `stop()` is not gated on status — it can land inside it, clearing the
    // element's source and the prefetch buffer. Writing `playing` afterwards
    // would resurrect a session the reader ended, which is the same lie about
    // one status this whole change exists to remove. The generation counter
    // stop()/start() already bump is the seam for noticing.
    const generation = this.playbackGeneration;

    // This play() has to be awaited and funnelled, not fired and forgotten.
    // A pause taken during a paragraph transition leaves attachAndPlay() having
    // deliberately skipped its own play(), so the element here holds a source it
    // has never played — this is the FIRST play() for that clip, and the two
    // rejections describePlayError() names (autoplay policy, undecodable blob)
    // land here rather than there. Dropping one would leave the reader watching
    // a footer that claims `playing` over an element that is silent, with no
    // error and nothing to press.
    if (this.audioElement) {
      try {
        await this.audioElement.play();
      } catch (error) {
        if (!this.isCurrentGeneration(generation)) return Ok(this.state);
        const failure = this.describePlayError(error);
        await this.setError(failure);
        return Err(failure);
      }
    }

    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    this.deps.prefetch?.queue.start();
    this.deps.prefetch?.service.start();

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

    // Abort whatever the current generation was still fetching (T015) rather
    // than letting it complete and discarding the result.
    this.currentAbortController?.abort();
    this.currentAbortController = null;

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
    this.resetChunkState(-1);

    // Halt and discard prefetch state — a stopped sequence must not keep
    // fetching or hold onto blob URLs for paragraphs that won't play (FR-010,
    // FR-011). clearBuffer() revokes every buffered blob URL itself.
    this.deps.prefetch?.service.stop();
    this.deps.prefetch?.service.clearBuffer();
    this.deps.prefetch?.queue.stop();

    // Clear highlights and hide footer
    if (this.state.activeTabId !== null) {
      const clearResult = await this.deps.highlightSync.clearHighlights(this.state.activeTabId);
      await this.checkHighlight('clearHighlights', clearResult, false);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);
      const hideResult = await this.deps.highlightSync.hideFooter(this.state.activeTabId);
      await this.checkHighlight('hideFooter', hideResult, false);
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
    // Forward advance by exactly one — mirrors the queue's own advance()
    // semantics (marks the left paragraph 'completed', not just 'ready').
    this.deps.prefetch?.queue.advance();
    // A paragraph transition ends any in-flight chunk sequence (PROSO-110).
    this.resetChunkState(-1);
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
    // Backward move is a re-target, not an advance — jumpTo() re-derives the
    // prefetch window around the new position (FR-010).
    this.deps.prefetch?.queue.jumpTo(this.state.currentParagraphIndex);
    // A re-target ends any in-flight chunk sequence (PROSO-110).
    this.resetChunkState(-1);
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
    // Arbitrary jump — same re-target as previous() (FR-010).
    this.deps.prefetch?.queue.jumpTo(index);
    this.resetChunkState(-1);
    return this.generateCurrentParagraph();
  }

  /**
   * Push the current audio position to the reading tab immediately.
   *
   * The position is otherwise only sent on `timeupdate`, which is enough while
   * the tab is visible. A hidden tab throttles the animation frames that move
   * its word highlight, so it comes back stale and stays that way until the
   * next `timeupdate` — this lets it ask for the position the moment the
   * reader looks at it again (FR-005).
   *
   * @returns Whether a position was sent — false when nothing is loaded to
   * report on, or when no tab is being read into.
   */
  resyncPosition(): boolean {
    return this.emitAudioPosition();
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

  /**
   * Human-readable failure reason (+ provider, when known) for a PlaybackError.
   * Used to notify the tab via IHighlightSynchronizer.showError (FR-001, FR-002).
   */
  private describeError(error: PlaybackError): { message: string; provider?: ProviderId } {
    switch (error.type) {
      case 'audio_generation':
        return { message: error.message, provider: error.provider };
      case 'provider_unavailable':
        return {
          message: `${error.provider} is unavailable right now. Try again shortly.`,
          provider: error.provider,
        };
      case 'no_content':
        return { message: 'No readable content was found on this page.' };
      case 'invalid_paragraph_index':
        return { message: 'That paragraph is no longer available.' };
      case 'tab_not_found':
        return { message: 'The reading tab could not be found.' };
      case 'playback_failed':
        return { message: error.reason };
    }
  }

  /**
   * Single funnel for every playback failure (S2 design decision #2): sets
   * error state, notifies the active tab so the existing accessible toast
   * fires (content.ts PLAYBACK_ERROR handler), and refreshes the footer so
   * it stops claiming "playing"/"loading" (FR-004). `tabIdOverride` covers
   * the one case where a tab is known but not yet recorded in state — a
   * `start()` call that fails before `activeTabId` is set.
   */
  private async setError(error: PlaybackError, tabIdOverride?: number): Promise<void> {
    this.state = playbackStateTransitions.setError(this.state, error);

    const tabId = tabIdOverride ?? this.state.activeTabId;
    if (tabId !== null && tabId !== undefined) {
      const { message, provider } = this.describeError(error);
      const result = await this.deps.highlightSync.showError(tabId, message, provider);
      await this.checkHighlight('showError', result);
    }

    await this.updateFooterState();
  }

  /**
   * Inspect a highlight-sync Result instead of discarding it (T010). A dead
   * tab (`tab_not_found` / `content_script_not_loaded`) stops playback so
   * audio never narrates with no visible position (FR-006). Any other
   * failure is logged only — a transient hiccup must not kill a healthy
   * session. `allowStop=false` is used by `stop()` itself so cleanup calls
   * on an already-gone tab cannot recurse back into `stop()`.
   */
  private async checkHighlight(
    context: string,
    result: Result<void, HighlightError>,
    allowStop = true,
  ): Promise<void> {
    if (isOk(result)) return;

    console.warn(`[PlaybackService] ${context} failed:`, result.error);

    const tabIsGone =
      result.error.type === 'tab_not_found' || result.error.type === 'content_script_not_loaded';
    if (tabIsGone && allowStop) {
      await this.stop();
    }
  }

  private generateCurrentParagraph(): Promise<Result<PlaybackState, PlaybackError>> {
    const generation = this.beginGeneration();
    return this.generateAndPlayParagraph(this.state.currentParagraphIndex, generation);
  }

  /**
   * Bump the generation counter and issue a fresh AbortController for the
   * fetch about to start (T015), aborting whatever the previous generation
   * was still waiting on — real cancellation instead of letting a superseded
   * fetch run to completion and discarding the result via the generation
   * check.
   */
  private beginGeneration(): number {
    this.currentAbortController?.abort();
    this.currentAbortController = new AbortController();
    return ++this.playbackGeneration;
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
   * PROSO-110 chunked playback: per-paragraph sentence chunks consumed on
   * 'ended' instead of advancing. Only populated on the local-host path.
   */
  private chunkQueue: Array<{ audioBlob: Blob; durationMs: number; error?: string }> = [];
  private chunkQueueDone = false;
  private chunkTotalMs = 0;
  private chunkPlayedMs = 0;
  private chunkBaseMs = 0;
  private chunkGeneration = -1;
  private continueChunkedOrAdvance: () => void = () => {};
  private funnelPlaybackError: (error: unknown) => void = () => {};

  /**
   * Clear word sync state.
   */
  private clearWordTimings(): void {
    this.currentWordTimings = [];
    this.currentWordIndex = -1;
  }

  /**
   * PROSO-110 chunked path: consume sentence chunks from the generator's
   * iterator, play chunk 0 immediately, drain the rest in the background
   * (adapter keeps at most one in flight + one prefetched), and replay each
   * queued chunk on 'ended' before advancing to the next paragraph.
   */
  private async generateAndPlayChunkedParagraph(
    index: number,
    generation: number,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    this.clearWordTimings();
    this.resetChunkState(generation);

    const textResult = await this.paragraphTextOrError(index);
    if (isErr(textResult)) return textResult;
    const text = textResult.value;

    const request: AudioRequest = {
      text,
      voice: this.state.voice,
      speed: this.state.speed,
      language: this.detectedLanguage,
    };

    const generator = this.audioGenerator.generateAudioChunks;
    if (!generator) {
      const error = playbackError.playbackFailed('Generator advertises chunked synthesis but has none');
      await this.setError(error);
      return Err(error);
    }
    const iterator = generator(request, this.currentAbortController?.signal);

    // Chunk 0 — the paragraph starts playing as soon as the first sentence is
    // synthesized (~1-2s warm, spec 100 FR-11).
    const first = await iterator.next();
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);
    if (first.done) {
      const error = playbackError.playbackFailed(
        'Local synthesis host produced no audio for this paragraph',
      );
      await this.setError(error);
      return Err(error);
    }
    if (isErr(first.value)) {
      const error = this.convertAudioError(first.value.error);
      await this.setError(error);
      return Err(error);
    }
    const firstChunk = first.value.value;
    this.chunkTotalMs = firstChunk.durationMs;
    this.chunkBaseMs = 0;

    // Drain the remaining chunks ahead of playback (never starves at the
    // measured RTF ~0.2: the producer runs ~5x ahead of the consumer).
    void this.drainChunkQueue(iterator, generation);

    const played = await this.playAudio(firstChunk.audioBlob, generation);
    if (!played) return Ok(this.state);

    // Timeline covers what has been received so far; it grows as chunks land.
    return this.finalizeParagraphPlayback(index, generation, {
      durationMs: firstChunk.durationMs + (this.chunkTotalMs - firstChunk.durationMs),
      providerTimings: null,
      preconvertedTimings: null,
    });
  }

  /** Consume the chunk iterator into the queue, ahead of playback. */
  private async drainChunkQueue(
    iterator: AsyncGenerator<Result<AudioResponse, AudioError>, void, void>,
    generation: number,
  ): Promise<void> {
    try {
      for await (const chunk of iterator) {
        if (!this.isCurrentGeneration(generation)) return;
        if (isErr(chunk)) {
          const message =
            chunk.error.type === 'network' || chunk.error.type === 'provider_error'
              ? chunk.error.message
              : chunk.error.type === 'rate_limit'
                ? 'Local synthesis host is busy; retrying'
                : 'Local synthesis host failed';
          this.chunkQueue.push({ audioBlob: new Blob(), durationMs: 0, error: message });
        } else {
          this.chunkQueue.push({ audioBlob: chunk.value.audioBlob, durationMs: chunk.value.durationMs });
          this.chunkTotalMs += chunk.value.durationMs;
        }
      }
    } catch {
      // Iterator failure surfaces as the paragraph's next 'ended' handler
      // finding the queue done-and-empty — the normal failure funnel reports
      // it there rather than dying silently.
    } finally {
      this.chunkQueueDone = true;
    }
  }

  /** Reset per-paragraph chunk state, binding it to a generation. */
  private resetChunkState(generation: number): void {
    this.chunkQueue = [];
    this.chunkQueueDone = false;
    this.chunkTotalMs = 0;
    this.chunkPlayedMs = 0;
    this.chunkBaseMs = 0;
    this.chunkGeneration = generation;
  }

  /**
   * Play the next queued chunk for the current paragraph (invoked from the
   * audio element's 'ended' handler). Rebuilds the word timeline against the
   * running paragraph total so highlighting keeps covering the whole
   * paragraph as chunks land (spec 100 D-3: estimate from a real duration).
   */
  private async playNextChunk(): Promise<boolean> {
    const chunk = this.chunkQueue.shift();
    if (!chunk) {
      this.chunkQueueDone = true;
      return false;
    }
    const generation = this.chunkGeneration;
    if (!this.isCurrentGeneration(generation)) return false;

    if (chunk.error) {
      await this.setError(playbackError.playbackFailed(chunk.error));
      return false;
    }

    this.chunkBaseMs = this.chunkPlayedMs;
    const played = await this.playAudio(chunk.audioBlob, generation);
    if (!played) return false;
    this.chunkPlayedMs += chunk.durationMs;

    // Rebuild the timeline: paragraph time = chunkBaseMs + element time.
    const paragraphText = this.state.paragraphs[this.state.currentParagraphIndex] ?? '';
    const totalMs = this.chunkBaseMs + chunk.durationMs;
    if (totalMs > 0 && this.state.activeTabId !== null) {
      await this.buildAndSetWordTimeline(
        this.state.currentParagraphIndex,
        paragraphText,
        totalMs,
        null,
        null,
        generation,
      );
    }
    return true;
  }

  /**
   * Shared timeline builder (PROSO-110): convert provider timings when
   * present, else estimate from a real duration; publish and bind the
   * timeline to the current generation. Returns false when the generation
   * moved on mid-build (caller should stop the tail).
   */
  private async buildAndSetWordTimeline(
    index: number,
    paragraphText: string,
    durationMs: number,
    preconvertedTimings: ReadonlyArray<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }> | null,
    providerTimings: readonly { word: string; startMs: number; endMs: number }[] | null,
    generation: number,
  ): Promise<boolean> {
    if (durationMs <= 0) return true;
    let wordTimings: Array<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>;

    if (preconvertedTimings && preconvertedTimings.length > 0) {
      wordTimings = [...preconvertedTimings];
    } else if (providerTimings && providerTimings.length > 0) {
      // Use real provider timestamps (e.g. ElevenLabs, cached entries)
      wordTimings = this.convertProviderTimings(providerTimings, paragraphText);
    } else {
      wordTimings = this.estimateWordTimings(paragraphText, durationMs);
    }

    this.currentWordTimings = wordTimings;
    this.currentWordIndex = -1;

    if (wordTimings.length === 0 || this.state.activeTabId === null) return true;

    const timelineResult = await this.deps.highlightSync.setWordTimeline(
      this.state.activeTabId,
      index,
      wordTimings,
    );
    await this.checkHighlight('setWordTimeline', timelineResult);
    return this.isCurrentGeneration(generation);
  }

  /**
   * Shared paragraph-text access: an invalid index becomes the same typed
   * error on every path (cache, network, prefetch, chunked — PROSO-110).
   */
  private async paragraphTextOrError(
    index: number,
  ): Promise<Result<string, PlaybackError>> {
    const text = this.state.paragraphs[index];
    if (!text) {
      const error = playbackError.invalidParagraphIndex(index, this.state.totalParagraphs);
      await this.setError(error);
      return Err(error);
    }
    return Ok(text);
  }

  /**
   * Generate audio for a paragraph and start playing.
   */
  private async generateAndPlayParagraph(
    index: number,
    generation: number,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    // PROSO-110: a chunked generator (the local synthesis host) synthesizes at
    // sentence granularity so playback starts after the first sentence rather
    // than after a paragraph-sized request (~8s of silence). The chunked path
    // bypasses the paragraph cache: the host's idempotent replay is its own
    // cache (~0.11s), and a paragraph-shaped cache entry would hold only the
    // first sentence.
    if (this.audioGenerator.supportsChunkedSynthesis && this.audioGenerator.generateAudioChunks) {
      return this.generateAndPlayChunkedParagraph(index, generation);
    }

    // Clear previous word timings on paragraph transition
    this.clearWordTimings();

    const textResult = await this.paragraphTextOrError(index);
    if (isErr(textResult)) return textResult;
    const text = textResult.value;

    // Consult the prefetch buffer first (T013): a buffered entry for this
    // index, tagged with the params that produced it (T016/FR-012), skips
    // both the cache lookup and the network round-trip entirely.
    if (this.deps.prefetch) {
      const prefetched = this.deps.prefetch.service.consume(index);
      if (prefetched) {
        const paramsMatch =
          prefetched.provider === this.state.provider && prefetched.voice === this.state.voice;
        if (paramsMatch) {
          return this.playFromPrefetchBuffer(index, prefetched, generation);
        }
        // Stale params (voice/provider changed mid-article) — never play it
        // (FR-012); revoke its blob URL so it isn't leaked (FR-011).
        this.deps.audioUrlProvider.revokeUrl(prefetched.audioUrl);
      }
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
      this.deps.prefetch?.queue.markCached(index);
    } else {
      // Generate new audio
      const request: AudioRequest = {
        text,
        voice: this.state.voice,
        speed: this.state.speed,
        language: this.detectedLanguage,
      };

      console.log('[PlaybackService] Generating audio with:', this.audioGenerator.constructor.name);
      // Reading the controller here is only correct because no `await` sits between the
      // generation check above and this call: argument evaluation is synchronous, so the
      // signal is necessarily the one beginGeneration() installed for `generation`. Adding
      // an await in between would silently bind a superseded generation's request to the
      // live controller — the request would then outlive its cancellation and be billed.
      const generateResult = await this.audioGenerator.generateAudio(
        request,
        this.currentAbortController?.signal,
      );
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);

      if (isErr(generateResult)) {
        console.error('[PlaybackService] Audio generation failed:', generateResult.error);
        const error = this.convertAudioError(generateResult.error);
        await this.setError(error);
        return Err(error);
      }

      audioResponse = generateResult.value;

      // Cache the generated audio
      const cacheEntry = makeCacheEntry(audioResponse);

      await this.deps.cacheStore.set(cacheKey, cacheEntry);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);
      this.deps.prefetch?.queue.markCached(index);
    }

    // Play the audio via HTMLAudioElement
    const played = await this.playAudio(audioResponse.audioBlob, generation);
    if (!played) return Ok(this.state);

    return this.finalizeParagraphPlayback(index, generation, {
      durationMs: audioResponse.durationMs ?? 0,
      providerTimings: audioResponse.wordTimings,
      preconvertedTimings: null,
    });
  }

  /**
   * Shared highlight/footer tail after a paragraph's first audio starts
   * (PROSO-110): moves the state to playing, marks the paragraph, and builds
   * word timings from provider timings when present, else from the duration.
   * `chunkExtraMs` lets the chunked path contribute already-received chunk
   * durations to the timeline even before the whole paragraph has synthesized.
   */
  private async finalizeParagraphPlayback(
    index: number,
    generation: number,
    source: {
      readonly durationMs: number;
      readonly providerTimings: readonly { word: string; startMs: number; endMs: number }[] | null;
      readonly preconvertedTimings: ReadonlyArray<{
        word: string;
        charOffset: number;
        charLength: number;
        startTimeMs: number;
        endTimeMs: number;
      }> | null;
    },
  ): Promise<Result<PlaybackState, PlaybackError>> {
    // Update state to playing — unless the user paused while this clip loaded.
    // The highlight below still moves to `index` so a resume plays the
    // paragraph the reader can see is next.
    if (this.state.status !== 'paused') {
      this.state = playbackStateTransitions.startPlaying(this.state);
    }

    // Update highlights
    if (this.state.activeTabId !== null) {
      const paragraphText = this.state.paragraphs[index] ?? '';
      const highlightResult = await this.deps.highlightSync.highlightParagraph(
        this.state.activeTabId,
        index,
        true,
        paragraphText,
        Date.now(),
      );
      await this.checkHighlight('highlightParagraph', highlightResult);
      if (!this.isCurrentGeneration(generation)) return Ok(this.state);

      // Use real provider word timings when available, else estimate
      const audioDurationMs = this.audioElement?.duration
        ? this.audioElement.duration * 1000
        : source.durationMs;

      if (audioDurationMs > 0) {
        const continued = await this.buildAndSetWordTimeline(
          index,
          paragraphText,
          audioDurationMs,
          source.preconvertedTimings,
          source.providerTimings,
          generation,
        );
        if (!continued) return Ok(this.state);
      }
    }

    // Update footer state
    await this.updateFooterState();
    if (!this.isCurrentGeneration(generation)) return Ok(this.state);

    return Ok(this.state);
  }

  /**
   * Play an already-generated prefetch-buffer entry (T013). Sibling to the
   * cache/network tail of generateAndPlayParagraph rather than a shared
   * abstraction: the prefetch buffer stores pre-converted word timings and a
   * ready audio URL (no blob, no raw provider timings to convert/estimate),
   * so the two tails diverge enough that unifying them would cost more than
   * it saves.
   * ponytail: duplicated ~20-line highlight/footer sequence instead of a
   * shared generic pipeline — ceiling is a 4th audio source; unify then.
   */
  private async playFromPrefetchBuffer(
    index: number,
    prefetched: PrefetchedAudio,
    generation: number,
  ): Promise<Result<PlaybackState, PlaybackError>> {
    const played = await this.playPrefetchedAudio(prefetched.audioUrl, generation);
    if (!played) return Ok(this.state);

    this.deps.prefetch?.queue.markCached(index);

    // Shared highlight/footer tail (the prefetch path carries pre-converted
    // word timings — providerTimings and duration are irrelevant to it).
    return this.finalizeParagraphPlayback(
      index,
      generation,
      { durationMs: 0, providerTimings: null, preconvertedTimings: prefetched.wordTimings },
    );
  }

  /**
   * Play audio blob.
   */
  private async playAudio(blob: Blob, generation: number): Promise<boolean> {
    if (!this.isCurrentGeneration(generation)) return false;

    // Clean up previous audio (no-op for data URLs)
    this.deps.audioUrlProvider.revokeUrl(this.currentAudioUrl);

    // Create audio URL (uses data URL in service worker, blob URL in DOM)
    const audioUrl = await this.deps.audioUrlProvider.createUrl(blob);
    if (!this.isCurrentGeneration(generation)) {
      this.deps.audioUrlProvider.revokeUrl(audioUrl);
      return false;
    }

    return this.attachAndPlay(audioUrl, generation);
  }

  /**
   * Play an audio URL produced ahead of time by the prefetch buffer
   * (T013) — no blob, so no createUrl() round-trip; still revokes the
   * previous URL and checks staleness before attaching, mirroring
   * playAudio()'s guards.
   */
  private async playPrefetchedAudio(audioUrl: string, generation: number): Promise<boolean> {
    if (!this.isCurrentGeneration(generation)) {
      this.deps.audioUrlProvider.revokeUrl(audioUrl);
      return false;
    }

    this.deps.audioUrlProvider.revokeUrl(this.currentAudioUrl);

    return this.attachAndPlay(audioUrl, generation);
  }

  /**
   * Shared tail of playAudio()/playPrefetchedAudio() (T013): attach a
   * ready audio URL to the (lazily created) audio element and start
   * playback.
   */
  private async attachAndPlay(audioUrl: string, generation: number): Promise<boolean> {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.setupAudioEventListeners();
    }

    this.currentAudioUrl = audioUrl;
    this.audioElement.src = this.currentAudioUrl;
    this.audioElement.playbackRate = this.state.speed;

    // A pause taken while this clip was still being fetched has to win: playing
    // here would restart the reading behind the user's back. The element keeps
    // the loaded source, so `resume()` picks it up with no second fetch.
    if (this.state.status !== 'paused') {
      try {
        await this.audioElement.play();
      } catch (error) {
        if (!this.isCurrentGeneration(generation)) return false;
        await this.setError(this.describePlayError(error));
        return false;
      }
    }
    return this.isCurrentGeneration(generation);
  }

  /**
   * Whether paragraph `index` already has a valid durable-cache entry
   * (T012's `checkCache` callback for PrefetchService — INV-006: never
   * spend a network round-trip prefetching what would just duplicate a
   * cache hit). Mirrors the 0-byte-miss rule generateAndPlayParagraph's own
   * cache check uses (T030).
   */
  async isParagraphCached(index: number): Promise<boolean> {
    const text = this.state.paragraphs[index];
    if (!text) return false;
    const cacheKey = this.createCacheKey(index, text);
    const cachedResult = await this.deps.cacheStore.get(cacheKey);
    return (
      isOk(cachedResult) &&
      cachedResult.value !== null &&
      cachedResult.value.sizeBytes > 0 &&
      cachedResult.value.audioBlob.size > 0
    );
  }

  /**
   * Generate audio for paragraph `index` ahead of playback (T012's
   * `generateAudio` callback for PrefetchService). Public because the
   * composition root — not PlaybackService itself — wires it into
   * `prefetchService.configure()`.
   *
   * Mirrors generateAndPlayParagraph's network branch, including the
   * durable cache write: without it, prefetched audio would only ever live
   * in the in-memory prefetch buffer and vanish on stop()/tab close,
   * breaking INV-006 (cached content never re-charges) for anything that
   * was fetched via prefetch instead of the live path. Never touches
   * PlaybackState — this runs for paragraphs ahead of, not at, the current
   * position.
   */
  async generatePrefetchAudio(
    text: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<{
    audioUrl: string;
    wordTimings: Array<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>;
    provider?: string;
    voice?: string | null;
  } | null> {
    const request: AudioRequest = {
      text,
      voice: this.state.voice,
      speed: this.state.speed,
      language: this.detectedLanguage,
    };

    // Prefetch owns its own cancellation scope, separate from the current
    // generation's controller: it fetches paragraphs the reader has not reached,
    // so a live-path cancellation must not kill lookahead and vice versa.
    const generateResult = await this.audioGenerator.generateAudio(request, signal);
    if (isErr(generateResult)) {
      console.error('[PlaybackService] Prefetch audio generation failed:', generateResult.error);
      return null;
    }

    const audioResponse = generateResult.value;

    // Durable cache write (INV-006) — see method doc.
    const cacheKey = this.createCacheKey(index, text);
    const cacheEntry = makeCacheEntry(audioResponse);
    await this.deps.cacheStore.set(cacheKey, cacheEntry);

    const audioUrl = await this.deps.audioUrlProvider.createUrl(audioResponse.audioBlob);

    const wordTimings =
      audioResponse.wordTimings && audioResponse.wordTimings.length > 0
        ? this.convertProviderTimings(audioResponse.wordTimings, text)
        : this.estimateWordTimings(text, audioResponse.durationMs ?? 0);

    return {
      audioUrl,
      wordTimings,
      provider: this.state.provider,
      voice: this.state.voice,
    };
  }

  /**
   * Map an `HTMLMediaElement.play()` rejection to a nameable cause (T009):
   * `NotAllowedError` is the browser's autoplay policy blocking playback,
   * `NotSupportedError` is a malformed/undecodable blob. Both are reported
   * through the same `playback_failed` variant with a distinct reason —
   * `core/shared/errors.ts` is not owned by this slice, so the cause is
   * named in the message text rather than a new PlaybackError variant.
   */
  private describePlayError(error: unknown): PlaybackError {
    const name = error instanceof DOMException ? error.name : undefined;
    if (name === 'NotAllowedError') {
      return playbackError.playbackFailed(
        'Playback was blocked by the browser. Click play to start audio.',
      );
    }
    if (name === 'NotSupportedError') {
      return playbackError.playbackFailed('This paragraph audio could not be played.');
    }
    const message = error instanceof Error ? error.message : String(error);
    return playbackError.playbackFailed(message || 'Audio playback failed to start.');
  }

  /**
   * Send where the audio currently is to the tab being read into.
   *
   * `duration` is checked because an element that has not loaded metadata
   * reports `currentTime` 0 against an unknown clip — a position that would
   * drag the highlight back to the first word rather than leave it alone.
   *
   * @returns Whether a position was sent
   */
  private emitAudioPosition(): boolean {
    if (!this.audioElement?.duration) return false;
    if (this.state.activeTabId === null) return false;

    // PROSO-110: with a chunk queue active, element time is chunk-local;
    // paragraph time is chunkBaseMs + element time.
    const chunked = this.chunkGeneration >= 0;
    const positionMs = chunked
      ? this.chunkBaseMs + this.audioElement.currentTime * 1000
      : this.audioElement.currentTime * 1000;

    this.deps.highlightSync.sendAudioPosition(
      this.state.activeTabId,
      positionMs,
      !this.audioElement.paused,
      this.state.speed,
    );

    return true;
  }

  /**
   * Set up audio element event listeners.
   */
  private setupAudioEventListeners(): void {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement && this.audioElement.duration) {
        // PROSO-110: chunked playback reports paragraph progress; the total
        // grows as chunks land, so progress is an approximation until the
        // paragraph is fully received.
        const chunked = this.chunkGeneration >= 0 && this.chunkTotalMs > 0;
        const progress = chunked
          ? (this.chunkBaseMs + this.audioElement.currentTime * 1000) / this.chunkTotalMs
          : this.audioElement.currentTime / this.audioElement.duration;
        this.state = playbackStateTransitions.updateProgress(this.state, progress);
        this.updateFooterState();

        // Send audio position to content script for rAF-based word sync
        this.emitAudioPosition();
      }
    });

    this.audioElement.addEventListener('ended', () => {
      // A pause taken as the clip finished must not be undone by the queued
      // auto-advance: `next()` would move to `loading` and start reading again.
      // ponytail: resuming then replays the paragraph that is still
      // highlighted rather than continuing mid-article — audio and highlight
      // stay in agreement, which is the property that matters here.
      if (this.state.status === 'paused') return;

      // PROSO-110: a queued sentence chunk continues the current paragraph
      // instead of advancing — playback consumes chunk n+1 while the adapter
      // prefetches n+2 (one in flight + one prefetched).
      if (this.chunkQueue.length > 0) {
        void this.playNextChunk().catch(this.funnelPlaybackError);
        return;
      }
      if (!this.chunkQueueDone && this.chunkGeneration >= 0) {
        // The drain is still running: wait briefly for the next chunk rather
        // than advancing (synthesis is ~5x faster than playback, so this is a
        // rare guard, not the common path).
        setTimeout(() => this.continueChunkedOrAdvance(), 500);
        return;
      }
      this.resetChunkState(-1);

      // Move to next paragraph; route rejection through the same failure
      // funnel so an unexpected throw is still reported (T008).
      this.next().catch(this.funnelPlaybackError);
    });

    /**
     * PROSO-110 continuation: play the next queued chunk if one arrived
     * during the drain wait, else advance (or advance anyway once the drain
     * finished without producing one).
     */
    this.continueChunkedOrAdvance = (): void => {
      if (this.chunkQueue.length > 0) {
        void this.playNextChunk().catch(this.funnelPlaybackError);
      } else {
        this.resetChunkState(-1);
        void this.next().catch(this.funnelPlaybackError);
      }
    };

    /**
     * Route an unexpected throw through the same failure funnel (T008).
     */
    this.funnelPlaybackError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      void this.setError(playbackError.playbackFailed(message));
    };

    this.audioElement.addEventListener('error', () => {
      const error = playbackError.playbackFailed('Audio playback error');
      void this.setError(error);
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

    const result = await this.deps.highlightSync.updateFooterState(
      this.state.activeTabId,
      footerState,
    );
    await this.checkHighlight('updateFooterState', result);
  }
}


/**
 * Shared CacheEntry construction (PROSO-110 dedup): every path that writes a
 * synthesized response to the cache builds the same entry shape.
 */
function makeCacheEntry(audioResponse: AudioResponse): CacheEntry {
  return {
    audioBlob: audioResponse.audioBlob,
    durationMs: audioResponse.durationMs,
    wordTimings: audioResponse.wordTimings,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    accessCount: 1,
    sizeBytes: audioResponse.audioBlob.size,
  };
}
