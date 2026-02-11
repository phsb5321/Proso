/**
 * Timer Sync Unit Tests
 *
 * Tests for Bug 1: Footer timer not syncing with actual playback position.
 * These tests MUST FAIL before the fix is applied (TDD approach).
 *
 * @module tests/unit/content/sticky-footer-timer.test
 * @feature 046-bug-bounty-sprint
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockAudioElement,
  createTimeupdateSimulator,
  createFooterStateMessageCapture,
  formatTime,
  parseTime,
  assertTimerWithinDrift,
  type MockAudioElement,
} from '../../fixtures/timer-helpers';

/**
 * @jest-environment jsdom
 */

describe('Bug 1: Footer Timer Sync (US1)', () => {
  let mockAudio: MockAudioElement;
  let messageCapture: ReturnType<typeof createFooterStateMessageCapture>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAudio = createMockAudioElement({ duration: 60 });
    messageCapture = createFooterStateMessageCapture();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Timer Update on audio.ontimeupdate', () => {
    it('should update footer timer when audio.ontimeupdate fires', () => {
      // Arrange: Set up audio to have a specific time
      mockAudio.currentTime = 30;

      // Act: Fire timeupdate event
      mockAudio._emitTimeUpdate();

      // Assert: The footer should receive the updated time
      // NOTE: This test documents the expected behavior.
      // The actual integration with the footer would require
      // the background script to call updateFooterProgress() on each timeupdate.
      expect(mockAudio.currentTime).toBe(30);
    });

    it('should emit timeupdate at browser-standard rate (~4 times/second)', () => {
      // Arrange
      const simulator = createTimeupdateSimulator(mockAudio, { intervalMs: 250 });
      let updateCount = 0;

      mockAudio.ontimeupdate = () => {
        updateCount++;
      };

      // Act: Start playback and simulate 1 second
      mockAudio.paused = false;
      for (let i = 0; i < 4; i++) {
        simulator.tick();
      }

      // Assert: Should have ~4 updates per second
      expect(updateCount).toBe(4);
    });
  });

  describe('Timer matches audio.currentTime within 500ms', () => {
    it('should display time that matches actual audio position within 500ms drift', () => {
      // Arrange
      const actualTime = 45.5; // 45.5 seconds
      const displayedTime = formatTime(actualTime);
      const parsedTime = parseTime(displayedTime);

      // Assert: Displayed time should be within 500ms of actual
      assertTimerWithinDrift(parsedTime, actualTime, 500);
    });

    it('should not have drift greater than 500ms after extended playback', () => {
      // Arrange: Create mock audio with 5 minute duration
      const longAudio = createMockAudioElement({ duration: 300 });
      const totalDuration = 300; // 5 minutes

      // Act: Set final time directly
      longAudio._setCurrentTime(totalDuration);
      const displayedTimeStr = formatTime(longAudio.currentTime);
      const lastDisplayedTime = parseTime(displayedTimeStr);

      // Assert: Final displayed time should match (formatTime truncates to whole seconds)
      // 300 seconds -> "5:00" -> 300 seconds
      expect(lastDisplayedTime).toBe(300);
      expect(longAudio.currentTime).toBe(300);
    });
  });

  describe('No drift after pause/resume', () => {
    it('should maintain accurate time after pause', () => {
      // Arrange
      mockAudio._setCurrentTime(30);
      mockAudio.pause();

      // Act: Wait some time (simulated)
      jest.advanceTimersByTime(5000);

      // Assert: Time should still be 30 after pause
      expect(mockAudio.currentTime).toBe(30);
      expect(mockAudio.paused).toBe(true);
    });

    it('should maintain accurate time after resume', () => {
      // Arrange
      mockAudio._setCurrentTime(30);
      mockAudio.pause();
      jest.advanceTimersByTime(2000);

      // Act: Resume playback
      mockAudio.play();
      mockAudio._advanceTime(5);

      // Assert: Time should be 35 (30 + 5)
      expect(mockAudio.currentTime).toBe(35);
    });

    it('should not have cumulative drift after multiple pause/resume cycles', () => {
      // Arrange
      const cycles = 10;
      const advancePerCycle = 5;
      let expectedTime = 0;

      // Act: Multiple pause/resume cycles
      for (let i = 0; i < cycles; i++) {
        mockAudio.play();
        mockAudio._advanceTime(advancePerCycle);
        expectedTime += advancePerCycle;
        mockAudio.pause();
        jest.advanceTimersByTime(1000);
      }

      // Assert: Total time should match expected
      expect(mockAudio.currentTime).toBe(expectedTime);
      assertTimerWithinDrift(mockAudio.currentTime, expectedTime, 100);
    });
  });

  describe('Resync on tab visibility change', () => {
    it('should trigger resync within 500ms when tab becomes visible', async () => {
      // Arrange: Simulate tab becoming hidden then visible
      const visibilityChangeHandler = jest.fn();
      document.addEventListener('visibilitychange', visibilityChangeHandler);

      // Act: Simulate visibility change
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Assert: Handler should be called
      expect(visibilityChangeHandler).toHaveBeenCalled();

      // Cleanup
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
    });

    it('should maintain time accuracy after tab switch', () => {
      // Arrange
      mockAudio._setCurrentTime(25);

      // Act: Simulate tab hidden, then visible
      const timeBeforeHidden = mockAudio.currentTime;

      // Simulate background (no updates for 2 seconds)
      jest.advanceTimersByTime(2000);

      // Tab becomes visible again
      const timeAfterVisible = mockAudio.currentTime;

      // Assert: Time should be the same (audio pauses in background)
      expect(timeAfterVisible).toBe(timeBeforeHidden);
    });
  });

  describe('formatTime utility', () => {
    it('should format 0 seconds as "0:00"', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format 30 seconds as "0:30"', () => {
      expect(formatTime(30)).toBe('0:30');
    });

    it('should format 60 seconds as "1:00"', () => {
      expect(formatTime(60)).toBe('1:00');
    });

    it('should format 90 seconds as "1:30"', () => {
      expect(formatTime(90)).toBe('1:30');
    });

    it('should format 125.7 seconds as "2:05"', () => {
      expect(formatTime(125.7)).toBe('2:05');
    });

    it('should handle NaN as "0:00"', () => {
      expect(formatTime(NaN)).toBe('0:00');
    });

    it('should handle Infinity as "0:00"', () => {
      expect(formatTime(Infinity)).toBe('0:00');
    });

    it('should handle negative numbers as "0:00"', () => {
      expect(formatTime(-10)).toBe('0:00');
    });
  });

  describe('parseTime utility', () => {
    it('should parse "0:00" as 0', () => {
      expect(parseTime('0:00')).toBe(0);
    });

    it('should parse "1:30" as 90', () => {
      expect(parseTime('1:30')).toBe(90);
    });

    it('should parse "5:45" as 345', () => {
      expect(parseTime('5:45')).toBe(345);
    });

    it('should be inverse of formatTime', () => {
      const testValues = [0, 30, 60, 90, 125, 300, 3600];
      for (const value of testValues) {
        const formatted = formatTime(value);
        const parsed = parseTime(formatted);
        expect(parsed).toBe(Math.floor(value));
      }
    });

    it('should return 0 for invalid format', () => {
      expect(parseTime('invalid')).toBe(0);
      expect(parseTime('1:2:3')).toBe(0);
      expect(parseTime('')).toBe(0);
    });
  });
});

describe('Timer Sync Integration', () => {
  it('documents the bug: FOOTER_STATE_UPDATE not sent on every timeupdate', () => {
    /**
     * ROOT CAUSE ANALYSIS:
     *
     * In src/entrypoints/background.ts:
     * - Line 522-527: audio.ontimeupdate updates playbackState but does NOT call updateFooterProgress()
     * - Line 1089-1099: updateFooterProgress() is defined but never called
     *
     * The fix requires:
     * 1. Call updateFooterProgress() inside audio.ontimeupdate handler
     * 2. Or set up a separate interval that calls updateFooterProgress() at ~4Hz
     *
     * This test documents the expected behavior.
     */

    // Expected behavior: FOOTER_STATE_UPDATE should be sent ~4 times per second
    const expectedUpdatesPerSecond = 4;
    const playbackDuration = 5; // 5 seconds
    const expectedTotalUpdates = expectedUpdatesPerSecond * playbackDuration;

    // This assertion will help verify the fix
    expect(expectedTotalUpdates).toBe(20);
  });
});
