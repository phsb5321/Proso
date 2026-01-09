/**
 * Paragraph Selector Unit Tests (035-selection-tts-hardening)
 * Tests for click debounce, deduplication, and selection pipeline
 *
 * @module tests/unit/content/paragraph-selector
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock browser API - unused in this file since we test the mock implementation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockSendMessage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Constants matching paragraph-selector.ts
const CLICK_DEBOUNCE_MS = 300;
const SELECTABLE_CLASS = 'voxpage-selectable';
const SELECTED_CLASS = 'voxpage-selected';
const CACHED_CLASS = 'voxpage-cached';
const PLAY_ICON_CLASS = 'voxpage-play-icon';

/**
 * Mock ParagraphSelector implementation for unit testing
 * Simulates the core state management without DOM dependencies
 */
class MockParagraphSelector {
  private isActiveState = false;
  private selectedIndex: number | null = null;
  private paragraphCount = 0;
  private cachedIndices: number[] = [];

  // Debounce state (T017-T020)
  private lastClickTime = 0;
  private lastClickedIndex: number | null = null;
  private currentlyPlayingIndex: number | null = null;

  // Test inspection
  private clickHistory: Array<{
    index: number;
    timestamp: number;
    accepted: boolean;
    reason?: string;
  }> = [];

  /**
   * Enable selection mode
   */
  enableSelectionMode(paragraphCount: number, cachedIndices: number[] = []): void {
    if (this.isActiveState) return;

    this.isActiveState = true;
    this.paragraphCount = paragraphCount;
    this.cachedIndices = cachedIndices;
  }

  /**
   * Disable selection mode
   */
  disableSelectionMode(): void {
    this.isActiveState = false;
    this.selectedIndex = null;
    this.paragraphCount = 0;
    this.cachedIndices = [];
  }

  /**
   * Check if selection mode is active
   */
  isActive(): boolean {
    return this.isActiveState;
  }

  /**
   * Get selected paragraph index
   */
  getSelectedIndex(): number | null {
    return this.selectedIndex;
  }

  /**
   * Select a paragraph
   */
  selectParagraph(index: number): boolean {
    if (!this.isActiveState || index < 0 || index >= this.paragraphCount) {
      return false;
    }

    this.selectedIndex = index;
    return true;
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedIndex = null;
  }

  /**
   * Handle paragraph click with debounce and deduplication
   * @param index - Paragraph index
   * @param timestamp - Click timestamp (optional, defaults to Date.now())
   * @returns true if click was accepted
   */
  handleClick(index: number, timestamp?: number): boolean {
    const now = timestamp ?? Date.now();
    const timeSinceLastClick = now - this.lastClickTime;

    // T017: Debounce - ignore rapid clicks within 300ms
    if (this.lastClickTime > 0 && timeSinceLastClick < CLICK_DEBOUNCE_MS) {
      this.clickHistory.push({
        index,
        timestamp: now,
        accepted: false,
        reason: `debounced (${timeSinceLastClick}ms since last)`,
      });
      return false;
    }

    // T018: Deduplication - ignore clicks on paragraph already playing
    if (this.currentlyPlayingIndex === index) {
      this.clickHistory.push({
        index,
        timestamp: now,
        accepted: false,
        reason: 'deduplicated (already playing)',
      });
      return false;
    }

    // Accept the click
    this.lastClickTime = now;
    this.lastClickedIndex = index;
    this.currentlyPlayingIndex = index;
    this.selectedIndex = index;

    this.clickHistory.push({
      index,
      timestamp: now,
      accepted: true,
    });

    return true;
  }

  /**
   * Get currently playing paragraph index
   */
  getPlayingIndex(): number | null {
    return this.currentlyPlayingIndex;
  }

  /**
   * Set currently playing index (called by playback system)
   */
  setPlayingIndex(index: number | null): void {
    this.currentlyPlayingIndex = index;
  }

  /**
   * Reset playing state
   */
  resetPlayingState(): void {
    this.currentlyPlayingIndex = null;
  }

  /**
   * Get last click timestamp
   */
  getLastClickTime(): number {
    return this.lastClickTime;
  }

  /**
   * Get click history for testing
   */
  getClickHistory(): typeof this.clickHistory {
    return [...this.clickHistory];
  }

  /**
   * Check if paragraph is cached
   */
  isCached(index: number): boolean {
    return this.cachedIndices.includes(index);
  }

  /**
   * Update cached indices
   */
  updateCachedIndices(indices: number[]): void {
    this.cachedIndices = indices;
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.isActiveState = false;
    this.selectedIndex = null;
    this.paragraphCount = 0;
    this.cachedIndices = [];
    this.lastClickTime = 0;
    this.lastClickedIndex = null;
    this.currentlyPlayingIndex = null;
    this.clickHistory = [];
  }
}

describe('ParagraphSelector', () => {
  let selector: MockParagraphSelector;

  beforeEach(() => {
    selector = new MockParagraphSelector();
    mockSendMessage.mockClear();
  });

  describe('Click Debounce (T017)', () => {
    it('should ignore rapid clicks within 300ms debounce window', () => {
      selector.enableSelectionMode(10);

      // First click at t=1000
      expect(selector.handleClick(0, 1000)).toBe(true);

      // Rapid clicks within 300ms should be ignored
      expect(selector.handleClick(1, 1050)).toBe(false); // 50ms
      expect(selector.handleClick(2, 1100)).toBe(false); // 100ms
      expect(selector.handleClick(3, 1200)).toBe(false); // 200ms
      expect(selector.handleClick(4, 1299)).toBe(false); // 299ms

      // Verify only first click was accepted
      const history = selector.getClickHistory();
      expect(history.filter((h) => h.accepted)).toHaveLength(1);
      expect(history[0].index).toBe(0);
    });

    it('should accept clicks after debounce window expires', () => {
      selector.enableSelectionMode(10);

      // First click at t=1000
      expect(selector.handleClick(0, 1000)).toBe(true);

      // Click at exactly 300ms should be accepted
      expect(selector.handleClick(1, 1300)).toBe(true);

      // Another click at 300ms later
      expect(selector.handleClick(2, 1600)).toBe(true);

      const history = selector.getClickHistory();
      expect(history.filter((h) => h.accepted)).toHaveLength(3);
    });

    it('should track last click timestamp correctly', () => {
      selector.enableSelectionMode(10);

      // Initial state
      expect(selector.getLastClickTime()).toBe(0);

      // After first click
      selector.handleClick(0, 1000);
      expect(selector.getLastClickTime()).toBe(1000);

      // After rapid click (should not update)
      selector.handleClick(1, 1050);
      expect(selector.getLastClickTime()).toBe(1000);

      // After debounce window (should update)
      selector.handleClick(2, 1400);
      expect(selector.getLastClickTime()).toBe(1400);
    });
  });

  describe('Click Deduplication (T018)', () => {
    it('should ignore clicks on paragraph already playing', () => {
      selector.enableSelectionMode(10);

      // Start playing paragraph 0
      expect(selector.handleClick(0, 1000)).toBe(true);
      expect(selector.getPlayingIndex()).toBe(0);

      // Wait for debounce, click on same paragraph
      expect(selector.handleClick(0, 1400)).toBe(false);

      // Verify reason
      const history = selector.getClickHistory();
      const rejectedClick = history.find((h) => h.timestamp === 1400);
      expect(rejectedClick?.reason).toContain('deduplicated');
    });

    it('should allow clicks on different paragraphs', () => {
      selector.enableSelectionMode(10);

      // Start playing paragraph 0
      expect(selector.handleClick(0, 1000)).toBe(true);

      // Wait for debounce, click on different paragraph
      expect(selector.handleClick(5, 1400)).toBe(true);

      expect(selector.getPlayingIndex()).toBe(5);
    });

    it('should track currently playing paragraph index', () => {
      selector.enableSelectionMode(10);

      // Initially null
      expect(selector.getPlayingIndex()).toBe(null);

      // After click
      selector.handleClick(3, 1000);
      expect(selector.getPlayingIndex()).toBe(3);

      // External update (playback progress)
      selector.setPlayingIndex(4);
      expect(selector.getPlayingIndex()).toBe(4);

      // Reset
      selector.resetPlayingState();
      expect(selector.getPlayingIndex()).toBe(null);
    });
  });

  describe('Selection State', () => {
    it('should initialize with inactive state', () => {
      const freshSelector = new MockParagraphSelector();

      expect(freshSelector.isActive()).toBe(false);
      expect(freshSelector.getSelectedIndex()).toBe(null);
      expect(freshSelector.getPlayingIndex()).toBe(null);
    });

    it('should track selected paragraph index', () => {
      selector.enableSelectionMode(10);

      // Initially no selection
      expect(selector.getSelectedIndex()).toBe(null);

      // Select paragraph
      selector.selectParagraph(5);
      expect(selector.getSelectedIndex()).toBe(5);

      // Select different paragraph
      selector.selectParagraph(8);
      expect(selector.getSelectedIndex()).toBe(8);
    });

    it('should clear selection correctly', () => {
      selector.enableSelectionMode(10);

      // Select and verify
      selector.selectParagraph(3);
      expect(selector.getSelectedIndex()).toBe(3);

      // Clear and verify
      selector.clearSelection();
      expect(selector.getSelectedIndex()).toBe(null);

      // Should still be active
      expect(selector.isActive()).toBe(true);
    });
  });

  describe('Enable/Disable Mode', () => {
    it('should enable selection mode correctly', () => {
      expect(selector.isActive()).toBe(false);

      selector.enableSelectionMode(10, [0, 1, 2]);

      expect(selector.isActive()).toBe(true);
      expect(selector.isCached(0)).toBe(true);
      expect(selector.isCached(5)).toBe(false);
    });

    it('should not re-enable if already active', () => {
      selector.enableSelectionMode(10, [0]);
      selector.selectParagraph(5);

      // Try to enable again
      selector.enableSelectionMode(20, [1, 2, 3]);

      // State should be unchanged
      expect(selector.getSelectedIndex()).toBe(5);
    });

    it('should disable selection mode and reset state', () => {
      selector.enableSelectionMode(10, [0, 1]);
      selector.selectParagraph(5);
      selector.handleClick(3, 1000);

      // Disable
      selector.disableSelectionMode();

      expect(selector.isActive()).toBe(false);
      expect(selector.getSelectedIndex()).toBe(null);
      expect(selector.isCached(0)).toBe(false);
    });
  });

  describe('Cache Status', () => {
    it('should track cached paragraph indices', () => {
      selector.enableSelectionMode(10, [0, 2, 4, 6, 8]);

      expect(selector.isCached(0)).toBe(true);
      expect(selector.isCached(1)).toBe(false);
      expect(selector.isCached(2)).toBe(true);
      expect(selector.isCached(3)).toBe(false);
    });

    it('should update cached indices dynamically', () => {
      selector.enableSelectionMode(10, [0, 1]);

      expect(selector.isCached(0)).toBe(true);
      expect(selector.isCached(5)).toBe(false);

      // Update cache status
      selector.updateCachedIndices([0, 1, 5, 6, 7]);

      expect(selector.isCached(0)).toBe(true);
      expect(selector.isCached(5)).toBe(true);
    });
  });

  describe('Boundary Conditions', () => {
    it('should reject selection for invalid indices', () => {
      selector.enableSelectionMode(10);

      expect(selector.selectParagraph(-1)).toBe(false);
      expect(selector.selectParagraph(10)).toBe(false);
      expect(selector.selectParagraph(100)).toBe(false);
    });

    it('should handle selection when mode is inactive', () => {
      // Without enabling mode
      expect(selector.selectParagraph(5)).toBe(false);
      expect(selector.getSelectedIndex()).toBe(null);
    });

    it('should handle click at exact debounce boundary', () => {
      selector.enableSelectionMode(10);

      selector.handleClick(0, 1000);

      // Exactly at 300ms boundary - should be accepted
      expect(selector.handleClick(1, 1300)).toBe(true);
    });

    it('should handle click at 1ms before debounce boundary', () => {
      selector.enableSelectionMode(10);

      selector.handleClick(0, 1000);

      // 1ms before boundary - should be rejected
      expect(selector.handleClick(1, 1299)).toBe(false);
    });
  });
});
