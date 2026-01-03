/**
 * UI Coordinator
 * Handles UI state synchronization between background service worker and UI components.
 * Coordinates notifications to popup and content scripts for playback state,
 * highlights, and floating controller.
 *
 * @module background/ui-coordinator
 */

import { MessageType, StorageKey, FooterMessageTypes } from './constants.js';

/**
 * UICoordinator class - manages all UI notifications and state sync
 */
export class UICoordinator {
  constructor() {
    /** @type {number} */
    this.lastHighlightedWordIndex = -1;
    /** @type {number} */
    this.syncLogCounter = 0;
  }

  /**
   * Notify popup of playback state change
   * @param {Object} state - Playback state object
   * @param {boolean} isPlaying - Whether currently playing
   */
  notifyPlaybackState(state, isPlaying) {
    browser.runtime.sendMessage({
      type: MessageType.PLAYBACK_STATE,
      status: state.status,
      isPlaying: isPlaying,
      isPaused: state.isPaused,
      currentIndex: state.currentIndex,
      totalParagraphs: state.paragraphs.length
    }).catch(() => {});

    // Floating controller deprecated - use sticky footer (020-code-quality-fix)
    // this.updateFloatingControllerState(state);
  }

  /**
   * Notify popup of paragraph change
   * @param {number} currentIndex - Current paragraph index
   * @param {number} totalParagraphs - Total paragraphs count
   */
  notifyParagraphChanged(currentIndex, totalParagraphs) {
    browser.runtime.sendMessage({
      type: MessageType.PARAGRAPH_CHANGED,
      currentIndex: currentIndex,
      totalParagraphs: totalParagraphs
    }).catch(() => {});
  }

  /**
   * Notify popup of error
   * @param {string} message - Error message
   */
  notifyError(message) {
    browser.runtime.sendMessage({
      type: MessageType.ERROR,
      error: message
    }).catch(() => {});
  }

  /**
   * Notify popup of cache hit status
   * @param {boolean} isCached - Whether audio was from cache
   */
  notifyCacheHit(isCached) {
    browser.runtime.sendMessage({
      type: MessageType.CACHE_HIT,
      cached: isCached
    }).catch(() => {});
  }

  /**
   * Notify popup of pre-generation status
   * @param {number} index - Paragraph index being pre-generated
   */
  notifyPreGenerating(index) {
    browser.runtime.sendMessage({
      type: MessageType.PRE_GENERATING,
      index: index
    }).catch(() => {});
  }

  /**
   * Send word sync status to popup for indicator display
   * @param {boolean} hasWordTiming - Whether word-level timing is available
   * @param {string} source - Source of timing ('groq', 'native', 'cached', or 'none')
   * @param {number} driftMs - Current drift in milliseconds
   * @param {boolean} isDrifting - Whether significant drift detected
   */
  notifyWordSyncStatus(hasWordTiming, source = 'none', driftMs = 0, isDrifting = false) {
    browser.runtime.sendMessage({
      type: MessageType.SYNC_STATUS,
      hasWordTiming: hasWordTiming,
      source: source,
      driftMs: driftMs,
      isDrifting: isDrifting
    }).catch(() => {
      // Popup might not be open
    });
  }

  /**
   * Update progress in popup
   * @param {Object} state - Playback state
   */
  notifyProgress(state) {
    // Calculate progress including current audio position
    let current = this._getCurrentProgress(state);

    // If we have an active audio element, use its actual position for more accurate time
    if (state.currentAudio && !isNaN(state.currentAudio.currentTime)) {
      const baseProgress = (state.currentIndex / state.paragraphs.length) * state.totalDuration;
      const audioDuration = state.currentAudio.duration || 0;
      const audioProgress = state.currentAudio.currentTime;
      // Estimate how much of total duration this paragraph represents
      const paragraphDurationFraction = audioDuration / state.totalDuration || 0;
      current = baseProgress + (audioProgress * paragraphDurationFraction);
    }

    browser.runtime.sendMessage({
      type: MessageType.PROGRESS,
      current: current,
      total: state.totalDuration,
      currentIndex: state.currentIndex,
      totalParagraphs: state.paragraphs.length
    }).catch(() => {});

    // Floating controller deprecated - use sticky footer (020-code-quality-fix)
    // this.updateFloatingControllerState(state);
  }

  /**
   * Show the floating controller on the current tab
   * @deprecated Use showStickyFooter() instead (020-code-quality-fix)
   * @param {Object} [tab] - Optional specific tab, otherwise uses active tab
   */
  async showFloatingController(tab) {
    try {
      const targetTab = tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (targetTab) {
        // Get saved position from storage
        const result = await browser.storage.local.get(StorageKey.FLOATING_CONTROLLER_POSITION);
        const position = result[StorageKey.FLOATING_CONTROLLER_POSITION] || null;

        browser.tabs.sendMessage(targetTab.id, {
          action: MessageType.SHOW_FLOATING_CONTROLLER,
          position: position
        }).catch(() => {
          // Content script might not be ready
        });

        // Enable paragraph selection mode for hover/click interactions
        browser.tabs.sendMessage(targetTab.id, {
          action: 'enableSelectionMode'
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      console.warn('VoxPage: Failed to show floating controller:', error);
    }
  }

  /**
   * Hide the floating controller on the current tab
   * @deprecated Use hideStickyFooter() instead (020-code-quality-fix)
   * @param {Object} [tab] - Optional specific tab, otherwise uses active tab
   */
  async hideFloatingController(tab) {
    try {
      const targetTab = tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (targetTab) {
        browser.tabs.sendMessage(targetTab.id, {
          action: MessageType.HIDE_FLOATING_CONTROLLER
        }).catch(() => {
          // Content script might not be ready
        });

        // Disable paragraph selection mode
        browser.tabs.sendMessage(targetTab.id, {
          action: 'disableSelectionMode'
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      console.warn('VoxPage: Failed to hide floating controller:', error);
    }
  }

  /**
   * Update the floating controller state
   * @deprecated Use updateStickyFooterState() instead (020-code-quality-fix)
   * @param {Object} state - Playback state
   */
  async updateFloatingControllerState(state) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const progress = state.paragraphs.length > 0
          ? (state.currentIndex / state.paragraphs.length) * 100
          : 0;

        const timeRemaining = this._calculateTimeRemaining(state);

        browser.tabs.sendMessage(tabs[0].id, {
          action: MessageType.UPDATE_PLAYBACK_STATE,
          isPlaying: state.isPlaying && !state.isPaused,
          progress: progress,
          timeRemaining: timeRemaining,
          currentParagraph: state.currentIndex + 1,
          totalParagraphs: state.paragraphs.length
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      // Silently fail - controller might not be visible
    }
  }

  /**
   * Highlight current paragraph in the page
   * @param {number} index - Paragraph index
   * @param {string} paragraphText - Text content for matching
   * @param {number} [timestamp] - Optional timestamp for sync verification
   */
  async highlightParagraph(index, paragraphText, timestamp) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        // Use first 100 chars for matching (enough to be unique, not too long)
        const matchText = (paragraphText || '').substring(0, 100).trim();

        browser.tabs.sendMessage(tabs[0].id, {
          action: MessageType.HIGHLIGHT,
          index: index,
          text: matchText,
          timestamp: timestamp || Date.now()
        });
      }
    } catch (error) {
      // Content script might not be ready
    }
  }

  /**
   * Highlight a specific word in the page
   * @param {number} paragraphIndex - Paragraph index
   * @param {number} wordIndex - Word index within paragraph
   * @param {number} timestamp - Timestamp for sync verification
   */
  async highlightWord(paragraphIndex, wordIndex, timestamp) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: MessageType.HIGHLIGHT_WORD,
          paragraphIndex: paragraphIndex,
          wordIndex: wordIndex,
          timestamp: timestamp
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      // Content script might not be ready
    }
  }

  /**
   * Send word timeline to content script for CSS Highlight API
   * @param {Array} wordTimeline - Array of word timing data
   * @param {number} paragraphIndex - Current paragraph index
   */
  async sendWordTimeline(wordTimeline, paragraphIndex) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: MessageType.SET_WORD_TIMELINE,
          wordTimeline: wordTimeline,
          paragraphIndex: paragraphIndex
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      // Content script might not be ready
    }
  }

  /**
   * Clear highlight from page
   */
  async clearHighlight() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: MessageType.CLEAR_HIGHLIGHT
        });
      }
    } catch (error) {
      // Content script might not be ready
    }
  }

  /**
   * Reset word highlight tracking for new paragraph
   */
  resetWordHighlightTracking() {
    this.lastHighlightedWordIndex = -1;
  }

  /**
   * Direct word synchronization from audio time
   * @param {number} currentTimeMs - Current audio playback time in milliseconds
   * @param {Array} wordTimeline - Word timing array
   * @param {number} paragraphIndex - Current paragraph index
   * @returns {number} The highlighted word index, or -1 if none
   */
  syncWordFromTime(currentTimeMs, wordTimeline, paragraphIndex) {
    if (!wordTimeline || wordTimeline.length === 0) return -1;

    // Find the word that contains the current time
    let wordIndex = -1;
    for (let i = 0; i < wordTimeline.length; i++) {
      const word = wordTimeline[i];
      // Handle both naming conventions
      const startMs = word.startMs ?? word.startTimeMs ?? 0;
      const endMs = word.endMs ?? word.endTimeMs ?? 0;

      if (currentTimeMs >= startMs && currentTimeMs < endMs) {
        wordIndex = i;
        break;
      }
      // If we're past this word but before the next, use this word
      if (currentTimeMs >= startMs) {
        wordIndex = i;
      }
    }

    // Only send highlight if word changed
    if (wordIndex !== -1 && wordIndex !== this.lastHighlightedWordIndex) {
      const word = wordTimeline[wordIndex];
      // Log every few updates to avoid spam
      if (this.syncLogCounter++ % 10 === 0) {
        console.log('VoxPage: Highlighting word', wordIndex, '"' + word.word + '"', 'at', currentTimeMs.toFixed(0), 'ms');
      }
      this.lastHighlightedWordIndex = wordIndex;
      this.highlightWord(paragraphIndex, wordIndex, Date.now());
    }

    return wordIndex;
  }

  /**
   * Calculate current progress in seconds
   * @param {Object} state - Playback state
   * @returns {number} Progress in seconds
   * @private
   */
  _getCurrentProgress(state) {
    if (state.paragraphs.length === 0) return 0;
    const paragraphProgress = state.currentIndex / state.paragraphs.length;
    return paragraphProgress * state.totalDuration;
  }

  /**
   * Calculate remaining playback time in seconds
   * @param {Object} state - Playback state
   * @returns {number} Remaining time in seconds
   * @private
   */
  _calculateTimeRemaining(state) {
    if (state.paragraphs.length === 0) return 0;

    const remainingParagraphs = state.paragraphs.length - state.currentIndex;
    const avgTimePerParagraph = state.totalDuration / state.paragraphs.length;

    return remainingParagraphs * avgTimePerParagraph;
  }

  // =========================================
  // Footer state sync (018-ui-redesign)
  // =========================================

  /**
   * T026: Send footer state update to content script
   * @param {Object} state - Playback state
   */
  async sendFooterStateUpdate(state) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const progress = state.paragraphs.length > 0
          ? (state.currentIndex / state.paragraphs.length) * 100
          : 0;

        const currentTime = this._formatTime(this._getCurrentProgress(state));
        const totalTime = this._formatTime(state.totalDuration);

        browser.tabs.sendMessage(tabs[0].id, {
          action: FooterMessageTypes.FOOTER_STATE_UPDATE,
          status: state.isPlaying ? (state.isPaused ? 'paused' : 'playing') : 'stopped',
          progress: progress,
          currentTime: currentTime,
          totalTime: totalTime,
          currentParagraph: state.currentIndex + 1,
          totalParagraphs: state.paragraphs.length,
          speed: state.speed
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      // Silently fail - footer might not be visible
    }
  }

  /**
   * Show the sticky footer on the active tab
   * @param {Object} [tab] - Optional specific tab
   * @param {Object} [initialState] - Optional initial state
   */
  async showStickyFooter(tab, initialState = null) {
    try {
      const targetTab = tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (targetTab) {
        // Get saved state from storage if not provided
        let state = initialState;
        if (!state) {
          const result = await browser.storage.local.get(StorageKey.FOOTER_STATE);
          state = result[StorageKey.FOOTER_STATE] || null;
        }

        browser.tabs.sendMessage(targetTab.id, {
          action: FooterMessageTypes.FOOTER_SHOW,
          initialState: state ? {
            isMinimized: state.isMinimized,
            position: state.position
          } : undefined
        }).catch(() => {
          // Content script might not be ready
        });

        // Enable paragraph selection mode
        browser.tabs.sendMessage(targetTab.id, {
          action: 'enableSelectionMode'
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      console.warn('VoxPage: Failed to show sticky footer:', error);
    }
  }

  /**
   * Hide the sticky footer on the active tab
   * @param {Object} [tab] - Optional specific tab
   */
  async hideStickyFooter(tab) {
    try {
      const targetTab = tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (targetTab) {
        browser.tabs.sendMessage(targetTab.id, {
          action: FooterMessageTypes.FOOTER_HIDE
        }).catch(() => {
          // Content script might not be ready
        });

        // Disable paragraph selection mode
        browser.tabs.sendMessage(targetTab.id, {
          action: 'disableSelectionMode'
        }).catch(() => {
          // Content script might not be ready
        });
      }
    } catch (error) {
      console.warn('VoxPage: Failed to hide sticky footer:', error);
    }
  }

  /**
   * Format seconds to time string (m:ss)
   * @param {number} seconds
   * @returns {string}
   * @private
   */
  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Create a UI coordinator instance
 * @returns {UICoordinator}
 */
export function createUICoordinator() {
  return new UICoordinator();
}

export default UICoordinator;
