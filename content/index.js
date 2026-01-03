/**
 * VoxPage Content Script - Entry Point
 * Handles text extraction and highlighting on web pages.
 * Initializes all content modules and sets up message listeners.
 *
 * @module content/index
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  console.log('VoxPage: index.js starting');

  // Initialize VoxPage namespace (should already exist from other modules)
  window.VoxPage = window.VoxPage || {};

  // Prevent re-initialization
  if (window.VoxPage._indexInitialized) {
    console.log('VoxPage: index.js already initialized, skipping');
    return;
  }
  window.VoxPage._indexInitialized = true;

  console.log('VoxPage: Namespace state:', {
    hasContentScorer: !!window.VoxPage.contentScorer,
    hasContentExtractor: !!window.VoxPage.contentExtractor,
    hasHighlightManager: !!window.VoxPage.highlightManager,
    hasFloatingController: !!window.VoxPage.floatingController,
    hasStickyFooter: !!window.VoxPage.stickyFooter,
    hasParagraphSelector: !!window.VoxPage.paragraphSelector,
    hasLanguageExtractor: !!window.VoxPage.extractPageLanguage
  });

  // Get module references
  const getExtractor = () => window.VoxPage.contentExtractor || {};
  const getHighlighter = () => window.VoxPage.highlightManager || {};
  const getParagraphSelector = () => window.VoxPage.paragraphSelector || {};
  const getLanguageExtractor = () => ({
    extractPageLanguage: window.VoxPage.extractPageLanguage,
    sendLanguageDetectionRequest: window.VoxPage.sendLanguageDetectionRequest
  });

  /**
   * Format time remaining in seconds to MM:SS format
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  function formatTimeRemaining(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Jump to a clicked paragraph (only during active playback)
   * @param {number} index - Paragraph index to jump to
   */
  function jumpToClickedParagraph(index) {
    browser.runtime.sendMessage({
      action: 'jumpToParagraph',
      index: index
    }).catch(err => {
      console.error('VoxPage: Failed to jump to paragraph:', err);
    });
  }

  /**
   * Setup paragraph click handlers
   * - During playback: clicking a paragraph jumps to it
   * - Selection mode: clicking selects (visual only), play icon starts playback
   * - Neither: paragraph clicks are ignored to prevent accidental triggers
   */
  function setupParagraphClickHandlers() {
    document.addEventListener('click', (event) => {
      const paragraphSelector = getParagraphSelector();
      const highlighter = getHighlighter();
      const extractor = getExtractor();

      // Ignore clicks on play icons (they have their own handlers)
      if (event.target.closest('.voxpage-play-icon')) {
        return;
      }

      // Check if we clicked on a selectable paragraph
      const selectableEl = event.target.closest('.voxpage-selectable');
      if (selectableEl && paragraphSelector.isActive?.()) {
        const index = parseInt(selectableEl.dataset.voxpageSelectIndex, 10);
        if (!isNaN(index)) {
          // Selection mode: just select visually, don't play
          paragraphSelector.selectParagraph?.(index);
        }
        return;
      }

      // Check if we clicked on an active highlight (during playback)
      const highlightedEl = event.target.closest('.voxpage-highlight');
      if (highlightedEl) {
        const index = parseInt(highlightedEl.dataset.voxpageIndex, 10);
        if (!isNaN(index)) {
          // During playback: jump to the clicked paragraph
          jumpToClickedParagraph(index);
        }
        return;
      }

      // Check if clicking on an extracted paragraph during active playback
      const extractedParagraphs = extractor.getExtractedParagraphs?.() || [];
      const highlightElements = highlighter.getHighlightElements?.() || [];

      // Only allow paragraph jumping if playback is active (highlights exist)
      if (highlightElements.length > 0) {
        const clickedParagraph = extractedParagraphs.findIndex(el =>
          el.contains(event.target) || el === event.target
        );

        if (clickedParagraph !== -1) {
          jumpToClickedParagraph(clickedParagraph);
        }
      }
      // If no playback active and not in selection mode, clicks are ignored
    });
  }

  /**
   * Listen for messages from background script
   */
  console.log('VoxPage: Setting up message listener');
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('VoxPage: Received message:', message.action);
    const extractor = getExtractor();
    const highlighter = getHighlighter();

    switch (message.action) {
      case 'extractText':
        const text = extractor.extractText?.(message.mode) || '';
        // Send paragraph texts array for accurate TTS-to-DOM index synchronization
        const paragraphTexts = extractor.getParagraphTexts?.() || [];
        browser.runtime.sendMessage({
          action: 'textContent',
          text: text,
          paragraphs: paragraphTexts,
          mode: message.mode
        });
        break;

      case 'highlight':
        highlighter.highlightParagraph?.(message.index, message.text, message.timestamp);
        break;

      case 'clearHighlight':
        highlighter.clearHighlights?.();
        break;

      // Floating controller messages
      case 'showFloatingController':
        if (window.VoxPage?.floatingController) {
          window.VoxPage.floatingController.show(message.position);
          window.VoxPage.floatingController.onAction((action, data) => {
            browser.runtime.sendMessage({
              action: 'controllerAction',
              controllerAction: action,
              ...data
            }).catch(err => {
              console.error('VoxPage: Failed to send controller action:', err);
            });
          });
        }
        break;

      case 'hideFloatingController':
        if (window.VoxPage?.floatingController) {
          window.VoxPage.floatingController.hide();
        }
        break;

      case 'updatePlaybackState':
        if (window.VoxPage?.floatingController) {
          const status = message.isPlaying ? 'playing' : 'paused';
          const timeRemaining = formatTimeRemaining(message.timeRemaining);
          window.VoxPage.floatingController.updateState({
            status: status,
            progress: message.progress || 0,
            timeRemaining: timeRemaining
          });
        }
        break;

      // Word-level highlighting messages
      case 'setWordTimeline':
        highlighter.setWordTimeline?.(message.wordTimeline, message.paragraphIndex);
        break;

      case 'highlightWord':
        highlighter.highlightWord?.(message.paragraphIndex, message.wordIndex, message.timestamp);
        break;

      case 'jumpToWord':
        browser.runtime.sendMessage({
          action: 'jumpToWord',
          paragraphIndex: message.paragraphIndex,
          wordIndex: message.wordIndex
        }).catch(err => {
          console.error('VoxPage: Failed to jump to word:', err);
        });
        break;

      // Paragraph selection mode messages
      case 'enableSelectionMode':
        if (window.VoxPage?.paragraphSelector) {
          window.VoxPage.paragraphSelector.enableSelectionMode();
        }
        break;

      case 'disableSelectionMode':
        if (window.VoxPage?.paragraphSelector) {
          window.VoxPage.paragraphSelector.disableSelectionMode();
        }
        break;

      case 'refreshSelection':
        if (window.VoxPage?.paragraphSelector) {
          window.VoxPage.paragraphSelector.refresh();
        }
        break;

      // T053: Sticky footer messages (018-ui-redesign)
      case 'FOOTER_SHOW':
        if (window.VoxPage?.stickyFooter) {
          window.VoxPage.stickyFooter.show(message.initialState);
        }
        break;

      // T054: Hide sticky footer
      case 'FOOTER_HIDE':
        if (window.VoxPage?.stickyFooter) {
          window.VoxPage.stickyFooter.hide();
        }
        break;

      // T055: Update sticky footer state
      case 'FOOTER_STATE_UPDATE':
        if (window.VoxPage?.stickyFooter) {
          window.VoxPage.stickyFooter.updateState({
            status: message.status,
            progress: message.progress,
            currentTime: message.currentTime,
            totalTime: message.totalTime,
            currentParagraph: message.currentParagraph,
            totalParagraphs: message.totalParagraphs,
            speed: message.speed
          });
        }
        break;

      // T021: Language extraction request (019-multilingual-tts)
      case 'extractLanguage':
        {
          const langExtractor = getLanguageExtractor();
          if (langExtractor.sendLanguageDetectionRequest) {
            langExtractor.sendLanguageDetectionRequest();
          }
        }
        break;
    }
  });

  // Setup click handlers when script loads
  setupParagraphClickHandlers();

  /**
   * T021: Scroll event listener for auto-scroll debounce
   * Implements FR-010: Pause auto-scroll when user manually scrolls
   */
  let scrollListenerDebounce = null;
  window.addEventListener('scroll', () => {
    // Debounce scroll events to avoid excessive calls
    if (scrollListenerDebounce) {
      clearTimeout(scrollListenerDebounce);
    }
    scrollListenerDebounce = setTimeout(() => {
      // Notify highlight manager of user scroll
      if (window.VoxPage?.highlightManager?.onUserScroll) {
        window.VoxPage.highlightManager.onUserScroll();
      }
      scrollListenerDebounce = null;
    }, 100); // 100ms debounce for scroll events
  }, { passive: true });

  /**
   * Cleanup callbacks array for extensible cleanup (T032)
   * Allows modules to register cleanup functions
   */
  const cleanupCallbacks = [];

  /**
   * Execute all cleanup callbacks
   * @param {string} reason - Reason for cleanup
   */
  function executeCleanup(reason) {
    console.log(`VoxPage: Executing cleanup (reason: ${reason})`);

    // Send stop message to background (T029)
    browser.runtime.sendMessage({
      action: 'stopPlayback',
      reason: reason
    }).catch(() => {
      // Ignore errors during unload - background may not be available
    });

    // Hide floating controller
    if (window.VoxPage?.floatingController) {
      window.VoxPage.floatingController.hide();
    }

    // Hide sticky footer (018-ui-redesign)
    if (window.VoxPage?.stickyFooter) {
      window.VoxPage.stickyFooter.hide();
    }

    // Clear all highlights (T031)
    getHighlighter().clearHighlights?.();

    // Execute registered callbacks
    cleanupCallbacks.forEach(cb => {
      try {
        cb(reason);
      } catch (e) {
        console.warn('VoxPage: Cleanup callback failed:', e);
      }
    });
  }

  /**
   * Register a cleanup callback
   * @param {Function} callback - Callback to run on cleanup
   */
  function registerCleanupCallback(callback) {
    if (typeof callback === 'function') {
      cleanupCallbacks.push(callback);
    }
  }

  // Expose cleanup registration on namespace
  window.VoxPage.registerCleanupCallback = registerCleanupCallback;

  /**
   * T027: Handle pagehide event (primary navigation handler)
   * Implements FR-011: Stop audio on page navigation
   */
  window.addEventListener('pagehide', (event) => {
    executeCleanup('navigation');
  });

  /**
   * T028: Handle beforeunload event (backup for reload detection)
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
      browser.runtime.sendMessage({
        action: 'requestResync',
        reason: 'tab-visible',
        timestamp: Date.now()
      }).then(() => {
        const resyncDuration = performance.now() - resyncStart;
        if (resyncDuration > 500) {
          console.warn(`VoxPage: Resync took ${resyncDuration.toFixed(0)}ms, exceeds 500ms target (FR-005)`);
        } else {
          console.log(`VoxPage: Resync completed in ${resyncDuration.toFixed(0)}ms (FR-005)`);
        }
      }).catch(() => {
        // Background might not be ready - this is normal on initial page load
      });
    }
  });

  /**
   * MutationObserver for DOM changes
   */
  let mutationDebounceTimer = null;
  const MUTATION_DEBOUNCE_MS = 500;

  const mutationObserver = new MutationObserver((mutations) => {
    const highlighter = getHighlighter();
    const extractor = getExtractor();
    const highlightElements = highlighter.getHighlightElements?.() || [];

    const hasRelevantMutations = mutations.some(mutation => {
      if (highlightElements.some(el => mutation.target.contains(el) || el.contains(mutation.target))) {
        return true;
      }
      return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    });

    if (hasRelevantMutations) {
      if (mutationDebounceTimer) {
        clearTimeout(mutationDebounceTimer);
      }

      mutationDebounceTimer = setTimeout(() => {
        const extractedParagraphs = extractor.getExtractedParagraphs?.() || [];
        extractor.setExtractedParagraphs?.(extractedParagraphs.filter(el => document.body.contains(el)));
        highlighter.filterValidHighlightElements?.();
        mutationDebounceTimer = null;
      }, MUTATION_DEBOUNCE_MS);
    }
  });

  // Start observing DOM changes
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false,
    attributes: false
  });

  /**
   * T021: Send language detection on page load (019-multilingual-tts)
   * Automatically detect page language after content loads
   */
  function sendInitialLanguageDetection() {
    const langExtractor = getLanguageExtractor();
    if (langExtractor.sendLanguageDetectionRequest) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        langExtractor.sendLanguageDetectionRequest();
        console.log('VoxPage: Sent initial language detection request');
      }, 100);
    }
  }

  // Send language detection on load
  if (document.readyState === 'complete') {
    sendInitialLanguageDetection();
  } else {
    window.addEventListener('load', sendInitialLanguageDetection, { once: true });
  }

  console.log('VoxPage content script fully loaded and message listener registered');
})();
