/**
 * Highlight Synchronizer Adapter
 *
 * Adapter implementing IHighlightSynchronizer port using browser.tabs.sendMessage.
 * Sends highlight and footer commands to content scripts.
 *
 * @module adapters/messaging/highlight-sync
 */

import type { WordTimingBasis } from '../../core/playback/word-timing-estimator';
import type { HighlightError } from '../../core/shared/errors';
import { highlightError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type { FooterState, IHighlightSynchronizer } from '../../ports/highlight-sync.port';

/**
 * Highlight synchronizer adapter using browser tabs messaging.
 *
 * Sends messages to content scripts for:
 * - Paragraph highlighting
 * - Word highlighting
 * - Footer visibility control
 * - Footer state updates
 */
export class HighlightSyncAdapter implements IHighlightSynchronizer {
  /**
   * Send message to content script.
   * @param tabId - Tab to send message to
   * @param message - Message payload
   */
  private async sendToContentScript(
    tabId: number,
    message: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await browser.tabs.sendMessage(tabId, message);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send message to tab ${tabId}: ${errorMsg}`);
    }
  }

  async highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean,
    text = '',
    timestamp = Date.now(),
  ): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'highlight',
        index: paragraphIndex,
        text,
        timestamp,
        scroll,
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async setWordTimeline(
    tabId: number,
    paragraphIndex: number,
    wordTimeline: ReadonlyArray<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>,
  ): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'setWordTimeline',
        paragraphIndex,
        wordTimeline: wordTimeline.map((w) => ({
          word: w.word,
          charOffset: w.charOffset,
          charLength: w.charLength,
          startMs: w.startTimeMs,
          endMs: w.endTimeMs,
        })),
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async highlightWord(
    tabId: number,
    paragraphIndex: number,
    wordIndex: number,
  ): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'highlightWord',
        paragraphIndex,
        wordIndex,
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async sendAudioPosition(
    tabId: number,
    currentTimeMs: number,
    isPlaying: boolean,
    speed: number,
  ): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'audioPositionUpdate',
        currentTimeMs,
        isPlaying,
        speed,
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async clearHighlights(tabId: number): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'clearHighlight',
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async showFooter(tabId: number): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'FOOTER_SHOW',
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async hideFooter(tabId: number): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'FOOTER_HIDE',
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async updateFooterState(
    tabId: number,
    state: FooterState,
  ): Promise<Result<void, HighlightError>> {
    try {
      const timingBasis = (state as FooterState & { readonly timingBasis?: WordTimingBasis })
        .timingBasis;
      await this.sendToContentScript(tabId, {
        type: 'FOOTER_STATE_UPDATE',
        status: state.status,
        currentParagraph: state.currentIndex,
        totalParagraphs: state.totalParagraphs,
        // The footer speaks percentages end to end — its slider ARIA, its
        // keyboard steps and its seek all carry 0-100, and its fill is written
        // straight into a CSS width. Passing the 0-1 domain fraction through
        // rendered every bar under one percent wide, whatever had been read.
        progress: state.progress * 100,
        currentTime: state.currentTime,
        totalTime: state.totalTime,
        speed: state.speed,
        voice: state.voice,
      });

      // Broadcast to popup for bidirectional sync (popup may not be open)
      browser.runtime
        .sendMessage({
          type: 'playbackStateUpdate',
          state: {
            status: state.status,
            currentParagraph: state.currentIndex,
            totalParagraphs: state.totalParagraphs,
            progress: Math.round(state.progress * 100),
            speed: state.speed,
            timingBasis,
          },
        })
        .catch(() => {
          // Popup not open — ignore
        });

      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  async showError(
    tabId: number,
    message: string,
    provider?: string,
  ): Promise<Result<void, HighlightError>> {
    try {
      await this.sendToContentScript(tabId, {
        type: 'PLAYBACK_ERROR',
        message,
        ...(provider !== undefined ? { provider } : {}),
      });
      return Ok(undefined);
    } catch (error) {
      return Err(this.toHighlightError(tabId, error));
    }
  }

  /**
   * Convert error to appropriate HighlightError type.
   */
  private toHighlightError(tabId: number, error: unknown): HighlightError {
    const message = error instanceof Error ? error.message : String(error);

    // Check for common browser API errors
    if (
      message.includes('No tab') ||
      message.includes('Invalid tab') ||
      message.includes('tab was closed')
    ) {
      return highlightError.tabNotFound(tabId);
    }

    if (
      message.includes('receiving end does not exist') ||
      message.includes('Could not establish connection')
    ) {
      return highlightError.contentScriptNotLoaded();
    }

    return highlightError.messageFailed(message);
  }
}
