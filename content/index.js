/**
 * VoxPage Content Script - Entry Point
 * Handles text extraction and highlighting on web pages.
 * Initializes all content modules and sets up message listeners.
 *
 * @module content/index
 */

// Initialize VoxPage namespace (should already exist from other modules)
window.VoxPage = window.VoxPage || {};

// Get module references
const getExtractor = () => window.VoxPage.contentExtractor || {};
const getHighlighter = () => window.VoxPage.highlightManager || {};

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
 * Jump to a clicked paragraph
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
 */
function setupParagraphClickHandlers() {
  document.addEventListener('click', (event) => {
    const clickedElement = event.target.closest('.voxpage-highlight, [data-voxpage-index]');
    const highlighter = getHighlighter();
    const extractor = getExtractor();

    if (!clickedElement) {
      const extractedParagraphs = extractor.getExtractedParagraphs?.() || [];
      const highlightElements = highlighter.getHighlightElements?.() || [];
      const clickedParagraph = extractedParagraphs.findIndex(el =>
        el.contains(event.target) || el === event.target
      );

      if (clickedParagraph !== -1) {
        if (highlightElements.length > 0) {
          jumpToClickedParagraph(clickedParagraph);
        }
      }
      return;
    }

    const index = parseInt(clickedElement.dataset.voxpageIndex, 10);
    if (!isNaN(index)) {
      jumpToClickedParagraph(index);
    }
  });
}

/**
 * Listen for messages from background script
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const extractor = getExtractor();
  const highlighter = getHighlighter();

  switch (message.action) {
    case 'extractText':
      const text = extractor.extractText?.(message.mode) || '';
      browser.runtime.sendMessage({
        action: 'textContent',
        text: text,
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
  }
});

// Setup click handlers when script loads
setupParagraphClickHandlers();

/**
 * Handle page navigation - clear controller and highlights
 */
window.addEventListener('beforeunload', () => {
  if (window.VoxPage?.floatingController) {
    window.VoxPage.floatingController.hide();
  }
  getHighlighter().clearHighlights?.();
});

/**
 * Handle page visibility changes - notify background for resync
 */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    browser.runtime.sendMessage({
      action: 'requestResync',
      reason: 'tab-visible',
      timestamp: performance.now()
    }).catch(() => {
      // Background might not be ready
    });
    console.log('VoxPage: Tab visible - requesting resync');
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

console.log('VoxPage content script loaded');
