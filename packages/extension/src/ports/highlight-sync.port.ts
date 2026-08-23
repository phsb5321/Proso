/**
 * Highlight Synchronizer Port Interface
 *
 * Defines the contract for content script highlight coordination.
 * Adapters: HighlightSyncAdapter (browser.tabs messaging)
 *
 * @module ports/highlight-sync
 */

import type { HighlightError } from '../core/shared/errors';
import type { Result } from '../core/shared/result';

/**
 * Playback status for footer state.
 */
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Footer player state sent to content script.
 */
export interface FooterState {
  readonly status: PlaybackStatus;
  readonly currentIndex: number;
  readonly totalParagraphs: number;
  readonly progress: number;
  readonly currentTime: string;
  readonly totalTime: string;
  readonly speed: number;
}

/**
 * Port interface for content script highlight coordination.
 *
 * Implementations:
 * - HighlightSyncAdapter - Uses browser.tabs.sendMessage
 */
export interface IHighlightSynchronizer {
  /**
   * Highlight a paragraph in the content script.
   * @param tabId - Tab to highlight in
   * @param paragraphIndex - Paragraph index to highlight
   * @param scroll - Whether to scroll to the paragraph
   * @param text - Paragraph text for DOM matching
   * @param timestamp - Message freshness timestamp
   */
  highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean,
    text?: string,
    timestamp?: number,
  ): Promise<Result<void, HighlightError>>;

  /**
   * Send word timeline to content script for word-level highlighting.
   * @param tabId - Tab to send timeline to
   * @param paragraphIndex - Paragraph index the timeline belongs to
   * @param wordTimeline - Array of word timing entries
   */
  setWordTimeline(
    tabId: number,
    paragraphIndex: number,
    wordTimeline: ReadonlyArray<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>,
  ): Promise<Result<void, HighlightError>>;

  /**
   * Highlight a word within the current paragraph.
   * @param tabId - Tab to highlight in
   * @param paragraphIndex - Paragraph index
   * @param wordIndex - Word index within paragraph
   */
  highlightWord(
    tabId: number,
    paragraphIndex: number,
    wordIndex: number,
  ): Promise<Result<void, HighlightError>>;

  /**
   * Send audio position update for content-script-side word sync.
   * @param tabId - Tab to update
   * @param currentTimeMs - Current playback time in milliseconds
   * @param isPlaying - Whether audio is currently playing
   * @param speed - Playback speed multiplier
   */
  sendAudioPosition(
    tabId: number,
    currentTimeMs: number,
    isPlaying: boolean,
    speed: number,
  ): Promise<Result<void, HighlightError>>;

  /**
   * Clear all highlights.
   * @param tabId - Tab to clear highlights in
   */
  clearHighlights(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Show the sticky footer player.
   * @param tabId - Tab to show footer in
   */
  showFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Hide the sticky footer player.
   * @param tabId - Tab to hide footer in
   */
  hideFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Update footer state.
   * @param tabId - Tab to update
   * @param state - New footer state
   */
  updateFooterState(tabId: number, state: FooterState): Promise<Result<void, HighlightError>>;

  /**
   * Notify the content script that playback failed, so it can surface the
   * existing accessible error toast (see content.ts PLAYBACK_ERROR handler).
   * @param tabId - Tab to notify
   * @param message - Human-readable failure reason
   * @param provider - Provider the failure originated from, when known
   */
  showError(
    tabId: number,
    message: string,
    provider?: string,
  ): Promise<Result<void, HighlightError>>;
}
