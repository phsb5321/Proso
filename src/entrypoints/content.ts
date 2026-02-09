// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

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
import {
  StickyFooter,
  type StorageState,
  type PlaybackState,
  type PlaybackStatus,
} from '../utils/content/sticky-footer';
import { ParagraphSelector } from '../utils/content/paragraph-selector';
import { ParagraphIndicator, type ParagraphStatus } from '../utils/content/paragraph-indicator';
import { usageTracker, hashUrlSync } from '../utils/telemetry/usage';
import {
  type PersistentHighlightManager,
  createPersistentHighlightManager,
} from '../utils/content/persistent-highlight';
import type { TextQuoteSelector } from '../core/highlight';
import type { HighlightColor } from '../utils/schemas/highlight.schema';

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

    /* Paragraph Selection Mode Styles */
    .voxpage-selectable {
      position: relative;
      cursor: pointer;
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
      border-radius: 4px;
    }

    .voxpage-selectable:hover {
      background-color: rgba(13, 148, 136, 0.08) !important;
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
    }

    /* T008: Focus-within state for keyboard navigation (035-selection-tts-hardening) */
    .voxpage-selectable:focus-within {
      background-color: rgba(13, 148, 136, 0.08) !important;
      outline: 2px solid rgba(13, 148, 136, 0.5);
      outline-offset: 2px;
    }

    .voxpage-selectable:hover .voxpage-play-icon,
    .voxpage-selectable:focus-within .voxpage-play-icon {
      opacity: 1;
      transform: scale(1);
    }

    .voxpage-selected {
      background-color: rgba(13, 148, 136, 0.15) !important;
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.4) !important;
    }

    .voxpage-cached {
      border-left: 3px solid #10B981 !important;
      padding-left: 8px !important;
    }

    .voxpage-cached::before {
      content: "✓";
      position: absolute;
      left: -20px;
      top: 0;
      font-size: 12px;
      color: #10B981;
      font-weight: bold;
    }

    .voxpage-play-icon {
      position: absolute;
      left: -32px;
      top: 50%;
      transform: translateY(-50%) scale(0.8);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #0D9488;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      z-index: 10;
    }

    .voxpage-play-icon::before {
      content: "";
      width: 0;
      height: 0;
      border-left: 8px solid white;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      margin-left: 2px;
    }

    .voxpage-play-icon:hover {
      background: #0F766E;
      transform: translateY(-50%) scale(1.1);
    }

    /* T008: Focus state for play icon (035-selection-tts-hardening) */
    .voxpage-play-icon:focus {
      opacity: 1;
      background: #14B8A6;
    }

    .voxpage-play-icon:focus-visible {
      opacity: 1;
      outline: 2px solid #0D9488;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .voxpage-play-icon:focus:not(:focus-visible) {
      outline: none;
    }

    .voxpage-play-icon--inline {
      position: relative;
      left: 0;
      top: 0;
      transform: none;
      margin-right: 8px;
      opacity: 0;
      display: inline-flex;
      vertical-align: middle;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .voxpage-selectable:hover .voxpage-play-icon--inline,
    .voxpage-selectable:focus-within .voxpage-play-icon--inline {
      opacity: 1;
    }

    .voxpage-play-icon--inline:hover {
      transform: scale(1.1);
    }

    .voxpage-play-icon--inline:focus-visible {
      opacity: 1;
      outline: 2px solid #0D9488;
      outline-offset: 2px;
    }

    @media (prefers-color-scheme: dark) {
      .voxpage-selectable:hover {
        background-color: rgba(20, 184, 166, 0.12) !important;
        box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.3);
      }

      /* T008: Focus-within in dark mode */
      .voxpage-selectable:focus-within {
        background-color: rgba(20, 184, 166, 0.12) !important;
        outline-color: rgba(20, 184, 166, 0.6);
      }

      .voxpage-selected {
        background-color: rgba(20, 184, 166, 0.2) !important;
        box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.5) !important;
      }

      .voxpage-play-icon {
        background: #14B8A6;
      }

      .voxpage-play-icon:hover {
        background: #0D9488;
      }

      /* T008: Focus states in dark mode */
      .voxpage-play-icon:focus,
      .voxpage-play-icon:focus-visible {
        background: #2DD4BF;
      }

      .voxpage-play-icon:focus-visible {
        outline-color: #14B8A6;
        box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .voxpage-selectable,
      .voxpage-play-icon {
        transition: none !important;
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
  wordTimeline: Array<{
    word: string;
    charOffset?: number;
    charLength?: number;
    startMs: number;
    endMs: number;
  }>;
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
    let paragraphSelector: ParagraphSelector | null = null;
    let paragraphIndicator: ParagraphIndicator | null = null;
    let persistentHighlightManager: PersistentHighlightManager | null = null;

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
      paragraphSelector = new ParagraphSelector();
      paragraphIndicator = new ParagraphIndicator();
      persistentHighlightManager = createPersistentHighlightManager();

      // Expose modules on namespace for legacy code
      (window as any).VoxPage.paragraphSelector = paragraphSelector;
      (window as any).VoxPage.paragraphIndicator = paragraphIndicator;
      (window as any).VoxPage.persistentHighlightManager = persistentHighlightManager;

      console.log('VoxPage: Modules initialized successfully', {
        hasExtractor: true, // extractor is a module with functions
        hasHighlightManager: !!highlightManager,
        hasStickyFooter: !!stickyFooter,
        hasParagraphSelector: !!paragraphSelector,
        hasParagraphIndicator: !!paragraphIndicator,
        hasPersistentHighlightManager: !!persistentHighlightManager,
      });

      // Setup persistent highlight callbacks (T087-T092)
      setupPersistentHighlightCallbacks(persistentHighlightManager);

      // T017: Initialize telemetry for content script
      initContentTelemetry();
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
      // T017: Track paragraph click
      trackParagraphClick(index);

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
          const index = Number.parseInt(selectableEl.dataset.voxpageSelectIndex || '', 10);
          if (!isNaN(index)) {
            // Selection mode: just select visually, don't play
            (window as any).VoxPage.paragraphSelector?.selectParagraph?.(index);
          }
          return;
        }

        // Check if we clicked on an active highlight (during playback)
        const highlightedEl = target.closest('.voxpage-highlight') as HTMLElement;
        if (highlightedEl) {
          const index = Number.parseInt(highlightedEl.dataset.voxpageIndex || '', 10);
          if (!isNaN(index)) {
            // During playback: jump to the clicked paragraph
            jumpToClickedParagraph(index);
          }
          return;
        }

        // Check if clicking on an extracted paragraph
        const extractedParagraphs = extractor.getExtractedParagraphs();
        const highlightElements = highlightManager.getHighlightElements();

        // T046: Allow clicking paragraphs even before playback starts
        // If content has been extracted, allow starting playback from clicked paragraph
        if (extractedParagraphs.length > 0) {
          const clickedParagraph = extractedParagraphs.findIndex(
            (el) => el.contains(target) || el === target,
          );

          if (clickedParagraph !== -1) {
            // During active playback (highlights exist) OR starting fresh playback
            jumpToClickedParagraph(clickedParagraph);
          }
        }
        // If no content extracted, clicks are ignored
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
        'meta[http-equiv="content-language"], meta[name="language"]',
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
    // Persistent Highlights (T087-T092: 045-pdf-removal-page-reader Phase 4)
    // ========================================================================

    /**
     * Setup callbacks for persistent highlight manager.
     * Handles selection changes and highlight actions (delete, note, color change).
     */
    function setupPersistentHighlightCallbacks(manager: PersistentHighlightManager): void {
      // Track current selection for highlight creation
      let currentSelection: TextQuoteSelector | null = null;

      // Selection change callback - notify background when text is selected
      manager.onSelectionChange((selector) => {
        currentSelection = selector;
        // Send selection state to background for potential highlight creation
        if (selector) {
          browser.runtime
            .sendMessage({
              type: 'highlight.selectionChanged',
              hasSelection: true,
              exact: selector.exact,
            })
            .catch(() => {
              // Ignore errors - background may not be listening
            });
        }
      });

      // Highlight action callback - handle context menu actions
      manager.onHighlightAction((action, highlightId, data) => {
        switch (action) {
          case 'delete':
            // Delete highlight from storage
            browser.runtime
              .sendMessage({
                type: 'highlight.delete',
                id: highlightId,
              })
              .then((response: { success: boolean }) => {
                if (response.success) {
                  manager.removeHighlight(highlightId);
                  console.log('VoxPage: Highlight deleted:', highlightId);
                }
              })
              .catch((err) => {
                console.error('VoxPage: Failed to delete highlight:', err);
              });
            break;

          case 'note': {
            // Prompt user for note (simple implementation)
            const note = prompt('Add a note to this highlight:');
            if (note !== null) {
              browser.runtime
                .sendMessage({
                  type: 'highlight.update',
                  id: highlightId,
                  note: note,
                })
                .catch((err) => {
                  console.error('VoxPage: Failed to add note:', err);
                });
            }
            break;
          }

          case 'changeColor': {
            const color = data as HighlightColor;
            browser.runtime
              .sendMessage({
                type: 'highlight.update',
                id: highlightId,
                color: color,
              })
              .then((response: { success: boolean }) => {
                if (response.success) {
                  manager.updateHighlightColor(highlightId, color);
                  console.log('VoxPage: Highlight color changed:', highlightId, color);
                }
              })
              .catch((err) => {
                console.error('VoxPage: Failed to change color:', err);
              });
            break;
          }
        }
      });

      // Expose function to get current selection
      (window as any).VoxPage.getCurrentSelection = () => currentSelection;
    }

    /**
     * Load and render highlights for the current page.
     * Called on page load to restore saved highlights.
     */
    async function loadPageHighlights(): Promise<void> {
      if (!persistentHighlightManager) return;

      try {
        const url = window.location.href;
        const response = (await browser.runtime.sendMessage({
          type: 'highlight.list',
          url: url,
        })) as {
          success: boolean;
          highlights: Array<{
            id: string;
            exact: string;
            prefix?: string;
            suffix?: string;
            color: HighlightColor;
            orphaned: boolean;
          }>;
        };

        if (!response.success || !response.highlights.length) {
          return;
        }

        console.log(`VoxPage: Loading ${response.highlights.length} highlights for page`);

        // Convert to format expected by reanchorHighlights
        const highlightsToRender = response.highlights.map((h) => ({
          id: h.id,
          selector: {
            type: 'TextQuoteSelector' as const,
            exact: h.exact,
            prefix: h.prefix,
            suffix: h.suffix,
          },
          color: h.color,
          hasNote: false, // TODO: Include note info in response
        }));

        // Render highlights and track orphans
        const orphanStatus = await persistentHighlightManager.reanchorHighlights(highlightsToRender);

        // Report orphaned highlights to background for status update
        const orphanedIds = Array.from(orphanStatus.entries())
          .filter(([_, isOrphaned]) => isOrphaned)
          .map(([id]) => id);

        if (orphanedIds.length > 0) {
          console.warn(`VoxPage: ${orphanedIds.length} highlights could not be anchored (orphaned)`);
          // Notify background about orphaned highlights
          browser.runtime
            .sendMessage({
              type: 'highlight.reportOrphans',
              highlightIds: orphanedIds,
              url: url,
            })
            .catch(() => {
              // Ignore - background may not handle this message
            });
        }
      } catch (error) {
        console.error('VoxPage: Failed to load page highlights:', error);
      }
    }

    // ========================================================================
    // Telemetry (T017: Content Script Telemetry)
    // ========================================================================

    /**
     * Initialize usage tracker for content script context.
     * Loads config from storage and tracks content.injected event.
     */
    async function initContentTelemetry(): Promise<void> {
      try {
        // Load telemetry config from storage
        const stored = await browser.storage.local.get([
          'telemetryEnabled',
          'telemetryGatewayUrl',
          'telemetryGatewayToken',
        ]);

        // Skip if telemetry is disabled
        if (stored.telemetryEnabled === false) {
          return;
        }

        // Only initialize if gateway is configured
        const gatewayUrl = stored.telemetryGatewayUrl as string | undefined;
        const gatewayToken = stored.telemetryGatewayToken as string | undefined;

        if (!gatewayUrl || !gatewayToken) {
          return;
        }

        await usageTracker.initialize({
          gatewayUrl,
          gatewayToken,
          entrypoint: 'content',
          debugMode: false, // Keep content script quiet
        });

        // Track content script injection with privacy-safe URL hash
        const urlHash = hashUrlSync(window.location.href);

        usageTracker.track('content.injected', {
          urlHash,
        });

        // Track content unload
        window.addEventListener('beforeunload', () => {
          usageTracker.track('content.cleanup', { urlHash });
        });
      } catch (error) {
        // Silently fail - telemetry should never break the extension
        console.debug('[VoxPage] Telemetry init failed:', error);
      }
    }

    /**
     * Track paragraph click events.
     * Called when user clicks on a paragraph during playback.
     */
    function trackParagraphClick(index: number): void {
      if (!usageTracker.isEnabled()) return;
      usageTracker.track('paragraph.clicked', {
        paragraphIndex: index,
        urlHash: hashUrlSync(window.location.href),
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
          const paragraphElements = extractor.getExtractedParagraphs();

          // T046: Enable selection mode for hover indicators
          if (paragraphSelector && paragraphElements.length > 0) {
            paragraphSelector.enableSelectionMode(paragraphElements, []).catch((err) => {
              console.warn('VoxPage: Failed to enable selection mode:', err);
            });
          }

          // Return the result directly so background can await it
          return Promise.resolve({
            text: text,
            paragraphs: paragraphTexts,
            mode: msg.mode,
          });
        }

        // T046: Handle getParagraphs from popup
        case 'getParagraphs': {
          // Extract content if not already extracted
          const needsExtraction = extractor.getExtractedParagraphs().length === 0;
          if (needsExtraction) {
            extractor.extractText('article');
          }
          const paragraphTexts = extractor.getParagraphTexts();
          const paragraphElements = extractor.getExtractedParagraphs();

          // T046: Enable selection mode for hover indicators (only on fresh extraction)
          if (needsExtraction && paragraphSelector && paragraphElements.length > 0) {
            paragraphSelector.enableSelectionMode(paragraphElements, []).catch((err) => {
              console.warn('VoxPage: Failed to enable selection mode:', err);
            });
          }

          return Promise.resolve({
            paragraphs: paragraphTexts.map((text, index) => ({
              index,
              text,
            })),
          });
        }

        // T046: Handle getArticleText from popup
        case 'getArticleText': {
          // Extract content if not already extracted
          const needsExtraction = extractor.getExtractedParagraphs().length === 0;
          if (needsExtraction) {
            extractor.extractText('article');
          }
          const paragraphElements = extractor.getExtractedParagraphs();

          // T046: Enable selection mode for hover indicators (only on fresh extraction)
          if (needsExtraction && paragraphSelector && paragraphElements.length > 0) {
            paragraphSelector.enableSelectionMode(paragraphElements, []).catch((err) => {
              console.warn('VoxPage: Failed to enable selection mode:', err);
            });
          }

          const fullText = extractor.getParagraphTexts().join('\n\n');
          return Promise.resolve({
            text: fullText,
            title: document.title,
            url: window.location.href,
          });
        }

        // ====================================================================
        // Article Extraction (045-pdf-removal-page-reader)
        // ====================================================================
        case 'EXTRACT_ARTICLE':
        case 'reader.extractArticle': {
          // Send full document HTML to background for Readability extraction
          // This allows the background to use the Reader handlers
          const html = document.documentElement.outerHTML;
          const url = window.location.href;

          // Forward to background's reader.extractArticle handler
          return browser.runtime
            .sendMessage({
              type: 'reader.extractArticle',
              html,
              url,
            })
            .then((result) => {
              // Return the result from the background handler
              return result;
            })
            .catch((error) => {
              console.error('VoxPage: Article extraction failed:', error);
              return {
                success: false,
                error: error.message || 'Article extraction failed',
              };
            });
        }

        case 'reader.isArticlePage': {
          // Check if current page is likely an article
          const html = document.documentElement.outerHTML;

          return browser.runtime
            .sendMessage({
              type: 'reader.isArticlePage',
              html,
            })
            .then((result) => result)
            .catch((error) => {
              console.error('VoxPage: Article check failed:', error);
              return { success: false, isArticle: false };
            });
        }

        // ====================================================================
        // Highlighting
        // ====================================================================
        case 'highlight': {
          const msg = message as HighlightMessage;

          // Standard web page highlighting
          const extractedParagraphs = extractor.getExtractedParagraphs();
          highlightManager.highlightParagraph(
            msg.index,
            msg.text,
            msg.timestamp,
            extractedParagraphs,
            extractor.findElementByText,
          );
          break;
        }

        case 'clearHighlight': {
          highlightManager.clearHighlights();
          break;
        }

        case 'setWordTimeline': {
          const msg = message as WordTimelineMessage;
          // Convert message format to HighlightManager WordTiming format
          // charOffset and charLength come from ElevenLabs API word alignment
          const convertedTimeline: WordTiming[] = msg.wordTimeline.map((item) => ({
            word: item.word,
            charOffset: item.charOffset ?? 0,
            charLength: item.charLength ?? item.word.length,
            startTimeMs: item.startMs,
            endTimeMs: item.endMs,
          }));
          console.log('VoxPage: Setting word timeline with', convertedTimeline.length, 'words');
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
            (window as any).VoxPage.floatingController.onAction((action: string, data: unknown) => {
              browser.runtime
                .sendMessage({
                  action: 'controllerAction',
                  controllerAction: action,
                  ...((data as object) || {}),
                })
                .catch((err) => {
                  console.error('VoxPage: Failed to send controller action:', err);
                });
            });
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
        // Playback Error Notification (T015: 035-selection-tts-hardening)
        // ====================================================================
        case 'PLAYBACK_ERROR': {
          const errorMsg = message as LegacyMessage & {
            message: string;
            provider?: string;
          };
          console.error(`[VoxPage] Playback error (${errorMsg.provider}):`, errorMsg.message);

          // Show error notification in sticky footer if visible, otherwise show alert
          if (stickyFooter && stickyFooter.isFooterVisible()) {
            stickyFooter.showError(errorMsg.message);
          } else {
            // If footer not visible, show it first, then display error
            stickyFooter.show();
            // Small delay to ensure footer is rendered before showing error
            setTimeout(() => {
              stickyFooter.showError(errorMsg.message);
            }, 100);
          }
          return Promise.resolve({ success: true });
        }

        // ====================================================================
        // Paragraph Selection Mode (028-smart-audio-cache)
        // ====================================================================
        case 'enableSelectionMode': {
          if (paragraphSelector) {
            // T034: Ensure styles are injected before UI elements become visible (035-selection-tts-hardening)
            // This prevents FOUC by guaranteeing CSS is ready before DOM modifications
            injectContentStyles();

            // Get extracted paragraphs and cached indices from message
            const enableMsg = message as LegacyMessage & {
              cachedIndices?: number[];
            };
            const extractedParagraphs = extractor.getExtractedParagraphs();
            const cachedIndices = enableMsg.cachedIndices || [];

            paragraphSelector.enableSelectionMode(extractedParagraphs, cachedIndices);

            // Also add indicators for cache status
            if (paragraphIndicator) {
              extractedParagraphs.forEach((el, index) => {
                const status: ParagraphStatus = cachedIndices.includes(index)
                  ? 'cached'
                  : 'pending';
                paragraphIndicator.addIndicator(el, index, status);
              });
            }
          }
          break;
        }

        case 'disableSelectionMode': {
          if (paragraphSelector) {
            paragraphSelector.disableSelectionMode();
          }
          if (paragraphIndicator) {
            paragraphIndicator.clearAll();
          }
          break;
        }

        case 'refreshSelection': {
          if (paragraphSelector) {
            paragraphSelector.refresh();
          }
          break;
        }

        case 'updateCachedParagraphs': {
          // Update cache status indicators when cache changes
          const updateMsg = message as LegacyMessage & {
            cachedIndices: number[];
          };
          if (paragraphSelector) {
            paragraphSelector.updateCachedIndices(updateMsg.cachedIndices);
          }
          if (paragraphIndicator) {
            paragraphIndicator.markCached(updateMsg.cachedIndices);
          }
          break;
        }

        case 'setIndicatorStatus': {
          // Set status for a specific paragraph
          const statusMsg = message as LegacyMessage & {
            paragraphIndex: number;
            status: ParagraphStatus;
          };
          if (paragraphIndicator) {
            paragraphIndicator.updateIndicator(statusMsg.paragraphIndex, statusMsg.status);
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
        // Persistent Highlights (T087-T092: 045-pdf-removal-page-reader)
        // ====================================================================
        case 'highlight.create': {
          // Create a highlight from current selection
          if (!persistentHighlightManager) {
            return Promise.resolve({ success: false, error: 'Manager not initialized' });
          }

          const createMsg = message as LegacyMessage & {
            color?: HighlightColor;
          };

          const selector = persistentHighlightManager.getCurrentSelection();
          if (!selector) {
            return Promise.resolve({ success: false, error: 'No text selected' });
          }

          // Send to background to create and store
          return browser.runtime
            .sendMessage({
              type: 'highlight.create',
              url: window.location.href,
              exact: selector.exact,
              prefix: selector.prefix,
              suffix: selector.suffix,
              color: createMsg.color ?? 'yellow',
            })
            .then((response: { success: boolean; id?: string }) => {
              if (response.success && response.id) {
                // Render the new highlight
                persistentHighlightManager!.renderHighlight(
                  response.id,
                  selector,
                  createMsg.color ?? 'yellow',
                  false,
                );
                // Clear selection after creating highlight
                persistentHighlightManager!.clearSelection();
              }
              return response;
            });
        }

        case 'highlight.render': {
          // Render a single highlight (e.g., after creation from popup)
          if (!persistentHighlightManager) {
            return Promise.resolve({ success: false });
          }

          const renderMsg = message as LegacyMessage & {
            id: string;
            exact: string;
            prefix?: string;
            suffix?: string;
            color: HighlightColor;
            hasNote: boolean;
          };

          const success = persistentHighlightManager.renderHighlight(
            renderMsg.id,
            {
              type: 'TextQuoteSelector',
              exact: renderMsg.exact,
              prefix: renderMsg.prefix,
              suffix: renderMsg.suffix,
            },
            renderMsg.color,
            renderMsg.hasNote,
          );

          return Promise.resolve({ success });
        }

        case 'highlight.remove': {
          // Remove a rendered highlight from DOM
          if (!persistentHighlightManager) {
            return Promise.resolve({ success: false });
          }

          const removeMsg = message as LegacyMessage & { id: string };
          const success = persistentHighlightManager.removeHighlight(removeMsg.id);
          return Promise.resolve({ success });
        }

        case 'highlight.updateColor': {
          // Update highlight color in DOM
          if (!persistentHighlightManager) {
            return Promise.resolve({ success: false });
          }

          const colorMsg = message as LegacyMessage & {
            id: string;
            color: HighlightColor;
          };
          const success = persistentHighlightManager.updateHighlightColor(
            colorMsg.id,
            colorMsg.color,
          );
          return Promise.resolve({ success });
        }

        case 'highlight.clearAll': {
          // Clear all rendered highlights
          if (persistentHighlightManager) {
            persistentHighlightManager.clearAllHighlights();
          }
          return Promise.resolve({ success: true });
        }

        case 'highlight.getSelection': {
          // Get current text selection as TextQuoteSelector
          if (!persistentHighlightManager) {
            return Promise.resolve({ success: false, selector: null });
          }

          const selector = persistentHighlightManager.getCurrentSelection();
          return Promise.resolve({
            success: !!selector,
            selector: selector,
          });
        }

        case 'highlight.reload': {
          // Reload all highlights for the current page
          loadPageHighlights();
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
            const englishVoice = voices.find((v) => v.lang.startsWith('en') && v.localService);
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

          // Validate audio URL before attempting to play
          if (!audioUrl || audioUrl.trim() === '') {
            console.error('VoxPage: Invalid audio URL: empty or undefined');
            return Promise.resolve({ success: false });
          }

          return new Promise<{ success: boolean }>((resolve) => {
            // Stop any existing audio
            // T027: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
            if ((window as any).__voxpageAudio) {
              const existingAudio = (window as any).__voxpageAudio as HTMLAudioElement;
              existingAudio.pause();
              existingAudio.removeAttribute('src');
              existingAudio.load();
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
          // T027: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
          if ((window as any).__voxpageAudio) {
            const audio = (window as any).__voxpageAudio as HTMLAudioElement;
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
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
      { passive: true },
    );

    /**
     * Cleanup callbacks array for extensible cleanup
     * Allows modules to register cleanup functions
     */
    const cleanupCallbacks: Array<(reason: string) => void> = [];

    /**
     * Execute all cleanup callbacks
     * T023: Enhanced cleanup for blob URLs and audio (035-selection-tts-hardening)
     */
    function executeCleanup(reason: string): void {
      console.log(`VoxPage: Executing cleanup (reason: ${reason})`);

      // T023: Stop and cleanup content script audio first
      if ((window as any).__voxpageAudio) {
        const audio = (window as any).__voxpageAudio as HTMLAudioElement;
        audio.pause();
        // Use proper cleanup to avoid Invalid URI errors
        audio.removeAttribute('src');
        audio.load();
        (window as any).__voxpageAudio = null;
        console.log('[VoxPage:Cleanup] Content script audio stopped and cleaned');
      }

      // T023: Stop browser TTS if active
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel();
      }

      // Send stop message to background (triggers blob URL cleanup)
      browser.runtime
        .sendMessage({
          action: 'playback.stop',
          reason: reason,
        })
        .catch(() => {
          // Ignore errors during unload - background may not be available
        });

      // T023: Reset paragraph selector state
      if (paragraphSelector) {
        paragraphSelector.resetPlayingState();
      }

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
                `VoxPage: Resync took ${resyncDuration.toFixed(0)}ms, exceeds 500ms target (FR-005)`,
              );
            } else {
              console.log(`VoxPage: Resync completed in ${resyncDuration.toFixed(0)}ms (FR-005)`);
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
            (el) => mutation.target.contains(el) || el.contains(mutation.target),
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
            extractedParagraphs.filter((el) => document.body.contains(el)),
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

    // Load persistent highlights on page load (T090)
    if (document.readyState === 'complete') {
      loadPageHighlights();
    } else {
      window.addEventListener('load', () => loadPageHighlights(), { once: true });
    }

    console.log('VoxPage content script fully loaded and message listener registered');
  },
});
