// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Paragraph Selector Module
 * Handles paragraph selection for targeted playback.
 * Users can click any paragraph to start playback from that point.
 *
 * Feature: 028-smart-audio-cache (User Story 2)
 *
 * @module utils/content/paragraph-selector
 */

import { browser } from 'wxt/browser';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * Paragraph selection state schema
 */
export const paragraphSelectionStateSchema = z.object({
  isActive: z.boolean(),
  selectedIndex: z.number().int().nullable(),
  paragraphElements: z.array(z.custom<Element>((val) => val instanceof Element)),
  cachedIndices: z.array(z.number().int().nonnegative()),
});

export type ParagraphSelectionState = z.infer<typeof paragraphSelectionStateSchema>;

/**
 * Paragraph clicked message payload
 */
export interface ParagraphClickedPayload {
  paragraphIndex: number;
  text: string;
  characterCount: number;
  isCached: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SELECTABLE_CLASS = 'voxpage-selectable';
const SELECTED_CLASS = 'voxpage-selected';
const CACHED_CLASS = 'voxpage-cached';
const PLAY_ICON_CLASS = 'voxpage-play-icon';
const DATA_INDEX_ATTR = 'data-voxpage-select-index';

// ============================================================================
// ParagraphSelector Class
// ============================================================================

/**
 * Manages paragraph selection UI and interactions
 */
export class ParagraphSelector {
  private state: ParagraphSelectionState;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private hoverHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.state = {
      isActive: false,
      selectedIndex: null,
      paragraphElements: [],
      cachedIndices: [],
    };
  }

  /**
   * Check if selection mode is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get the currently selected paragraph index
   */
  getSelectedIndex(): number | null {
    return this.state.selectedIndex;
  }

  /**
   * Enable paragraph selection mode
   * Adds visual indicators and click handlers to all extracted paragraphs
   *
   * @param paragraphElements - Array of DOM elements representing paragraphs
   * @param cachedIndices - Array of paragraph indices that are cached
   */
  enableSelectionMode(paragraphElements: Element[], cachedIndices: number[] = []): void {
    if (this.state.isActive) {
      console.log('VoxPage: Selection mode already active');
      return;
    }

    console.log(
      `VoxPage: Enabling selection mode with ${paragraphElements.length} paragraphs, ${cachedIndices.length} cached`,
    );

    this.state.paragraphElements = paragraphElements;
    this.state.cachedIndices = cachedIndices;
    this.state.isActive = true;

    // Add selectable styling and data attributes to each paragraph
    paragraphElements.forEach((el, index) => {
      el.classList.add(SELECTABLE_CLASS);
      (el as HTMLElement).dataset.voxpageSelectIndex = String(index);

      // Add cached indicator if this paragraph is cached
      if (cachedIndices.includes(index)) {
        el.classList.add(CACHED_CLASS);
      }

      // Create and add play icon
      this.addPlayIcon(el as HTMLElement, index);
    });

    // Setup event handlers
    this.setupEventHandlers();

    console.log('VoxPage: Selection mode enabled');
  }

  /**
   * Disable paragraph selection mode
   * Removes all visual indicators and click handlers
   */
  disableSelectionMode(): void {
    if (!this.state.isActive) {
      return;
    }

    console.log('VoxPage: Disabling selection mode');

    // Remove event handlers
    this.removeEventHandlers();

    // Remove styling from all paragraphs
    this.state.paragraphElements.forEach((el) => {
      el.classList.remove(SELECTABLE_CLASS, SELECTED_CLASS, CACHED_CLASS);
      delete (el as HTMLElement).dataset.voxpageSelectIndex;

      // Remove play icon
      const playIcon = el.querySelector(`.${PLAY_ICON_CLASS}`);
      if (playIcon) {
        playIcon.remove();
      }
    });

    // Reset state
    this.state = {
      isActive: false,
      selectedIndex: null,
      paragraphElements: [],
      cachedIndices: [],
    };

    console.log('VoxPage: Selection mode disabled');
  }

  /**
   * Update cached paragraph indices
   * Call this when cache status changes
   *
   * @param cachedIndices - Updated array of cached paragraph indices
   */
  updateCachedIndices(cachedIndices: number[]): void {
    this.state.cachedIndices = cachedIndices;

    // Update visual indicators
    this.state.paragraphElements.forEach((el, index) => {
      if (cachedIndices.includes(index)) {
        el.classList.add(CACHED_CLASS);
      } else {
        el.classList.remove(CACHED_CLASS);
      }
    });
  }

  /**
   * Select a specific paragraph visually
   *
   * @param index - Paragraph index to select
   */
  selectParagraph(index: number): void {
    if (!this.state.isActive || index < 0 || index >= this.state.paragraphElements.length) {
      return;
    }

    // Clear previous selection
    this.clearSelection();

    // Select new paragraph
    const el = this.state.paragraphElements[index];
    el.classList.add(SELECTED_CLASS);
    this.state.selectedIndex = index;

    console.log(`VoxPage: Paragraph ${index} selected`);
  }

  /**
   * Clear current selection without disabling selection mode
   */
  clearSelection(): void {
    if (this.state.selectedIndex !== null) {
      const prevEl = this.state.paragraphElements[this.state.selectedIndex];
      if (prevEl) {
        prevEl.classList.remove(SELECTED_CLASS);
      }
    }
    this.state.selectedIndex = null;
  }

  /**
   * Refresh selection mode
   * Re-applies styling to current paragraphs (useful after DOM changes)
   */
  refresh(): void {
    if (!this.state.isActive) {
      return;
    }

    // Re-apply styling to all paragraphs
    this.state.paragraphElements.forEach((el, index) => {
      if (!el.classList.contains(SELECTABLE_CLASS)) {
        el.classList.add(SELECTABLE_CLASS);
        (el as HTMLElement).dataset.voxpageSelectIndex = String(index);

        if (this.state.cachedIndices.includes(index)) {
          el.classList.add(CACHED_CLASS);
        }

        // Re-add play icon if missing
        if (!el.querySelector(`.${PLAY_ICON_CLASS}`)) {
          this.addPlayIcon(el as HTMLElement, index);
        }
      }
    });
  }

  /**
   * Get paragraph text by index
   */
  getParagraphText(index: number): string {
    if (index < 0 || index >= this.state.paragraphElements.length) {
      return '';
    }
    return this.state.paragraphElements[index].textContent?.trim() || '';
  }

  /**
   * Check if a paragraph is cached
   */
  isCached(index: number): boolean {
    return this.state.cachedIndices.includes(index);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Add play icon to a paragraph element
   */
  private addPlayIcon(el: HTMLElement, index: number): void {
    // Check if icon already exists
    if (el.querySelector(`.${PLAY_ICON_CLASS}`)) {
      return;
    }

    const playIcon = document.createElement('button');
    playIcon.className = PLAY_ICON_CLASS;
    playIcon.setAttribute('aria-label', `Play from paragraph ${index + 1}`);
    playIcon.setAttribute('title', 'Start playback from here');
    playIcon.dataset.voxpageIndex = String(index);

    // Determine position based on element's margin
    const computedStyle = window.getComputedStyle(el);
    const marginLeft = Number.parseFloat(computedStyle.marginLeft) || 0;

    // If margin is less than 50px, use inline positioning
    if (marginLeft < 50) {
      playIcon.classList.add('voxpage-play-icon--inline');
    }

    // Insert at the beginning of the element
    el.insertBefore(playIcon, el.firstChild);
  }

  /**
   * Setup event handlers for selection interaction
   */
  private setupEventHandlers(): void {
    // Click handler for play icons and paragraphs
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicked on play icon
      const playIcon = target.closest(`.${PLAY_ICON_CLASS}`) as HTMLElement | null;
      if (playIcon) {
        e.preventDefault();
        e.stopPropagation();

        const index = Number.parseInt(playIcon.dataset.voxpageIndex || '', 10);
        if (!isNaN(index)) {
          this.handlePlayFromParagraph(index);
        }
        return;
      }

      // Check if clicked on selectable paragraph (but not an interactive element)
      const selectableEl = target.closest(`.${SELECTABLE_CLASS}`) as HTMLElement | null;
      if (selectableEl) {
        // Don't interfere with links or buttons inside paragraphs
        if (target.closest('a, button, input, [role="button"], [role="link"]')) {
          return;
        }

        const index = Number.parseInt(selectableEl.dataset.voxpageSelectIndex || '', 10);
        if (!isNaN(index)) {
          this.selectParagraph(index);
        }
      }
    };

    document.addEventListener('click', this.clickHandler, true);

    console.log('VoxPage: Selection event handlers setup');
  }

  /**
   * Remove event handlers
   */
  private removeEventHandlers(): void {
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }

    if (this.hoverHandler) {
      document.removeEventListener('mouseover', this.hoverHandler);
      this.hoverHandler = null;
    }
  }

  /**
   * Handle play from a specific paragraph
   * Sends message to background to start playback from this index
   */
  private handlePlayFromParagraph(index: number): void {
    const text = this.getParagraphText(index);
    const isCached = this.isCached(index);

    const payload: ParagraphClickedPayload = {
      paragraphIndex: index,
      text: text.substring(0, 100), // Send preview for logging
      characterCount: text.length,
      isCached,
    };

    console.log(`VoxPage: Starting playback from paragraph ${index}`, {
      isCached,
      characterCount: text.length,
    });

    // Send message to background to start playback from this paragraph
    browser.runtime
      .sendMessage({
        type: 'PARAGRAPH_CLICKED',
        ...payload,
      })
      .catch((err) => {
        console.error('VoxPage: Failed to send PARAGRAPH_CLICKED message:', err);
      });

    // Visually select the paragraph
    this.selectParagraph(index);

    // Disable selection mode as playback will start
    // The background will re-enable it if needed
    this.disableSelectionMode();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance for content script usage
 */
export const paragraphSelector = new ParagraphSelector();

console.log('VoxPage: utils/content/paragraph-selector.ts loaded');
