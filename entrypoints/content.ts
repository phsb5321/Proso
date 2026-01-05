/**
 * VoxPage Content Script - Entry Point
 * Handles text extraction and highlighting on web pages.
 * Initializes all content modules and sets up message listeners.
 *
 * Migration: 022-plasmo-migration (T070-T072)
 * Migrated from: content/index.js (465 lines)
 *
 * @module entrypoints/content
 */

import { browser } from 'wxt/browser';
import * as extractor from '../utils/content/extractor';
import { HighlightManager, type WordTiming } from '../utils/content/highlight';
import { StickyFooter, type StorageState, type PlaybackState, type PlaybackStatus } from '../utils/content/sticky-footer';

// ============================================================================
// OCR Region Selection
// ============================================================================

/**
 * Region coordinates for OCR processing
 */
interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * RegionSelector class for OCR region selection overlay
 * Allows users to click and drag to select a screen region
 */
class RegionSelector {
  private overlay: HTMLDivElement | null = null;
  private selection: HTMLDivElement | null = null;
  private isSelecting = false;
  private startX = 0;
  private startY = 0;
  private onComplete: ((region: RegionRect | null) => void) | null = null;

  /**
   * Show the region selection overlay
   * @param callback Called when selection is complete or cancelled
   */
  show(callback: (region: RegionRect | null) => void): void {
    this.onComplete = callback;
    this.createOverlay();
  }

  /**
   * Hide and remove the overlay
   */
  hide(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.selection = null;
    this.isSelecting = false;
  }

  /**
   * Create the overlay elements
   */
  private createOverlay(): void {
    // Remove existing overlay if any
    this.hide();

    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'voxpage-region-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 2147483647;
      user-select: none;
    `;

    // Create instruction text
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      pointer-events: none;
    `;
    instructions.textContent = 'Click and drag to select region. Press Escape to cancel.';
    this.overlay.appendChild(instructions);

    // Create selection box (hidden initially)
    this.selection = document.createElement('div');
    this.selection.id = 'voxpage-region-selection';
    this.selection.style.cssText = `
      position: absolute;
      border: 2px solid #0D9488;
      background: rgba(13, 148, 136, 0.2);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
      display: none;
      pointer-events: none;
    `;
    this.overlay.appendChild(this.selection);

    // Event handlers
    this.overlay.addEventListener('mousedown', this.handleMouseDown);
    this.overlay.addEventListener('mousemove', this.handleMouseMove);
    this.overlay.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('keydown', this.handleKeyDown);

    // Add to DOM
    document.body.appendChild(this.overlay);
  }

  /**
   * Handle mouse down - start selection
   */
  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return; // Left click only

    this.isSelecting = true;
    this.startX = e.clientX;
    this.startY = e.clientY;

    if (this.selection) {
      this.selection.style.left = `${e.clientX}px`;
      this.selection.style.top = `${e.clientY}px`;
      this.selection.style.width = '0';
      this.selection.style.height = '0';
      this.selection.style.display = 'block';
    }
  };

  /**
   * Handle mouse move - update selection box
   */
  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isSelecting || !this.selection) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(this.startX, currentX);
    const top = Math.min(this.startY, currentY);
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);

    this.selection.style.left = `${left}px`;
    this.selection.style.top = `${top}px`;
    this.selection.style.width = `${width}px`;
    this.selection.style.height = `${height}px`;
  };

  /**
   * Handle mouse up - complete selection
   */
  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isSelecting) return;
    this.isSelecting = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(this.startX, currentX);
    const top = Math.min(this.startY, currentY);
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown);

    // Complete selection if region is meaningful (at least 10x10 pixels)
    if (width >= 10 && height >= 10) {
      const region: RegionRect = {
        x: Math.round(left * window.devicePixelRatio),
        y: Math.round(top * window.devicePixelRatio),
        width: Math.round(width * window.devicePixelRatio),
        height: Math.round(height * window.devicePixelRatio),
      };

      this.hide();
      if (this.onComplete) {
        this.onComplete(region);
      }
    } else {
      // Selection too small, treat as cancelled
      this.hide();
      if (this.onComplete) {
        this.onComplete(null);
      }
    }
  };

  /**
   * Handle escape key - cancel selection
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', this.handleKeyDown);
      this.hide();
      if (this.onComplete) {
        this.onComplete(null);
      }
    }
  };
}

// Singleton instance
let regionSelector: RegionSelector | null = null;

/**
 * Get or create region selector instance
 */
function getRegionSelector(): RegionSelector {
  if (!regionSelector) {
    regionSelector = new RegionSelector();
  }
  return regionSelector;
}

// ============================================================================
// CSS Injection
// ============================================================================

/**
 * Inject content CSS styles for highlighting
 * Required because WXT css[] property doesn't work reliably for all setups
 */
function injectContentStyles(): void {
  if (document.getElementById('voxpage-content-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'voxpage-content-styles';
  style.textContent = `
    /* VoxPage Highlight Styles */
    .voxpage-highlight {
      background: linear-gradient(
        135deg,
        rgba(13, 148, 136, 0.15) 0%,
        rgba(20, 184, 166, 0.15) 100%
      ) !important;
      border-left: 3px solid #0D9488 !important;
      padding-left: 12px !important;
      margin-left: -15px !important;
      border-radius: 0 8px 8px 0 !important;
      transition: all 0.3s ease !important;
      box-shadow: 0 2px 8px rgba(13, 148, 136, 0.1) !important;
      scroll-margin-top: 80px !important;
      scroll-margin-bottom: 20px !important;
    }

    @keyframes voxpage-pulse {
      0%, 100% { box-shadow: 0 2px 8px rgba(13, 148, 136, 0.1); }
      50% { box-shadow: 0 2px 16px rgba(13, 148, 136, 0.25); }
    }

    .voxpage-highlight {
      animation: voxpage-pulse 2s ease-in-out infinite;
    }

    @media (prefers-color-scheme: dark) {
      .voxpage-highlight {
        background: linear-gradient(
          135deg,
          rgba(13, 148, 136, 0.25) 0%,
          rgba(20, 184, 166, 0.25) 100%
        ) !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .voxpage-highlight {
        animation: none !important;
        transition: none !important;
      }
    }

    /* Word-level highlighting using CSS Custom Highlight API */
    ::highlight(voxpage-word) {
      background-color: rgba(13, 148, 136, 0.4);
      color: inherit;
    }

    @media (prefers-color-scheme: dark) {
      ::highlight(voxpage-word) {
        background-color: rgba(20, 184, 166, 0.5);
      }
    }
  `;

  document.head.appendChild(style);
  console.log('VoxPage: Content styles injected');
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Legacy message format (backward compatibility until background service is migrated)
 */
interface LegacyMessage {
  action: string;
  [key: string]: unknown;
}

/**
 * Playback state update message
 */
interface PlaybackStateMessage extends LegacyMessage {
  action: 'updatePlaybackState';
  isPlaying: boolean;
  progress?: number;
  timeRemaining?: number;
}

/**
 * Footer state update message
 */
interface FooterStateMessage extends LegacyMessage {
  action: 'FOOTER_STATE_UPDATE';
  status?: string;
  progress?: number;
  currentTime?: string;
  totalTime?: string;
  currentParagraph?: number;
  totalParagraphs?: number;
  speed?: number;
}

/**
 * Text extraction message
 */
interface ExtractTextMessage extends LegacyMessage {
  action: 'extractText';
  mode: 'selection' | 'article' | 'full';
}

/**
 * Highlight message
 */
interface HighlightMessage extends LegacyMessage {
  action: 'highlight';
  index: number;
  text: string;
  timestamp: number;
}

/**
 * Word timeline message
 */
interface WordTimelineMessage extends LegacyMessage {
  action: 'setWordTimeline';
  wordTimeline: Array<{ word: string; startMs: number; endMs: number }>;
  paragraphIndex: number;
}

/**
 * Word highlight message
 */
interface WordHighlightMessage extends LegacyMessage {
  action: 'highlightWord';
  paragraphIndex: number;
  wordIndex: number;
  timestamp: number;
}

/**
 * Footer show message
 */
interface FooterShowMessage extends LegacyMessage {
  action: 'FOOTER_SHOW';
  initialState?: {
    isPlaying?: boolean;
    currentIndex?: number;
    totalParagraphs?: number;
    progress?: number;
    speed?: number;
  };
}

/**
 * Footer position message
 */
interface FooterPositionMessage extends LegacyMessage {
  action: 'showFloatingController';
  position?: {
    x: 'left' | 'center' | 'right' | number;
    yOffset: number;
  };
}

// ============================================================================
// WXT Content Script Definition
// ============================================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  main() {
    console.log('VoxPage: Content script starting (WXT TypeScript)');

    // Inject highlight CSS into page
    injectContentStyles();

    // ========================================================================
    // Module Initialization
    // ========================================================================

    let highlightManager: HighlightManager | null = null;
    let stickyFooter: StickyFooter | null = null;

    // Prevent re-initialization
    if ((window as any).VoxPage?._contentInitialized) {
      console.log('VoxPage: Content script already initialized, skipping');
      return;
    }

    // Initialize VoxPage namespace for backward compatibility
    (window as any).VoxPage = (window as any).VoxPage || {};
    (window as any).VoxPage._contentInitialized = true;

    // Initialize modules
    try {
      highlightManager = new HighlightManager();
      stickyFooter = new StickyFooter();

      console.log('VoxPage: Modules initialized successfully', {
        hasExtractor: true, // extractor is a module with functions
        hasHighlightManager: !!highlightManager,
        hasStickyFooter: !!stickyFooter,
      });
    } catch (error) {
      console.error('VoxPage: Failed to initialize modules:', error);
      return;
    }

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /**
     * Format time remaining in seconds to MM:SS format
     */
    function formatTimeRemaining(seconds: number | undefined): string {
      if (!seconds || seconds < 0) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Jump to a clicked paragraph (only during active playback)
     */
    function jumpToClickedParagraph(index: number): void {
      browser.runtime
        .sendMessage({
          action: 'jumpToParagraph',
          index: index,
        })
        .catch((err) => {
          console.error('VoxPage: Failed to jump to paragraph:', err);
        });
    }

    /**
     * Setup paragraph click handlers
     * - During playback: clicking a paragraph jumps to it
     * - Selection mode: clicking selects (visual only), play icon starts playback
     * - Neither: paragraph clicks are ignored to prevent accidental triggers
     */
    function setupParagraphClickHandlers(): void {
      document.addEventListener('click', (event: MouseEvent) => {
        if (!highlightManager) return;

        const target = event.target as HTMLElement;

        // Ignore clicks on play icons (they have their own handlers)
        if (target.closest('.voxpage-play-icon')) {
          return;
        }

        // Check if we clicked on a selectable paragraph (selection mode)
        const selectableEl = target.closest('.voxpage-selectable') as HTMLElement;
        if (selectableEl && (window as any).VoxPage?.paragraphSelector?.isActive?.()) {
          const index = parseInt(selectableEl.dataset.voxpageSelectIndex || '', 10);
          if (!isNaN(index)) {
            // Selection mode: just select visually, don't play
            (window as any).VoxPage.paragraphSelector?.selectParagraph?.(index);
          }
          return;
        }

        // Check if we clicked on an active highlight (during playback)
        const highlightedEl = target.closest('.voxpage-highlight') as HTMLElement;
        if (highlightedEl) {
          const index = parseInt(highlightedEl.dataset.voxpageIndex || '', 10);
          if (!isNaN(index)) {
            // During playback: jump to the clicked paragraph
            jumpToClickedParagraph(index);
          }
          return;
        }

        // Check if clicking on an extracted paragraph during active playback
        const extractedParagraphs = extractor.getExtractedParagraphs();
        const highlightElements = highlightManager.getHighlightElements();

        // Only allow paragraph jumping if playback is active (highlights exist)
        if (highlightElements.length > 0) {
          const clickedParagraph = extractedParagraphs.findIndex((el) =>
            el.contains(target) || el === target
          );

          if (clickedParagraph !== -1) {
            jumpToClickedParagraph(clickedParagraph);
          }
        }
        // If no playback active and not in selection mode, clicks are ignored
      });
    }

    /**
     * Extract page language information
     * TODO: Migrate language-extractor.js to utils/content/language-extractor.ts
     */
    function extractPageLanguage(): {
      metadata: string | null;
      textSample: string;
      url: string;
    } {
      // Get HTML lang attribute
      const htmlLang = document.documentElement.lang || null;

      // Check meta tags for language
      let metaLang: string | null = null;
      const metaElements = document.querySelectorAll(
        'meta[http-equiv="content-language"], meta[name="language"]'
      );
      for (let i = 0; i < metaElements.length; i++) {
        const content = metaElements[i].getAttribute('content');
        if (content) {
          metaLang = content;
          break;
        }
      }

      // Use HTML lang or meta lang
      const metadata = htmlLang || metaLang;

      // Extract text sample from main content
      const textSample = extractTextSample();

      return {
        metadata,
        textSample,
        url: window.location.href,
      };
    }

    /**
     * Extract a text sample from the page for language detection
     */
    function extractTextSample(): string {
      const contentSelectors = [
        'article',
        'main',
        '#content',
        '[role="main"]',
        '.content',
        '#mw-content-text', // Wikipedia
      ];

      let textSample = '';

      // Try to extract from main content areas first
      for (const selector of contentSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          textSample = container.textContent?.trim() || '';
          if (textSample.length > 500) {
            break;
          }
        }
      }

      // Fallback to body if no good content found
      if (textSample.length < 100) {
        textSample = document.body.textContent?.trim() || '';
      }

      // Limit to 1000 characters for efficiency
      return textSample.substring(0, 1000);
    }

    /**
     * Send language detection request to background
     */
    function sendLanguageDetectionRequest(): void {
      const langData = extractPageLanguage();
      browser.runtime
        .sendMessage({
          action: 'languageDetected',
          metadata: langData.metadata,
          textSample: langData.textSample,
          url: langData.url,
        })
        .catch((err) => {
          console.error('VoxPage: Failed to send language detection:', err);
        });
    }

    // ========================================================================
    // Message Listener
    // ========================================================================

    console.log('VoxPage: Setting up message listener');

    browser.runtime.onMessage.addListener((message: LegacyMessage & { type?: string }) => {
      // Support both 'action' (legacy) and 'type' (new protocol) fields
      const messageKey = message.action || message.type;
      console.log('VoxPage: Received message:', messageKey);

      if (!highlightManager || !stickyFooter) {
        console.warn('VoxPage: Modules not initialized, ignoring message');
        return;
      }

      switch (messageKey) {
        // ====================================================================
        // Content Extraction
        // ====================================================================
        case 'extractText': {
          const msg = message as ExtractTextMessage;
          const text = extractor.extractText(msg.mode);
          const paragraphTexts = extractor.getParagraphTexts();
          // Return the result directly so background can await it
          return Promise.resolve({
            text: text,
            paragraphs: paragraphTexts,
            mode: msg.mode,
          });
        }

        // ====================================================================
        // Highlighting
        // ====================================================================
        case 'highlight': {
          const msg = message as HighlightMessage;
          // Pass DOM elements and text lookup function for reliable highlighting
          const extractedParagraphs = extractor.getExtractedParagraphs();
          highlightManager.highlightParagraph(
            msg.index,
            msg.text,
            msg.timestamp,
            extractedParagraphs,
            extractor.findElementByText
          );
          break;
        }

        case 'clearHighlight': {
          highlightManager.clearHighlights();
          break;
        }

        case 'setWordTimeline': {
          const msg = message as WordTimelineMessage;
          // Convert legacy format {word, startMs, endMs} to {word, charOffset, charLength, startTimeMs, endTimeMs}
          // Note: charOffset and charLength are computed in HighlightManager from the word text
          const convertedTimeline: WordTiming[] = msg.wordTimeline.map((item, index) => ({
            word: item.word,
            charOffset: 0, // Will be computed by HighlightManager
            charLength: item.word.length,
            startTimeMs: item.startMs,
            endTimeMs: item.endMs,
          }));
          highlightManager.setWordTimeline(convertedTimeline, msg.paragraphIndex);
          break;
        }

        case 'highlightWord': {
          const msg = message as WordHighlightMessage;
          highlightManager.highlightWord(msg.paragraphIndex, msg.wordIndex, msg.timestamp);
          break;
        }

        case 'jumpToWord': {
          // Type guard to narrow message to expected shape
          if ('paragraphIndex' in message && 'wordIndex' in message) {
            const { paragraphIndex, wordIndex } = message as LegacyMessage & {
              paragraphIndex: number;
              wordIndex: number;
            };
            browser.runtime
              .sendMessage({
                action: 'jumpToWord',
                paragraphIndex,
                wordIndex,
              })
              .catch((err) => {
                console.error('VoxPage: Failed to jump to word:', err);
              });
          }
          break;
        }

        // ====================================================================
        // Floating Controller (Legacy - TODO: Remove after sticky footer migration)
        // ====================================================================
        case 'showFloatingController': {
          const msg = message as FooterPositionMessage;
          if ((window as any).VoxPage?.floatingController) {
            (window as any).VoxPage.floatingController.show(msg.position);
            (window as any).VoxPage.floatingController.onAction(
              (action: string, data: unknown) => {
                browser.runtime
                  .sendMessage({
                    action: 'controllerAction',
                    controllerAction: action,
                    ...((data as object) || {}),
                  })
                  .catch((err) => {
                    console.error('VoxPage: Failed to send controller action:', err);
                  });
              }
            );
          }
          break;
        }

        case 'hideFloatingController': {
          if ((window as any).VoxPage?.floatingController) {
            (window as any).VoxPage.floatingController.hide();
          }
          break;
        }

        case 'updatePlaybackState': {
          const msg = message as PlaybackStateMessage;
          if ((window as any).VoxPage?.floatingController) {
            const status = msg.isPlaying ? 'playing' : 'paused';
            const timeRemaining = formatTimeRemaining(msg.timeRemaining);
            (window as any).VoxPage.floatingController.updateState({
              status: status,
              progress: msg.progress || 0,
              timeRemaining: timeRemaining,
            });
          }
          break;
        }

        // ====================================================================
        // Sticky Footer
        // ====================================================================
        case 'FOOTER_SHOW': {
          const msg = message as FooterShowMessage;
          // Convert legacy initialState to StorageState format
          const storageState: Partial<StorageState> = {
            isMinimized: false,
            position: { x: 'center', yOffset: 0 },
          };
          stickyFooter.show(storageState);
          break;
        }

        case 'FOOTER_HIDE': {
          stickyFooter.hide();
          break;
        }

        case 'FOOTER_STATE_UPDATE': {
          const msg = message as FooterStateMessage;
          // Convert status string to PlaybackStatus type
          const status = (msg.status || 'stopped') as PlaybackStatus;
          const playbackState: Partial<PlaybackState> = {
            status,
            progress: msg.progress ?? 0,
            currentTime: msg.currentTime ?? '0:00',
            totalTime: msg.totalTime ?? '0:00',
            currentParagraph: msg.currentParagraph ?? 0,
            totalParagraphs: msg.totalParagraphs ?? 0,
            speed: msg.speed ?? 1.0,
          };
          stickyFooter.updateState(playbackState);
          break;
        }

        case 'TOGGLE_FOOTER_SETTINGS': {
          // If footer is visible, do nothing (settings are part of the footer)
          // If footer is hidden, show it
          if (!stickyFooter.isFooterVisible()) {
            stickyFooter.show();
          }
          // Note: Settings toggle functionality should be handled within the footer UI
          break;
        }

        // ====================================================================
        // Paragraph Selection Mode
        // ====================================================================
        case 'enableSelectionMode': {
          if ((window as any).VoxPage?.paragraphSelector) {
            (window as any).VoxPage.paragraphSelector.enableSelectionMode();
          }
          break;
        }

        case 'disableSelectionMode': {
          if ((window as any).VoxPage?.paragraphSelector) {
            (window as any).VoxPage.paragraphSelector.disableSelectionMode();
          }
          break;
        }

        case 'refreshSelection': {
          if ((window as any).VoxPage?.paragraphSelector) {
            (window as any).VoxPage.paragraphSelector.refresh();
          }
          break;
        }

        // ====================================================================
        // Language Detection
        // ====================================================================
        case 'extractLanguage': {
          sendLanguageDetectionRequest();
          break;
        }

        // ====================================================================
        // OCR Region Selection
        // ====================================================================
        case 'ocr.enableRegionSelection': {
          console.log('VoxPage: Enabling OCR region selection');
          const selector = getRegionSelector();
          selector.show(async (region) => {
            if (region) {
              console.log('VoxPage: Region selected:', region);
              // Send region to background for capture and OCR
              try {
                const response = await browser.runtime.sendMessage({
                  type: 'ocr.captureAndRead',
                  request: {
                    tabId: 0, // Will be set by background
                    region: region,
                    languages: ['eng'],
                  },
                });
                console.log('VoxPage: OCR response:', response);
                // Send result back to popup
                if (response) {
                  browser.runtime.sendMessage({
                    action: 'ocr.regionResult',
                    ...response,
                  }).catch(() => {
                    // Popup may be closed
                  });
                }
              } catch (err) {
                console.error('VoxPage: OCR capture failed:', err);
              }
            } else {
              console.log('VoxPage: Region selection cancelled');
              // Notify popup that selection was cancelled
              browser.runtime.sendMessage({
                action: 'ocr.regionResult',
                success: false,
                error: 'Selection cancelled',
              }).catch(() => {
                // Popup may be closed
              });
            }
          });
          return Promise.resolve({ success: true });
        }

        case 'ocr.cancelRegionSelection': {
          console.log('VoxPage: Cancelling OCR region selection');
          const selector = getRegionSelector();
          selector.hide();
          return Promise.resolve({ success: true });
        }

        // ====================================================================
        // Browser TTS (Web Speech API)
        // ====================================================================
        case 'speakText': {
          const msg = message as { action: string; text: string; speed?: number };
          const text = msg.text;
          const speed = msg.speed ?? 1.0;

          return new Promise<{ success: boolean }>((resolve) => {
            if (typeof speechSynthesis === 'undefined') {
              console.error('VoxPage: Web Speech API not available');
              resolve({ success: false });
              return;
            }

            // Cancel any ongoing speech
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = Math.max(0.5, Math.min(2.0, speed));

            // Try to use a good voice
            const voices = speechSynthesis.getVoices();
            const englishVoice = voices.find(v => v.lang.startsWith('en') && v.localService);
            if (englishVoice) {
              utterance.voice = englishVoice;
            }

            utterance.onend = () => {
              console.log('VoxPage: Speech ended');
              resolve({ success: true });
            };

            utterance.onerror = (event) => {
              if (event.error !== 'canceled') {
                console.error('VoxPage: Speech error:', event.error);
              }
              resolve({ success: false });
            };

            console.log('VoxPage: Speaking text of length', text.length);
            speechSynthesis.speak(utterance);
          });
        }

        case 'stopSpeech': {
          if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
            console.log('VoxPage: Speech cancelled');
          }
          return Promise.resolve({ success: true });
        }

        // ====================================================================
        // Audio Playback (for ElevenLabs and other API providers)
        // ====================================================================
        case 'playAudio': {
          const msg = message as { action: string; audioUrl: string; speed?: number };
          const audioUrl = msg.audioUrl;
          const speed = msg.speed ?? 1.0;

          return new Promise<{ success: boolean }>((resolve) => {
            // Stop any existing audio
            if ((window as any).__voxpageAudio) {
              (window as any).__voxpageAudio.pause();
              (window as any).__voxpageAudio.src = '';
              (window as any).__voxpageAudio = null;
            }

            const audio = new Audio(audioUrl);
            (window as any).__voxpageAudio = audio;
            audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

            audio.onended = () => {
              console.log('VoxPage: Audio playback ended');
              (window as any).__voxpageAudio = null;
              resolve({ success: true });
            };

            audio.onerror = (event) => {
              console.error('VoxPage: Audio playback error:', event);
              (window as any).__voxpageAudio = null;
              resolve({ success: false });
            };

            console.log('VoxPage: Playing audio, speed:', speed);
            audio.play().catch((err) => {
              console.error('VoxPage: Audio play() failed:', err);
              resolve({ success: false });
            });
          });
        }

        case 'stopAudio': {
          if ((window as any).__voxpageAudio) {
            (window as any).__voxpageAudio.pause();
            (window as any).__voxpageAudio.src = '';
            (window as any).__voxpageAudio = null;
            console.log('VoxPage: Audio stopped');
          }
          return Promise.resolve({ success: true });
        }

        // ====================================================================
        // Queue Notifications (T075 - cross-tab sync)
        // ====================================================================
        case 'queue.updated': {
          // Queue state changed - content script doesn't need to act on this
          // (popup handles queue UI updates via its own message listener)
          return Promise.resolve({ success: true });
        }

        default:
          console.warn('VoxPage: Unknown message action:', message.action);
      }
    });

    // ========================================================================
    // Event Listeners
    // ========================================================================

    // Setup click handlers when script loads
    setupParagraphClickHandlers();

    /**
     * Scroll event listener for auto-scroll debounce
     * Implements FR-010: Pause auto-scroll when user manually scrolls
     */
    let scrollListenerDebounce: number | null = null;
    window.addEventListener(
      'scroll',
      () => {
        // Debounce scroll events to avoid excessive calls
        if (scrollListenerDebounce) {
          clearTimeout(scrollListenerDebounce);
        }
        scrollListenerDebounce = window.setTimeout(() => {
          // Notify highlight manager of user scroll
          if ((window as any).VoxPage?.highlightManager?.onUserScroll) {
            (window as any).VoxPage.highlightManager.onUserScroll();
          }
          scrollListenerDebounce = null;
        }, 100); // 100ms debounce for scroll events
      },
      { passive: true }
    );

    /**
     * Cleanup callbacks array for extensible cleanup
     * Allows modules to register cleanup functions
     */
    const cleanupCallbacks: Array<(reason: string) => void> = [];

    /**
     * Execute all cleanup callbacks
     */
    function executeCleanup(reason: string): void {
      console.log(`VoxPage: Executing cleanup (reason: ${reason})`);

      // Send stop message to background
      browser.runtime
        .sendMessage({
          action: 'stopPlayback',
          reason: reason,
        })
        .catch(() => {
          // Ignore errors during unload - background may not be available
        });

      // Hide floating controller
      if ((window as any).VoxPage?.floatingController) {
        (window as any).VoxPage.floatingController.hide();
      }

      // Hide sticky footer
      if (stickyFooter) {
        stickyFooter.hide();
      }

      // Clear all highlights
      if (highlightManager) {
        highlightManager.clearHighlights();
      }

      // Execute registered callbacks
      cleanupCallbacks.forEach((cb) => {
        try {
          cb(reason);
        } catch (e) {
          console.warn('VoxPage: Cleanup callback failed:', e);
        }
      });
    }

    /**
     * Register a cleanup callback
     */
    function registerCleanupCallback(callback: (reason: string) => void): void {
      if (typeof callback === 'function') {
        cleanupCallbacks.push(callback);
      }
    }

    // Expose cleanup registration on namespace
    (window as any).VoxPage.registerCleanupCallback = registerCleanupCallback;

    /**
     * Handle pagehide event (primary navigation handler)
     * Implements FR-011: Stop audio on page navigation
     */
    window.addEventListener('pagehide', () => {
      executeCleanup('navigation');
    });

    /**
     * Handle beforeunload event (backup for reload detection)
     * Implements FR-012: Stop audio on page reload
     */
    window.addEventListener('beforeunload', () => {
      executeCleanup('beforeunload');
    });

    /**
     * Handle page visibility changes - notify background for resync
     * Implements FR-005: Resync within 500ms when tab becomes visible
     */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const resyncStart = performance.now();
        browser.runtime
          .sendMessage({
            action: 'requestResync',
            reason: 'tab-visible',
            timestamp: Date.now(),
          })
          .then(() => {
            const resyncDuration = performance.now() - resyncStart;
            if (resyncDuration > 500) {
              console.warn(
                `VoxPage: Resync took ${resyncDuration.toFixed(0)}ms, exceeds 500ms target (FR-005)`
              );
            } else {
              console.log(
                `VoxPage: Resync completed in ${resyncDuration.toFixed(0)}ms (FR-005)`
              );
            }
          })
          .catch(() => {
            // Background might not be ready - this is normal on initial page load
          });
      }
    });

    /**
     * MutationObserver for DOM changes
     * Monitors for removed highlight elements and updates internal state
     */
    let mutationDebounceTimer: number | null = null;
    const MUTATION_DEBOUNCE_MS = 500;

    const mutationObserver = new MutationObserver((mutations) => {
      if (!highlightManager) return;

      const highlightElements = highlightManager.getHighlightElements();

      const hasRelevantMutations = mutations.some((mutation) => {
        if (
          highlightElements.some(
            (el) => mutation.target.contains(el) || el.contains(mutation.target)
          )
        ) {
          return true;
        }
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });

      if (hasRelevantMutations) {
        if (mutationDebounceTimer) {
          clearTimeout(mutationDebounceTimer);
        }

        mutationDebounceTimer = window.setTimeout(() => {
          const extractedParagraphs = extractor.getExtractedParagraphs();
          extractor.setExtractedParagraphs(
            extractedParagraphs.filter((el) => document.body.contains(el))
          );
          highlightManager.filterValidHighlightElements();
          mutationDebounceTimer = null;
        }, MUTATION_DEBOUNCE_MS);
      }
    });

    // Start observing DOM changes
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
    });

    /**
     * Send language detection on page load
     * Automatically detect page language after content loads
     */
    function sendInitialLanguageDetection(): void {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        sendLanguageDetectionRequest();
        console.log('VoxPage: Sent initial language detection request');
      }, 100);
    }

    // Send language detection on load
    if (document.readyState === 'complete') {
      sendInitialLanguageDetection();
    } else {
      window.addEventListener('load', sendInitialLanguageDetection, { once: true });
    }

    console.log('VoxPage content script fully loaded and message listener registered');
  },
});
