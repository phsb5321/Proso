/**
 * No-Op Highlight Synchronizer Adapter
 *
 * A fallback adapter that implements IHighlightSynchronizer but does nothing.
 * Used when the real adapter cannot be initialized (e.g., during service worker
 * startup before tabs are available).
 *
 * This ensures PlaybackService is always available even when highlight sync
 * cannot be performed.
 *
 * @module adapters/messaging/noop-highlight-sync
 */

import type { HighlightError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Ok } from '../../core/shared/result';
import type { FooterState, IHighlightSynchronizer } from '../../ports/highlight-sync.port';

/**
 * No-op highlight synchronizer that succeeds silently.
 *
 * Use this adapter as a fallback when the real HighlightSyncAdapter
 * cannot be used (e.g., no active tab, content script not loaded).
 */
export class NoOpHighlightSyncAdapter implements IHighlightSynchronizer {
  async highlightParagraph(
    _tabId: number,
    _paragraphIndex: number,
    _scroll: boolean,
    _text?: string,
    _timestamp?: number,
  ): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async setWordTimeline(
    _tabId: number,
    _paragraphIndex: number,
    _wordTimeline: ReadonlyArray<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>,
  ): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async highlightWord(
    _tabId: number,
    _paragraphIndex: number,
    _wordIndex: number,
  ): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async sendAudioPosition(
    _tabId: number,
    _currentTimeMs: number,
    _isPlaying: boolean,
    _speed: number,
  ): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async clearHighlights(_tabId: number): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async showFooter(_tabId: number): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async hideFooter(_tabId: number): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }

  async updateFooterState(
    _tabId: number,
    _state: FooterState,
  ): Promise<Result<void, HighlightError>> {
    // No-op: silently succeed
    return Ok(undefined);
  }
}

/**
 * Create a no-op highlight sync adapter.
 */
export function createNoOpHighlightSyncAdapter(): NoOpHighlightSyncAdapter {
  return new NoOpHighlightSyncAdapter();
}
