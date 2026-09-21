// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Content Script - Entry Point
 * Handles text extraction and highlighting on web pages.
 * Initializes all content modules and sets up message listeners.
 *
 * Migration: 022-plasmo-migration (T070-T072)
 * Migrated from: content/index.js (465 lines)
 *
 * @module entrypoints/content
 */

import { browser } from 'wxt/browser';
// WXT injects this auto-import at build time (.wxt/types/imports.d.ts); the
// explicit import is the same binding and makes the entrypoint jest-importable.
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { TextQuoteSelector } from '../core/highlight';
import { toAnchoringReport } from '../core/highlight/anchoring-report';
import { reconcileStaleContentArtifacts } from '../utils/content/content-artifact-cleanup';
import { isExtensionPage } from '../utils/content/extension-page';
import * as extractor from '../utils/content/extractor';
import { HighlightManager, type WordTiming } from '../utils/content/highlight';
import {
  HOVERABLE_CLASS,
  hasUnmarkedProse,
  isAmbientExtractionCandidate,
  markHoverAffordance,
  shouldIgnoreParagraphClick,
} from '../utils/content/hover-play';
import { ParagraphIndicator, type ParagraphStatus } from '../utils/content/paragraph-indicator';
import { ParagraphSelector } from '../utils/content/paragraph-selector';
import {
  type PersistentHighlightManager,
  createPersistentHighlightManager,
} from '../utils/content/persistent-highlight';
import {
  type PlaybackState,
  type PlaybackStatus,
  StickyFooter,
  type StorageState,
} from '../utils/content/sticky-footer';
import { createLogger } from '../utils/logging/logger';
import type { HighlightColor } from '../utils/schemas/highlight.schema';

const log = createLogger('content');

/**
 * Floor between two hover-play re-marking passes. Extraction is the expensive
 * part; a page that streams content in must not be able to run it back to
 * back.
 */
const HOVER_REMARK_MIN_INTERVAL_MS = 1500;

// ============================================================================
// CSS Injection
// ============================================================================

/**
 * Inject content CSS styles for highlighting
 * Required because WXT css[] property doesn't work reliably for all setups
 */
function injectContentStyles(): void {
  if (document.getElementById('proso-content-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'proso-content-styles';
  style.textContent = `
    /* Proso Highlight Styles */
    .proso-highlight {
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

    @keyframes proso-pulse {
      0%, 100% { box-shadow: 0 2px 8px rgba(13, 148, 136, 0.1); }
      50% { box-shadow: 0 2px 16px rgba(13, 148, 136, 0.25); }
    }

    .proso-highlight {
      animation: proso-pulse 2s ease-in-out infinite;
    }

    @media (prefers-color-scheme: dark) {
      .proso-highlight {
        background: linear-gradient(
          135deg,
          rgba(13, 148, 136, 0.25) 0%,
          rgba(20, 184, 166, 0.25) 100%
        ) !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .proso-highlight {
        animation: none !important;
        transition: none !important;
      }
    }

    /* Word-level highlighting — Liquid flow (zero layout impact) */
    .proso-w {
      background-color: transparent !important;
      transition: background-color 450ms cubic-bezier(0.4, 0, 0.2, 1) !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
    }
    .proso-w--active {
      background-color: rgba(13, 148, 136, 0.48) !important;
      transition: background-color 80ms ease-out !important;
    }
    .proso-w--glow {
      background-color: rgba(13, 148, 136, 0.30) !important;
      transition: background-color 100ms ease-out !important;
    }
    .proso-w--near {
      background-color: rgba(13, 148, 136, 0.16) !important;
      transition: background-color 160ms ease-out !important;
    }
    .proso-w--far {
      background-color: rgba(13, 148, 136, 0.07) !important;
      transition: background-color 220ms ease-out !important;
    }
    @media (prefers-color-scheme: dark) {
      .proso-w--active { background-color: rgba(20, 184, 166, 0.52) !important; }
      .proso-w--glow { background-color: rgba(20, 184, 166, 0.32) !important; }
      .proso-w--near { background-color: rgba(20, 184, 166, 0.18) !important; }
      .proso-w--far { background-color: rgba(20, 184, 166, 0.08) !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      .proso-w, .proso-w--active, .proso-w--glow, .proso-w--near, .proso-w--far { transition: none !important; }
    }

    /* Paragraph Selection Mode Styles */
    .proso-selectable {
      position: relative;
      cursor: pointer;
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
      border-radius: 4px;
    }

    .proso-selectable:hover {
      background-color: rgba(13, 148, 136, 0.08) !important;
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
    }

    /* T008: Focus-within state for keyboard navigation (035-selection-tts-hardening) */
    .proso-selectable:focus-within {
      background-color: rgba(13, 148, 136, 0.08) !important;
      outline: 2px solid rgba(13, 148, 136, 0.5);
      outline-offset: 2px;
    }

    .proso-selectable:hover .proso-play-icon,
    .proso-selectable:focus-within .proso-play-icon {
      opacity: 1;
      transform: scale(1);
    }

    .proso-selected {
      background-color: rgba(13, 148, 136, 0.15) !important;
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.4) !important;
    }

    .proso-cached {
      border-left: 3px solid #10B981 !important;
      padding-left: 8px !important;
    }

    .proso-cached::before {
      content: "✓";
      position: absolute;
      left: -20px;
      top: 0;
      font-size: 12px;
      color: #10B981;
      font-weight: bold;
    }

    .proso-play-icon {
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

    .proso-play-icon::before {
      content: "";
      width: 0;
      height: 0;
      border-left: 8px solid white;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      margin-left: 2px;
    }

    .proso-play-icon:hover {
      background: #0F766E;
      transform: translateY(-50%) scale(1.1);
    }

    /* T008: Focus state for play icon (035-selection-tts-hardening) */
    .proso-play-icon:focus {
      opacity: 1;
      background: #14B8A6;
    }

    .proso-play-icon:focus-visible {
      opacity: 1;
      outline: 2px solid #0D9488;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .proso-play-icon:focus:not(:focus-visible) {
      outline: none;
    }

    .proso-play-icon--inline {
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

    .proso-selectable:hover .proso-play-icon--inline,
    .proso-selectable:focus-within .proso-play-icon--inline {
      opacity: 1;
    }

    .proso-play-icon--inline:hover {
      transform: scale(1.1);
    }

    .proso-play-icon--inline:focus-visible {
      opacity: 1;
      outline: 2px solid #0D9488;
      outline-offset: 2px;
    }

    @media (prefers-color-scheme: dark) {
      .proso-selectable:hover {
        background-color: rgba(20, 184, 166, 0.12) !important;
        box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.3);
      }

      /* T008: Focus-within in dark mode */
      .proso-selectable:focus-within {
        background-color: rgba(20, 184, 166, 0.12) !important;
        outline-color: rgba(20, 184, 166, 0.6);
      }

      .proso-selected {
        background-color: rgba(20, 184, 166, 0.2) !important;
        box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.5) !important;
      }

      .proso-play-icon {
        background: #14B8A6;
      }

      .proso-play-icon:hover {
        background: #0D9488;
      }

      /* T008: Focus states in dark mode */
      .proso-play-icon:focus,
      .proso-play-icon:focus-visible {
        background: #2DD4BF;
      }

      .proso-play-icon:focus-visible {
        outline-color: #14B8A6;
        box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.4), 0 2px 4px rgba(0, 0, 0, 0.4);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .proso-selectable,
      .proso-play-icon {
        transition: none !important;
      }
    }

    /* Ambient hover-play affordance (Feature 229) — paint-only, never reflows */
    .${HOVERABLE_CLASS} {
      cursor: pointer;
    }

    .${HOVERABLE_CLASS}:hover {
      background-color: rgba(13, 148, 136, 0.08) !important;
      box-shadow: inset 3px 0 0 rgba(13, 148, 136, 0.55) !important;
      border-radius: 4px;
    }

    @media (prefers-color-scheme: dark) {
      .${HOVERABLE_CLASS}:hover {
        background-color: rgba(20, 184, 166, 0.12) !important;
        box-shadow: inset 3px 0 0 rgba(20, 184, 166, 0.65) !important;
      }
    }
  `;

  document.head.appendChild(style);
  log.debug('Proso: Content styles injected');
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Proso namespace on the window object.
 * Used for backward compatibility with legacy code and cross-module communication.
 */
interface ProsoNamespace {
  _contentInitialized?: boolean;
  paragraphSelector?: ParagraphSelector;
  paragraphIndicator?: ParagraphIndicator;
  persistentHighlightManager?: PersistentHighlightManager;
  highlightManager?: {
    onUserScroll: () => void;
  };
  getCurrentSelection?: () => TextQuoteSelector | null;
  registerCleanupCallback?: (callback: (reason: string) => void) => void;
}

/**
 * Window with Proso audio element for content-script-based playback.
 */
interface ProsoWindow {
  Proso?: ProsoNamespace;
  __prosoAudio?: HTMLAudioElement | null;
}

/**
 * Legacy message format (backward compatibility until background service is migrated)
 */
interface LegacyMessage {
  action: string;
  [key: string]: unknown;
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
  voice?: string | null;
}

/**
 * Text extraction message
 */
interface ExtractTextMessage extends LegacyMessage {
  action: 'extractText';
  mode: 'selection' | 'article' | 'full';
  useCache?: boolean;
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

// ============================================================================
// WXT Content Script Definition
// ============================================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  // PROSO-130: the extension's own pages are never article pages. The
  // manifest key cannot express this: BOTH browsers reject extension-scheme
  // match patterns in content_scripts (measured — Firefox: "Extension is
  // invalid"; Chrome MV3: the extension fails to load, no service worker).
  // `isExtensionPage()` in main() is therefore the enforced boundary, and
  // the tests pin that it stays first in main().
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  main() {
    log.info('Proso: Content script starting (WXT TypeScript)');

    // PROSO-130: never touch the extension's own pages, even if the manifest
    // registration drifts. The guard must run before any injection or
    // listener registration below.
    if (isExtensionPage(window.location.href)) {
      log.debug('Proso: Skipping extension page — content script is article-only');
      return;
    }

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
    const voxWindow = window as unknown as ProsoWindow;
    if (voxWindow.Proso?._contentInitialized) {
      log.debug('Proso: Content script already initialized, skipping');
      return;
    }

    const cleanup = reconcileStaleContentArtifacts(document);
    if (cleanup.footerRoots || cleanup.wordWrappers || cleanup.paragraphHighlights) {
      log.info('Proso: Reconciled obsolete playback DOM', { ...cleanup });
    }

    // Initialize Proso namespace for backward compatibility
    voxWindow.Proso = voxWindow.Proso || {};
    voxWindow.Proso._contentInitialized = true;

    // Initialize modules
    try {
      highlightManager = new HighlightManager();
      stickyFooter = new StickyFooter();
      paragraphSelector = new ParagraphSelector();
      paragraphIndicator = new ParagraphIndicator();
      persistentHighlightManager = createPersistentHighlightManager();

      // Expose modules on namespace for legacy code
      voxWindow.Proso!.paragraphSelector = paragraphSelector;
      voxWindow.Proso!.paragraphIndicator = paragraphIndicator;
      voxWindow.Proso!.persistentHighlightManager = persistentHighlightManager;

      log.info('Proso: Modules initialized successfully', {
        hasExtractor: true, // extractor is a module with functions
        hasHighlightManager: !!highlightManager,
        hasStickyFooter: !!stickyFooter,
        hasParagraphSelector: !!paragraphSelector,
        hasParagraphIndicator: !!paragraphIndicator,
        hasPersistentHighlightManager: !!persistentHighlightManager,
      });

      // Setup persistent highlight callbacks (T087-T092)
      setupPersistentHighlightCallbacks(persistentHighlightManager);
    } catch (error) {
      log.error('Proso: Failed to initialize modules', { error });
      return;
    }

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /** T046: Enable popup paragraph selection after a fresh extraction. */
    function enableParagraphSelectionMode(paragraphs: Element[]): void {
      if (!paragraphSelector || paragraphs.length === 0) return;
      paragraphSelector.enableSelectionMode(paragraphs, []).catch((error) => {
        log.warn('Proso: Failed to enable selection mode', { error });
      });
    }

    /**
     * Jump to a clicked paragraph (only during active playback)
     */
    function jumpToClickedParagraph(index: number): void {
      // The same handler the play-icon click uses (see paragraph-selector.ts).
      // It covers both cases this function is called for: seek when a run is
      // already going, extract and start from here when one is not. The
      // earlier pair — 'playback.jumpToParagraph' with `index` — matched no
      // registered handler at all, so every click resolved to an
      // unknown-message response and playback stayed where it was.
      browser.runtime
        .sendMessage({
          type: 'PARAGRAPH_CLICKED',
          paragraphIndex: index,
        })
        .catch((err) => {
          log.error('Proso: Failed to jump to paragraph', { error: err });
        });
    }

    /**
     * Ambient hover-play (Feature 229): extract once at idle so paragraph
     * clicks can start playback without any popup interaction, then mark the
     * paragraphs with the paint-only hover affordance.
     */
    function runAmbientHoverPlayExtraction({ reExtract = false } = {}): void {
      // Playback can start after scheduling but before the idle callback runs.
      if (stickyFooter?.isFooterVisible()) return;
      try {
        if (
          !reExtract &&
          extractor.getLastExtractionMode() === 'article' &&
          extractor.getExtractedParagraphs().length > 0
        ) {
          markHoverAffordance(extractor.getExtractedParagraphs());
          return;
        }
        if (!isAmbientExtractionCandidate(document)) {
          log.debug('Proso: Skipping ambient hover-play extraction (page not text-rich)');
          return;
        }
        const text = extractor.extractText('article');
        if (!text) return;
        const marked = markHoverAffordance(extractor.getExtractedParagraphs());
        log.debug('Proso: Ambient hover-play extraction marked paragraphs', { marked });
      } catch (error) {
        log.warn('Proso: Ambient hover-play extraction failed', { error });
      }
    }

    /** Run a hover-play pass off the critical path; never block the page. */
    function scheduleHoverPlayPass(options: { reExtract?: boolean } = {}): void {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => runAmbientHoverPlayExtraction(options), { timeout: 3000 });
      } else {
        window.setTimeout(() => runAmbientHoverPlayExtraction(options), 1200);
      }
    }

    /**
     * Follow the page when its article is replaced without a document load.
     *
     * On a client-routed site the content script is never restarted, so the
     * single idle pass above is the only marking that ever happens and every
     * paragraph the router brings in is unclickable — the shape a reader hit
     * on a docs site whose sidebar navigates in place.
     *
     * Two guards keep this off the hot path: `hasUnmarkedProse` rejects our
     * own word spans and footer chrome, and passes are spaced so a chatty page
     * cannot make the extractor run back to back. Re-extraction is skipped
     * outright while the footer is up: paragraph indexes are the reading
     * position, and renumbering them mid-article would move the highlight and
     * every click target under the reader.
     */
    function watchRoutedContent(): void {
      if (typeof MutationObserver !== 'function' || !document.body) return;

      let passPending = false;
      let lastPassAt = 0;

      const readingInProgress = () => stickyFooter?.isFooterVisible() === true;

      const observer = new MutationObserver((records) => {
        if (passPending || readingInProgress()) return;
        if (!hasUnmarkedProse(records)) return;

        passPending = true;
        const wait = Math.max(0, HOVER_REMARK_MIN_INTERVAL_MS - (Date.now() - lastPassAt));
        window.setTimeout(() => {
          passPending = false;
          lastPassAt = Date.now();
          if (readingInProgress()) return;
          scheduleHoverPlayPass({ reExtract: true });
        }, wait);
      });

      // No teardown: the observer is scoped to this document and is collected
      // with it. The cleanup list here is for blob URLs and audio, which are
      // the things that outlive a document.
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function setupAmbientHoverPlay(): void {
      // FR-1: defer off the critical path; never block or break the page.
      scheduleHoverPlayPass();
      watchRoutedContent();
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
        if (target.closest('.proso-play-icon')) {
          return;
        }

        // FR-4/FR-5: one shared guard for every paragraph-click branch —
        // interactive elements keep their native behavior and the terminating
        // click of a drag text-selection never starts or seeks playback.
        if (shouldIgnoreParagraphClick(target, window.getSelection())) {
          return;
        }

        // Check if we clicked on a selectable paragraph (selection mode)
        const selectableEl = target.closest('.proso-selectable') as HTMLElement;
        if (selectableEl && voxWindow.Proso?.paragraphSelector?.isActive?.()) {
          const index = Number.parseInt(selectableEl.dataset.prosoSelectIndex || '', 10);
          if (!isNaN(index)) {
            // Selection mode: just select visually, don't play
            voxWindow.Proso?.paragraphSelector?.selectParagraph?.(index);
          }
          return;
        }

        // Check if we clicked on an active highlight (during playback)
        const highlightedEl = target.closest('.proso-highlight') as HTMLElement;
        if (highlightedEl) {
          const index = Number.parseInt(highlightedEl.dataset.prosoIndex || '', 10);
          if (!isNaN(index)) {
            // During playback: jump to the clicked paragraph
            jumpToClickedParagraph(index);
          }
          return;
        }

        // A selection read shares the extractor module but not article indexes.
        // Refresh before mapping a hover click so index N still means article N.
        if (
          extractor.getLastExtractionMode() !== 'article' &&
          isAmbientExtractionCandidate(document)
        ) {
          try {
            extractor.extractText('article');
            markHoverAffordance(extractor.getExtractedParagraphs());
          } catch (error) {
            log.warn('Proso: Could not refresh article cache for paragraph click', { error });
            return;
          }
        }

        // Check if clicking on an extracted paragraph
        const extractedParagraphs = extractor.getExtractedParagraphs();
        const _highlightElements = highlightManager.getHighlightElements();

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
     * Extract page language information.
     * Note: A shared version exists at utils/language/extractor.ts.
     * This inline version is kept for content script bundling efficiency.
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
          type: 'language.detect',
          metadata: langData.metadata,
          textSample: langData.textSample,
          url: langData.url,
        })
        .catch((err) => {
          log.error('Proso: Failed to send language detection', { error: err });
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

      // Selection change callback. The selection is kept here, where the page
      // API below reads it. It used to also be announced to the background as
      // 'highlight.selectionChanged'; nothing has ever listened for that name,
      // so the announcement was a round-trip to an unknown-message response.
      manager.onSelectionChange((selector) => {
        currentSelection = selector;
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
                  log.info('Proso: Highlight deleted', { highlightId });
                }
              })
              .catch((err) => {
                log.error('Proso: Failed to delete highlight', { error: err });
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
                  log.error('Proso: Failed to add note', { error: err });
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
                  log.info('Proso: Highlight color changed', { highlightId, color });
                }
              })
              .catch((err) => {
                log.error('Proso: Failed to change color', { error: err });
              });
            break;
          }
        }
      });

      // Expose function to get current selection
      voxWindow.Proso!.getCurrentSelection = () => currentSelection;
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

        log.debug(`Proso: Loading ${response.highlights.length} highlights for page`);

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
        const orphanStatus =
          await persistentHighlightManager.reanchorHighlights(highlightsToRender);

        const orphanedCount = Array.from(orphanStatus.values()).filter(Boolean).length;

        if (orphanedCount > 0) {
          log.warn(`Proso: ${orphanedCount} highlights could not be anchored (orphaned)`);
        }

        // Only the highlights whose status moved. Reporting failures alone
        // would set the flag but never clear it; reporting everything would
        // rewrite every highlight on the page on every load.
        const results = toAnchoringReport(response.highlights, orphanStatus);

        if (results.length > 0) {
          browser.runtime
            .sendMessage({ type: 'highlight.reportAnchoring', results })
            .catch((error) => {
              // Logged rather than swallowed: this message going nowhere is
              // exactly how the flag silently stopped being written before.
              log.warn('Proso: Could not report anchoring results', { error });
            });
        }
      } catch (error) {
        log.error('Proso: Failed to load page highlights', { error });
      }
    }

    // ========================================================================
    // Message Listener
    // ========================================================================

    log.debug('Proso: Setting up message listener');

    browser.runtime.onMessage.addListener((message: LegacyMessage & { type?: string }) => {
      // Support both 'action' (legacy) and 'type' (new protocol) fields
      const messageKey = message.action || message.type;
      log.debug('Proso: Received message', { messageKey });

      if (!highlightManager || !stickyFooter) {
        log.warn('Proso: Modules not initialized, ignoring message');
        return;
      }

      switch (messageKey) {
        // ====================================================================
        // Content Extraction
        // ====================================================================
        case 'extractText': {
          const msg = message as ExtractTextMessage;
          const reuseCache =
            msg.useCache === true &&
            msg.mode === 'article' &&
            extractor.getLastExtractionMode() === 'article' &&
            extractor.getExtractedParagraphs().length > 0;
          const text = reuseCache
            ? extractor.getParagraphTexts().join('\n\n')
            : extractor.extractText(msg.mode);
          const paragraphTexts = extractor.getParagraphTexts();
          const paragraphElements = extractor.getExtractedParagraphs();
          if (!reuseCache) enableParagraphSelectionMode(paragraphElements);

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
          const needsExtraction =
            extractor.getLastExtractionMode() !== 'article' ||
            extractor.getExtractedParagraphs().length === 0;
          if (needsExtraction) {
            extractor.extractText('article');
          }
          const paragraphTexts = extractor.getParagraphTexts();
          const paragraphElements = extractor.getExtractedParagraphs();
          enableParagraphSelectionMode(paragraphElements);

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
          const needsExtraction =
            extractor.getLastExtractionMode() !== 'article' ||
            extractor.getExtractedParagraphs().length === 0;
          if (needsExtraction) {
            extractor.extractText('article');
          }
          const paragraphElements = extractor.getExtractedParagraphs();
          enableParagraphSelectionMode(paragraphElements);

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
              log.error('Proso: Article extraction failed', { error });
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
              log.error('Proso: Article check failed', { error });
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
          log.debug('Proso: Setting word timeline', { wordCount: convertedTimeline.length });
          highlightManager.setWordTimeline(convertedTimeline, msg.paragraphIndex);
          break;
        }

        case 'highlightWord': {
          const msg = message as WordHighlightMessage;
          highlightManager.highlightWord(msg.paragraphIndex, msg.wordIndex, msg.timestamp);
          break;
        }

        case 'audioPositionUpdate': {
          const msg = message as LegacyMessage & {
            currentTimeMs: number;
            isPlaying: boolean;
            speed: number;
          };
          highlightManager.updateAudioPosition(msg.currentTimeMs, msg.isPlaying, msg.speed);
          break;
        }

        // A 'jumpToWord' arm used to sit here. Nothing has ever sent that
        // message to a tab, and the 'playback.jumpToWord' it forwarded to was
        // never a registered handler — dead at both ends. Seeking to a word is
        // a feature the playback service does not have; when it does, it
        // belongs behind a handler that exists, not a relay to one that does
        // not.

        // ====================================================================
        // Sticky Footer
        // ====================================================================
        case 'FOOTER_SHOW': {
          const _msg = message as FooterShowMessage;
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
            // Only carried when the sender knows it; omitting leaves the
            // footer's current label alone rather than resetting it.
            ...(msg.voice !== undefined ? { voiceId: msg.voice } : {}),
          };
          stickyFooter.updateState(playbackState);
          break;
        }

        case 'FOOTER_LANGUAGE_UPDATE': {
          const langMsg = message as LegacyMessage & {
            languageCode?: string;
            isAutoDetected?: boolean;
          };
          stickyFooter.updateState({
            languageCode: langMsg.languageCode ?? 'en',
            isAutoDetected: langMsg.isAutoDetected ?? true,
          });
          break;
        }

        // A 'TOGGLE_FOOTER_SETTINGS' arm used to sit here, showing the footer
        // if it was hidden. Nothing in the extension has ever sent that
        // message to a tab, and the footer's settings are opened from the
        // footer itself, so the arm could only ever have been reached by a
        // sender that was never written.

        // ====================================================================
        // Playback Error Notification (T015: 035-selection-tts-hardening)
        // ====================================================================
        case 'PLAYBACK_ERROR': {
          const errorMsg = message as LegacyMessage & {
            message: string;
            provider?: string;
          };
          log.error(`[Proso] Playback error (${errorMsg.provider})`, { message: errorMsg.message });

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
              log.error('Proso: Web Speech API not available');
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
              log.debug('Proso: Speech ended');
              resolve({ success: true });
            };

            utterance.onerror = (event) => {
              if (event.error !== 'canceled') {
                log.error('Proso: Speech error', { error: event.error });
              }
              resolve({ success: false });
            };

            log.debug('Proso: Speaking text', { length: text.length });
            speechSynthesis.speak(utterance);
          });
        }

        case 'stopSpeech': {
          if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
            log.debug('Proso: Speech cancelled');
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
            log.error('Proso: Invalid audio URL: empty or undefined');
            return Promise.resolve({ success: false });
          }

          return new Promise<{ success: boolean }>((resolve) => {
            // Stop any existing audio
            // T027: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
            if (voxWindow.__prosoAudio) {
              const existingAudio = voxWindow.__prosoAudio;
              existingAudio.pause();
              existingAudio.removeAttribute('src');
              existingAudio.load();
              voxWindow.__prosoAudio = null;
            }

            const audio = new Audio(audioUrl);
            voxWindow.__prosoAudio = audio;
            audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

            audio.onended = () => {
              log.debug('Proso: Audio playback ended');
              voxWindow.__prosoAudio = null;
              resolve({ success: true });
            };

            audio.onerror = (event) => {
              log.error('Proso: Audio playback error', { event });
              voxWindow.__prosoAudio = null;
              resolve({ success: false });
            };

            log.debug('Proso: Playing audio', { speed });
            audio.play().catch((err) => {
              log.error('Proso: Audio play() failed', { error: err });
              resolve({ success: false });
            });
          });
        }

        case 'stopAudio': {
          // T027: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
          if (voxWindow.__prosoAudio) {
            const audio = voxWindow.__prosoAudio;
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            voxWindow.__prosoAudio = null;
            log.debug('Proso: Audio stopped');
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
          log.warn('Proso: Unknown message action', { action: message.action });
      }
    });

    // ========================================================================
    // Event Listeners
    // ========================================================================

    // Setup click handlers when script loads
    setupParagraphClickHandlers();

    // Feature 229: ambient hover-play — idle extraction + hover affordance so
    // any paragraph click can start playback without opening the popup first.
    setupAmbientHoverPlay();

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
          if (voxWindow.Proso?.highlightManager?.onUserScroll) {
            voxWindow.Proso.highlightManager.onUserScroll();
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
      log.debug(`Proso: Executing cleanup (reason: ${reason})`);

      // T023: Stop and cleanup content script audio first
      if (voxWindow.__prosoAudio) {
        const audio = voxWindow.__prosoAudio;
        audio.pause();
        // Use proper cleanup to avoid Invalid URI errors
        audio.removeAttribute('src');
        audio.load();
        voxWindow.__prosoAudio = null;
        log.debug('[Proso:Cleanup] Content script audio stopped and cleaned');
      }

      // T023: Stop browser TTS if active
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel();
      }

      // Report that this view is going away. The background decides whether
      // that ends the session or merely detaches it (background playback).
      browser.runtime
        .sendMessage({
          type: 'playback.viewUnloaded',
          reason: reason,
        })
        .catch(() => {
          // Ignore errors during unload - background may not be available
        });

      // T023: Reset paragraph selector state
      if (paragraphSelector) {
        paragraphSelector.resetPlayingState();
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
          log.warn('Proso: Cleanup callback failed', { error: e });
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
    voxWindow.Proso!.registerCleanupCallback = registerCleanupCallback;

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
            type: 'playback.resync',
            reason: 'tab-visible',
            timestamp: Date.now(),
          })
          .then(() => {
            const resyncDuration = performance.now() - resyncStart;
            if (resyncDuration > 500) {
              log.warn(
                `Proso: Resync took ${resyncDuration.toFixed(0)}ms, exceeds 500ms target (FR-005)`,
              );
            } else {
              log.debug(`Proso: Resync completed in ${resyncDuration.toFixed(0)}ms (FR-005)`);
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
        log.debug('Proso: Sent initial language detection request');
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

    log.info('Proso content script fully loaded and message listener registered');
  },
});
