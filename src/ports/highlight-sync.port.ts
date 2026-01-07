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
  readonly currentText: string;
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
   */
  highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean,
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
}
