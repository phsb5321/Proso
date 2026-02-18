/**
 * Click Debouncing Unit Tests (035-selection-tts-hardening)
 * Tests for paragraph click debouncing and deduplication logic
 *
 * @module tests/unit/content/debouncing
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Constants matching paragraph-selector.ts
 */
const CLICK_DEBOUNCE_MS = 300;

/**
 * Click Handler - Simulates the debouncing logic from ParagraphSelector
 */
class ClickDebouncer {
  private lastClickTime = 0;
  private lastClickedIndex: number | null = null;
  private currentlyPlayingIndex: number | null = null;
  private clickLog: Array<{
    index: number;
    timestamp: number;
    accepted: boolean;
    reason?: string;
  }> = [];

  /**
   * Process a click on a paragraph
   * Returns true if the click was accepted, false if debounced/deduplicated
   */
  handleClick(index: number): boolean {
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;

    // Check debounce - ignore rapid clicks within 300ms
    if (timeSinceLastClick < CLICK_DEBOUNCE_MS) {
      this.clickLog.push({
        index,
        timestamp: now,
        accepted: false,
        reason: `debounced (${timeSinceLastClick}ms since last click)`,
      });
      return false;
    }

    // Check deduplication - ignore clicks on paragraph already playing
    if (this.currentlyPlayingIndex === index) {
      this.clickLog.push({
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

    this.clickLog.push({
      index,
      timestamp: now,
      accepted: true,
    });

    return true;
  }

  /**
   * Simulate a click at a specific timestamp (for testing time-based logic)
   */
  handleClickAtTime(index: number, timestamp: number): boolean {
    const timeSinceLastClick = timestamp - this.lastClickTime;

    // Check debounce
    if (timeSinceLastClick < CLICK_DEBOUNCE_MS && this.lastClickTime > 0) {
      this.clickLog.push({
        index,
        timestamp,
        accepted: false,
        reason: `debounced (${timeSinceLastClick}ms since last click)`,
      });
      return false;
    }

    // Check deduplication
    if (this.currentlyPlayingIndex === index) {
      this.clickLog.push({
        index,
        timestamp,
        accepted: false,
        reason: 'deduplicated (already playing)',
      });
      return false;
    }

    // Accept the click
    this.lastClickTime = timestamp;
    this.lastClickedIndex = index;
    this.currentlyPlayingIndex = index;

    this.clickLog.push({
      index,
      timestamp,
      accepted: true,
    });

    return true;
  }

  /**
   * Reset the playing state (simulates playback stop)
   */
  resetPlayingState(): void {
    this.currentlyPlayingIndex = null;
  }

  /**
   * Update the currently playing index (simulates playback progress)
   */
  setPlayingIndex(index: number | null): void {
    this.currentlyPlayingIndex = index;
  }

  /**
   * Get the click log for testing
   */
  getClickLog(): typeof this.clickLog {
    return [...this.clickLog];
  }

  /**
   * Get the currently playing index
   */
  getPlayingIndex(): number | null {
    return this.currentlyPlayingIndex;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.lastClickTime = 0;
    this.lastClickedIndex = null;
    this.currentlyPlayingIndex = null;
    this.clickLog = [];
  }
}

/**
 * RapidClickSimulator - Utility for simulating rapid click sequences
 */
class RapidClickSimulator {
  private debouncer: ClickDebouncer;

  constructor(debouncer: ClickDebouncer) {
    this.debouncer = debouncer;
  }

  /**
   * Simulate a sequence of rapid clicks with specified timing
   * @param clicks - Array of { index, delayMs } objects
   * @returns Array of click results
   */
  simulateSequence(
    clicks: Array<{ index: number; delayMs: number }>,
  ): Array<{ index: number; accepted: boolean }> {
    const results: Array<{ index: number; accepted: boolean }> = [];
    let currentTime = 1000; // Start at t=1000ms

    for (const click of clicks) {
      currentTime += click.delayMs;
      const accepted = this.debouncer.handleClickAtTime(click.index, currentTime);
      results.push({ index: click.index, accepted });
    }

    return results;
  }

  /**
   * Simulate double-click (two clicks in rapid succession)
   */
  simulateDoubleClick(index: number): Array<{ accepted: boolean }> {
    return this.simulateSequence([
      { index, delayMs: 0 },
      { index, delayMs: 50 }, // 50ms delay (less than 300ms threshold)
    ]).map((r) => ({ accepted: r.accepted }));
  }

  /**
   * Simulate accidental multi-click (nervous clicking)
   */
  simulateNervousClicking(index: number, count: number = 5): number {
    const clicks = Array.from({ length: count }, () => ({
      index,
      delayMs: Math.floor(Math.random() * 100) + 20, // 20-120ms random delays
    }));

    const results = this.simulateSequence(clicks);
    return results.filter((r) => r.accepted).length;
  }
}

describe('Click Debouncing', () => {
  describe('Debounce Timing (T019)', () => {
    let debouncer: ClickDebouncer;

    beforeEach(() => {
      debouncer = new ClickDebouncer();
    });

    it('should accept first click immediately', () => {
      const result = debouncer.handleClickAtTime(0, 1000);

      expect(result).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(0);
    });

    it('should reject clicks within 300ms of last accepted click', () => {
      // First click accepted
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Click at 100ms - should be rejected
      expect(debouncer.handleClickAtTime(1, 1100)).toBe(false);

      // Click at 200ms - should be rejected
      expect(debouncer.handleClickAtTime(2, 1200)).toBe(false);

      // Click at 299ms - should still be rejected
      expect(debouncer.handleClickAtTime(3, 1299)).toBe(false);

      // Verify log
      const log = debouncer.getClickLog();
      expect(log.filter((l) => l.accepted)).toHaveLength(1);
      expect(log.filter((l) => !l.accepted)).toHaveLength(3);
    });

    it('should accept click after 300ms debounce window', () => {
      // First click
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Click exactly at 300ms - should be accepted
      expect(debouncer.handleClickAtTime(1, 1300)).toBe(true);

      expect(debouncer.getPlayingIndex()).toBe(1);
    });

    it('should handle rapid sequential clicks correctly', () => {
      const simulator = new RapidClickSimulator(debouncer);

      // Simulate: click P0, then rapidly click P1, P2, P3 (all within 300ms)
      // Note: delays are cumulative, so 0+50+50+50=150ms total, all within 300ms window
      const results = simulator.simulateSequence([
        { index: 0, delayMs: 0 },
        { index: 1, delayMs: 50 },
        { index: 2, delayMs: 50 },
        { index: 3, delayMs: 50 },
      ]);

      // Only first click should be accepted (others rejected due to debounce)
      expect(results.filter((r) => r.accepted)).toHaveLength(1);
      expect(results[0].accepted).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(0);
    });

    it('should accept clicks on different paragraphs after debounce window', () => {
      // First click on paragraph 0
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Wait 300ms, click on paragraph 1
      expect(debouncer.handleClickAtTime(1, 1300)).toBe(true);

      // Wait 300ms, click on paragraph 2
      expect(debouncer.handleClickAtTime(2, 1600)).toBe(true);

      expect(debouncer.getPlayingIndex()).toBe(2);
    });
  });

  describe('Deduplication (T021)', () => {
    let debouncer: ClickDebouncer;

    beforeEach(() => {
      debouncer = new ClickDebouncer();
    });

    it('should reject clicks on currently playing paragraph', () => {
      // First click starts playback on paragraph 0
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Wait for debounce window
      // Click again on paragraph 0 (still playing)
      expect(debouncer.handleClickAtTime(0, 1500)).toBe(false);

      // Verify reason is deduplication
      const log = debouncer.getClickLog();
      const rejectedClick = log.find((l) => l.timestamp === 1500);
      expect(rejectedClick?.reason).toContain('deduplicated');
    });

    it('should accept click on different paragraph even if one is playing', () => {
      // Start playback on paragraph 0
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Wait for debounce, click on paragraph 1
      expect(debouncer.handleClickAtTime(1, 1400)).toBe(true);

      expect(debouncer.getPlayingIndex()).toBe(1);
    });

    it('should allow clicking same paragraph after playback stops', () => {
      // Start playback on paragraph 0
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Playback stops
      debouncer.resetPlayingState();

      // Wait for debounce, click on paragraph 0 again
      expect(debouncer.handleClickAtTime(0, 1400)).toBe(true);
    });

    it('should track playing state correctly through transitions', () => {
      // Start on paragraph 0
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(0);

      // Playback progresses to paragraph 1 (external update)
      debouncer.setPlayingIndex(1);
      expect(debouncer.getPlayingIndex()).toBe(1);

      // Wait for debounce, click on paragraph 1 (now playing) - should be rejected
      expect(debouncer.handleClickAtTime(1, 1400)).toBe(false);

      // Click on paragraph 0 (not playing) - should be accepted
      debouncer.resetPlayingState(); // Reset to allow fresh click
      debouncer.setPlayingIndex(1); // Set back to 1
      expect(debouncer.handleClickAtTime(0, 1800)).toBe(true);
    });
  });

  describe('Combined Debounce and Deduplication (T020)', () => {
    let debouncer: ClickDebouncer;
    let simulator: RapidClickSimulator;

    beforeEach(() => {
      debouncer = new ClickDebouncer();
      simulator = new RapidClickSimulator(debouncer);
    });

    it('should handle double-click by accepting only first click', () => {
      const results = simulator.simulateDoubleClick(0);

      expect(results[0].accepted).toBe(true);
      expect(results[1].accepted).toBe(false);
      expect(debouncer.getPlayingIndex()).toBe(0);
    });

    it('should handle nervous clicking by accepting only first click', () => {
      const acceptedCount = simulator.simulateNervousClicking(0, 10);

      expect(acceptedCount).toBe(1);
    });

    it('should prioritize debounce over deduplication for rapid clicks', () => {
      // Rapid clicks on same paragraph
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);
      expect(debouncer.handleClickAtTime(0, 1050)).toBe(false);

      // Check reason - should be debounce (since it triggers first)
      const log = debouncer.getClickLog();
      const rejectedClick = log.find((l) => l.timestamp === 1050);
      expect(rejectedClick?.reason).toContain('debounced');
    });

    it('should use deduplication when debounce passes but same paragraph', () => {
      // First click
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Wait for debounce (300ms+), click same paragraph
      expect(debouncer.handleClickAtTime(0, 1400)).toBe(false);

      // Check reason - should be deduplication
      const log = debouncer.getClickLog();
      const rejectedClick = log.find((l) => l.timestamp === 1400);
      expect(rejectedClick?.reason).toContain('deduplicated');
    });

    it('should handle complex click sequence correctly', () => {
      // Complex sequence: P0, wait, P0 (dup), P1, wait, P1 (dup), P0
      const results = simulator.simulateSequence([
        { index: 0, delayMs: 0 }, // t=1000: accept
        { index: 0, delayMs: 400 }, // t=1400: reject (dup)
        { index: 1, delayMs: 400 }, // t=1800: accept
        { index: 1, delayMs: 100 }, // t=1900: reject (debounce)
        { index: 0, delayMs: 400 }, // t=2300: accept
      ]);

      expect(results.map((r) => r.accepted)).toEqual([true, false, true, false, true]);
    });
  });

  describe('Edge Cases', () => {
    let debouncer: ClickDebouncer;

    beforeEach(() => {
      debouncer = new ClickDebouncer();
    });

    it('should handle negative paragraph indices gracefully', () => {
      // Negative index should still work (edge case)
      expect(debouncer.handleClickAtTime(-1, 1000)).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(-1);
    });

    it('should handle very large paragraph indices', () => {
      expect(debouncer.handleClickAtTime(999999, 1000)).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(999999);
    });

    it('should handle reset between click sequences', () => {
      // First sequence
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);
      expect(debouncer.handleClickAtTime(0, 1050)).toBe(false);

      // Reset
      debouncer.reset();

      // New sequence should start fresh
      expect(debouncer.handleClickAtTime(0, 1100)).toBe(true);
      expect(debouncer.getPlayingIndex()).toBe(0);
    });

    it('should maintain separate debounce and deduplication state', () => {
      // Click P0
      debouncer.handleClickAtTime(0, 1000);

      // Externally set playing to P1 (simulates auto-advance)
      debouncer.setPlayingIndex(1);

      // Wait for debounce
      // Click P1 (currently playing) - should be rejected as dup
      expect(debouncer.handleClickAtTime(1, 1400)).toBe(false);

      // Click P0 (not playing, debounce passed) - should be accepted
      expect(debouncer.handleClickAtTime(0, 1800)).toBe(true);
    });

    it('should handle boundary condition at exactly 300ms', () => {
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // Exactly at boundary - should be accepted
      expect(debouncer.handleClickAtTime(1, 1300)).toBe(true);
    });

    it('should handle boundary condition at 299ms', () => {
      expect(debouncer.handleClickAtTime(0, 1000)).toBe(true);

      // 1ms before boundary - should be rejected
      expect(debouncer.handleClickAtTime(1, 1299)).toBe(false);
    });
  });

  describe('State Management', () => {
    let debouncer: ClickDebouncer;

    beforeEach(() => {
      debouncer = new ClickDebouncer();
    });

    it('should track lastClickTime correctly', () => {
      debouncer.handleClickAtTime(0, 1000);
      debouncer.handleClickAtTime(1, 1400);

      // Get log and verify timestamps
      const log = debouncer.getClickLog();
      expect(log[0].timestamp).toBe(1000);
      expect(log[1].timestamp).toBe(1400);
    });

    it('should maintain click log for debugging', () => {
      debouncer.handleClickAtTime(0, 1000);
      debouncer.handleClickAtTime(0, 1050);
      debouncer.handleClickAtTime(1, 1400);

      const log = debouncer.getClickLog();
      expect(log).toHaveLength(3);
      expect(log[0]).toMatchObject({ index: 0, accepted: true });
      expect(log[1]).toMatchObject({ index: 0, accepted: false });
      expect(log[2]).toMatchObject({ index: 1, accepted: true });
    });

    it('should allow inspection of rejection reasons', () => {
      debouncer.handleClickAtTime(0, 1000);
      debouncer.handleClickAtTime(1, 1050); // debounced
      debouncer.handleClickAtTime(0, 1400); // deduplicated

      const log = debouncer.getClickLog();
      expect(log[1].reason).toMatch(/debounced/);
      expect(log[2].reason).toMatch(/deduplicated/);
    });
  });
});
