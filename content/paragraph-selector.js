/**
 * VoxPage Paragraph Selector
 * Manages paragraph hover indicators and play icons for intuitive selection.
 * Provides clear visual feedback before triggering audio playback.
 *
 * @module content/paragraph-selector
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  // Initialize VoxPage namespace
  window.VoxPage = window.VoxPage || {};

  // Prevent re-initialization
  if (window.VoxPage._paragraphSelectorInitialized) {
    return;
  }
  window.VoxPage._paragraphSelectorInitialized = true;

  // Get module references
  const getExtractor = () => window.VoxPage.contentExtractor || {};

  // State
  let selectableParagraphs = [];
  let selectedParagraphIndex = -1;
  let isSelectionModeActive = false;
  let playIconElements = new Map(); // paragraph element -> icon element

  /**
   * Enable selection mode - adds hover indicators and play icons to paragraphs
   */
  function enableSelectionMode() {
    if (isSelectionModeActive) return;

    const extractor = getExtractor();
    const paragraphs = extractor.getExtractedParagraphs?.() || [];

    if (paragraphs.length === 0) {
      console.log('VoxPage: No paragraphs to make selectable');
      return;
    }

    selectableParagraphs = paragraphs;
    isSelectionModeActive = true;

    // Add selectable class and inject play icons
    paragraphs.forEach((el, index) => {
      if (el && el.nodeType === Node.ELEMENT_NODE) {
        el.classList.add('voxpage-selectable');
        el.dataset.voxpageSelectIndex = index.toString();

        // Create and inject play icon
        const icon = createPlayIcon(index, el);
        if (icon) {
          playIconElements.set(el, icon);
        }
      }
    });

    console.log(`VoxPage: Selection mode enabled for ${paragraphs.length} paragraphs`);
  }

  /**
   * Disable selection mode - removes indicators and icons
   */
  function disableSelectionMode() {
    if (!isSelectionModeActive) return;

    selectableParagraphs.forEach(el => {
      if (el && el.nodeType === Node.ELEMENT_NODE) {
        el.classList.remove('voxpage-selectable', 'voxpage-selected');
        delete el.dataset.voxpageSelectIndex;
      }
    });

    // Remove all play icons
    playIconElements.forEach((icon, el) => {
      if (icon.parentNode) {
        icon.parentNode.removeChild(icon);
      }
    });
    playIconElements.clear();

    selectableParagraphs = [];
    selectedParagraphIndex = -1;
    isSelectionModeActive = false;

    console.log('VoxPage: Selection mode disabled');
  }

  /**
   * Create a play icon element for a paragraph
   * @param {number} index - Paragraph index
   * @param {Element} paragraphEl - The paragraph element
   * @returns {Element|null}
   */
  function createPlayIcon(index, paragraphEl) {
    if (!paragraphEl) return null;

    const icon = document.createElement('div');
    icon.className = 'voxpage-play-icon';
    icon.dataset.voxpagePlayIndex = index.toString();
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', `Play from paragraph ${index + 1}`);
    icon.setAttribute('tabindex', '0');

    // Check if we need inline icon (for narrow margins)
    const rect = paragraphEl.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(paragraphEl);
    const marginLeft = parseFloat(computedStyle.marginLeft) || 0;

    // Use inline icon if not enough space on the left
    if (marginLeft < 50 || rect.left < 50) {
      icon.classList.add('voxpage-play-icon--inline');
      // Insert at the beginning of the paragraph
      if (paragraphEl.firstChild) {
        paragraphEl.insertBefore(icon, paragraphEl.firstChild);
      } else {
        paragraphEl.appendChild(icon);
      }
    } else {
      // Absolute positioned icon
      paragraphEl.appendChild(icon);
    }

    // Click handler for play icon
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      playFromParagraph(index);
    });

    // Keyboard support
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        playFromParagraph(index);
      }
    });

    return icon;
  }

  /**
   * Select a paragraph (visual only, doesn't play)
   * @param {number} index - Paragraph index
   */
  function selectParagraph(index) {
    // Clear previous selection
    if (selectedParagraphIndex >= 0 && selectedParagraphIndex < selectableParagraphs.length) {
      const prevEl = selectableParagraphs[selectedParagraphIndex];
      if (prevEl) {
        prevEl.classList.remove('voxpage-selected');
      }
    }

    // Set new selection
    if (index >= 0 && index < selectableParagraphs.length) {
      const el = selectableParagraphs[index];
      if (el) {
        el.classList.add('voxpage-selected');
        selectedParagraphIndex = index;

        // Scroll into view gently
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }

  /**
   * Clear paragraph selection
   */
  function clearSelection() {
    if (selectedParagraphIndex >= 0 && selectedParagraphIndex < selectableParagraphs.length) {
      const el = selectableParagraphs[selectedParagraphIndex];
      if (el) {
        el.classList.remove('voxpage-selected');
      }
    }
    selectedParagraphIndex = -1;
  }

  /**
   * Play from a specific paragraph
   * @param {number} index - Paragraph index
   */
  function playFromParagraph(index) {
    console.log(`VoxPage: Play requested from paragraph ${index}`);

    // Clear selection visual (the highlight system will take over)
    clearSelection();

    // Send message to background to start playback from this paragraph
    browser.runtime.sendMessage({
      action: 'playFromParagraph',
      index: index
    }).catch(err => {
      console.error('VoxPage: Failed to play from paragraph:', err);
    });
  }

  /**
   * Get currently selected paragraph index
   * @returns {number} Selected index or -1
   */
  function getSelectedIndex() {
    return selectedParagraphIndex;
  }

  /**
   * Check if selection mode is active
   * @returns {boolean}
   */
  function isActive() {
    return isSelectionModeActive;
  }

  /**
   * Refresh the selectable paragraphs (after DOM changes)
   */
  function refresh() {
    if (isSelectionModeActive) {
      disableSelectionMode();
      enableSelectionMode();
    }
  }

  // Export to VoxPage namespace
  window.VoxPage.paragraphSelector = {
    enableSelectionMode,
    disableSelectionMode,
    selectParagraph,
    clearSelection,
    playFromParagraph,
    getSelectedIndex,
    isActive,
    refresh
  };

  console.log('VoxPage: paragraph-selector.js loaded');
})();
