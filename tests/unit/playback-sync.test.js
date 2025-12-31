/**
 * Unit tests for PlaybackSyncState (T069)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlaybackSyncState } from '../../background/playback-sync.js';

describe('PlaybackSyncState', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
  });

  afterEach(() => {
    syncState.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(syncState.currentParagraphIndex).toBe(0);
      expect(syncState.currentTimeMs).toBe(0);
      expect(syncState.totalDurationMs).toBe(0);
      expect(syncState.currentWordIndex).toBeNull();
      expect(syncState.hasWordTiming).toBe(false);
      expect(syncState.progressPercent).toBe(0);
    });
  });

  describe('buildParagraphTimeline', () => {
    it('should build timeline from paragraphs', () => {
      const paragraphs = ['Hello world', 'This is a test'];
      const totalDurationMs = 10000;

      syncState.buildParagraphTimeline(paragraphs, totalDurationMs);

      expect(syncState.paragraphTimeline.length).toBe(2);
      expect(syncState.totalDurationMs).toBe(10000);
    });

    it('should distribute time proportionally based on word count', () => {
      const paragraphs = ['One', 'One two three four'];
      const totalDurationMs = 10000;

      syncState.buildParagraphTimeline(paragraphs, totalDurationMs);

      // First paragraph has 1 word, second has 4 words
      // Total 5 words, so first = 2000ms, second = 8000ms
      expect(syncState.paragraphTimeline[0].durationMs).toBe(2000);
      expect(syncState.paragraphTimeline[1].durationMs).toBe(8000);
    });

    it('should handle empty paragraphs array', () => {
      syncState.buildParagraphTimeline([], 10000);

      expect(syncState.paragraphTimeline.length).toBe(0);
    });

    it('should set correct start and end times', () => {
      const paragraphs = ['First', 'Second'];
      const totalDurationMs = 4000;

      syncState.buildParagraphTimeline(paragraphs, totalDurationMs);

      expect(syncState.paragraphTimeline[0].startTimeMs).toBe(0);
      expect(syncState.paragraphTimeline[0].endTimeMs).toBe(2000);
      expect(syncState.paragraphTimeline[1].startTimeMs).toBe(2000);
      expect(syncState.paragraphTimeline[1].endTimeMs).toBe(4000);
    });
  });

  describe('syncToParagraph', () => {
    let paragraphChangeCallback;

    beforeEach(() => {
      paragraphChangeCallback = jest.fn();
      syncState.onParagraphChange(paragraphChangeCallback);

      const paragraphs = ['First', 'Second', 'Third'];
      syncState.buildParagraphTimeline(paragraphs, 3000);
    });

    it('should detect paragraph change based on time', () => {
      syncState._currentTimeMs = 1500; // Middle of second paragraph
      syncState.syncToParagraph();

      expect(syncState.currentParagraphIndex).toBe(1);
      expect(paragraphChangeCallback).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('should not trigger callback if paragraph unchanged', () => {
      syncState._currentTimeMs = 500; // Still in first paragraph
      syncState.syncToParagraph();
      syncState.syncToParagraph(); // Call again

      expect(paragraphChangeCallback).toHaveBeenCalledTimes(0); // Started at 0
    });

    it('should handle time at paragraph boundary', () => {
      syncState._currentTimeMs = 1000; // Exactly at start of second
      syncState.syncToParagraph();

      expect(syncState.currentParagraphIndex).toBe(1);
    });
  });

  describe('Word Timeline', () => {
    it('should set word timeline', () => {
      const wordTimeline = [
        { word: 'Hello', startTimeMs: 0, endTimeMs: 500 },
        { word: 'World', startTimeMs: 500, endTimeMs: 1000 }
      ];

      syncState.setWordTimeline(wordTimeline);

      expect(syncState.hasWordTiming).toBe(true);
      expect(syncState.currentWordIndex).toBe(0);
    });

    it('should clear word timeline', () => {
      syncState.setWordTimeline([{ word: 'Test', startTimeMs: 0, endTimeMs: 100 }]);
      syncState.clearWordTimeline();

      expect(syncState.hasWordTiming).toBe(false);
      expect(syncState.currentWordIndex).toBeNull();
    });
  });

  describe('syncToWord', () => {
    let wordChangeCallback;

    beforeEach(() => {
      wordChangeCallback = jest.fn();
      syncState.onWordChange(wordChangeCallback);

      syncState.setWordTimeline([
        { word: 'Hello', startTimeMs: 0, endTimeMs: 500 },
        { word: 'World', startTimeMs: 500, endTimeMs: 1000 }
      ]);
    });

    it('should detect word change based on time', () => {
      syncState._currentTimeMs = 600; // In "World"
      syncState.syncToWord();

      expect(syncState.currentWordIndex).toBe(1);
      expect(wordChangeCallback).toHaveBeenCalledWith(0, 1, expect.any(Number));
    });

    it('should do nothing without word timeline', () => {
      syncState.clearWordTimeline();
      syncState._currentTimeMs = 600;
      syncState.syncToWord();

      expect(wordChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe('Progress', () => {
    it('should calculate progress percentage correctly', () => {
      syncState._totalDurationMs = 10000;
      syncState._currentTimeMs = 2500;

      expect(syncState.progressPercent).toBe(25);
    });

    it('should handle zero duration', () => {
      syncState._totalDurationMs = 0;
      syncState._currentTimeMs = 1000;

      expect(syncState.progressPercent).toBe(0);
    });

    it('should cap progress at 100%', () => {
      syncState._totalDurationMs = 10000;
      syncState._currentTimeMs = 15000;

      expect(syncState.progressPercent).toBe(100);
    });
  });

  describe('Time Remaining', () => {
    it('should format time remaining correctly', () => {
      syncState._totalDurationMs = 125000; // 2:05
      syncState._currentTimeMs = 5000;     // 0:05 elapsed

      expect(syncState.getTimeRemaining()).toBe('2:00');
    });

    it('should handle completion', () => {
      syncState._totalDurationMs = 10000;
      syncState._currentTimeMs = 10000;

      expect(syncState.getTimeRemaining()).toBe('0:00');
    });

    it('should pad seconds with zero', () => {
      syncState._totalDurationMs = 65000; // 1:05
      syncState._currentTimeMs = 0;

      expect(syncState.getTimeRemaining()).toBe('1:05');
    });
  });

  describe('Seeking', () => {
    beforeEach(() => {
      syncState.buildParagraphTimeline(['A', 'B', 'C'], 3000);
    });

    it('should seek to specific time', () => {
      syncState.seekTo(1500);

      expect(syncState.currentTimeMs).toBe(1500);
      expect(syncState.currentParagraphIndex).toBe(1);
    });

    it('should clamp seek to valid range', () => {
      syncState.seekTo(-100);
      expect(syncState.currentTimeMs).toBe(0);

      syncState.seekTo(10000);
      expect(syncState.currentTimeMs).toBe(3000);
    });

    it('should seek to paragraph', () => {
      syncState.seekToParagraph(2);

      expect(syncState.currentParagraphIndex).toBe(2);
      expect(syncState.currentTimeMs).toBe(2000);
    });
  });

  describe('Sync Loop Control', () => {
    it('should start sync loop', () => {
      syncState.start();
      expect(syncState._isRunning).toBe(true);
      syncState.stop();
    });

    it('should stop sync loop', () => {
      syncState.start();
      syncState.stop();
      expect(syncState._isRunning).toBe(false);
    });

    it('should pause and resume', () => {
      syncState.start();
      syncState.pause();
      expect(syncState._isRunning).toBe(false);

      syncState.resume();
      expect(syncState._isRunning).toBe(true);

      syncState.stop();
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      syncState.buildParagraphTimeline(['A', 'B'], 2000);
      syncState.setWordTimeline([{ word: 'A', startTimeMs: 0, endTimeMs: 1000 }]);
      syncState._currentTimeMs = 500;
      syncState._currentParagraphIndex = 1;

      syncState.reset();

      expect(syncState.paragraphTimeline).toEqual([]);
      expect(syncState.wordTimeline).toBeNull();
      expect(syncState.currentTimeMs).toBe(0);
      expect(syncState.currentParagraphIndex).toBe(0);
      expect(syncState._isRunning).toBe(false);
    });

    it('should reset initial sync flag (T009)', () => {
      syncState.buildParagraphTimeline(['A', 'B'], 2000);
      syncState._hasInitialSyncFired = true;

      syncState.reset();

      expect(syncState._hasInitialSyncFired).toBe(false);
    });

    it('should reset timeline accuracy flag', () => {
      syncState.buildParagraphTimeline(['A', 'B'], 2000);
      syncState._isTimelineAccurate = true;

      syncState.reset();

      expect(syncState._isTimelineAccurate).toBe(false);
    });
  });

  // T016: Unit test for rebuildTimelineWithDuration() scaling
  describe('rebuildTimelineWithDuration (T016)', () => {
    beforeEach(() => {
      // Build initial timeline with estimated duration of 10 seconds
      syncState.buildParagraphTimeline(['Short', 'A bit longer text here'], 10000);
    });

    it('should scale timeline when actual duration differs', () => {
      const originalTotal = syncState.totalDurationMs;
      expect(originalTotal).toBe(10000);

      // Actual audio is 20 seconds (2x longer)
      syncState.rebuildTimelineWithDuration(20000);

      expect(syncState.totalDurationMs).toBe(20000);
      // First paragraph timing should double
      expect(syncState.paragraphTimeline[0].startTimeMs).toBe(0);
      expect(syncState.paragraphTimeline[0].durationMs).toBeGreaterThan(0);
    });

    it('should preserve proportional distribution after scaling', () => {
      // Get original proportions
      const original0 = syncState.paragraphTimeline[0].durationMs / syncState.totalDurationMs;
      const original1 = syncState.paragraphTimeline[1].durationMs / syncState.totalDurationMs;

      // Scale to different duration
      syncState.rebuildTimelineWithDuration(15000);

      // Proportions should be approximately the same (allow for floating point)
      const new0 = syncState.paragraphTimeline[0].durationMs / syncState.totalDurationMs;
      const new1 = syncState.paragraphTimeline[1].durationMs / syncState.totalDurationMs;

      expect(new0).toBeCloseTo(original0, 2);
      expect(new1).toBeCloseTo(original1, 2);
    });

    it('should set isTimelineAccurate to true after rebuild', () => {
      expect(syncState._isTimelineAccurate).toBe(false);

      syncState.rebuildTimelineWithDuration(10000);

      expect(syncState._isTimelineAccurate).toBe(true);
    });

    it('should handle empty timeline gracefully', () => {
      syncState.reset();
      expect(() => syncState.rebuildTimelineWithDuration(10000)).not.toThrow();
    });

    it('should handle zero original duration gracefully', () => {
      syncState._totalDurationMs = 0;
      expect(() => syncState.rebuildTimelineWithDuration(10000)).not.toThrow();
    });
  });

  // T017: Unit test for paragraph callback behavior
  // NOTE: VoxPage plays paragraphs one at a time (discrete audio), so the sync loop
  // does NOT fire onParagraphChange. Paragraph highlighting is handled directly
  // by playCurrentParagraph() in background.js.
  describe('Initial Paragraph Callback (T017)', () => {
    let paragraphChangeCallback;

    beforeEach(() => {
      paragraphChangeCallback = jest.fn();
      syncState.onParagraphChange(paragraphChangeCallback);
      syncState.buildParagraphTimeline(['First', 'Second', 'Third'], 3000);
    });

    it('should NOT fire onParagraphChange on start() - paragraphs are highlighted directly', () => {
      syncState.start();

      // Sync loop does NOT fire paragraph change - that's handled by playCurrentParagraph()
      expect(paragraphChangeCallback).toHaveBeenCalledTimes(0);

      syncState.stop();
    });

    it('should not fire callback on multiple starts', () => {
      syncState.start();
      syncState.stop();
      syncState.start(); // Start again without reset

      // Should still be 0 calls - sync loop doesn't handle paragraph changes
      expect(paragraphChangeCallback).toHaveBeenCalledTimes(0);

      syncState.stop();
    });

    it('should not fire callback after reset', () => {
      syncState.start();
      syncState.stop();
      syncState.reset();
      syncState.buildParagraphTimeline(['A', 'B'], 2000);
      syncState.onParagraphChange(paragraphChangeCallback);
      syncState.start();

      // Should still be 0 calls - sync loop doesn't handle paragraph changes
      expect(paragraphChangeCallback).toHaveBeenCalledTimes(0);

      syncState.stop();
    });

    it('should not fire callback if no timeline', () => {
      syncState.reset();
      syncState.onParagraphChange(paragraphChangeCallback);
      paragraphChangeCallback.mockClear();

      syncState.start();

      expect(paragraphChangeCallback).not.toHaveBeenCalled();

      syncState.stop();
    });

    it('should not fire callback if no onParagraphChange set', () => {
      syncState.reset();
      syncState.buildParagraphTimeline(['A'], 1000);
      // Don't set callback

      expect(() => syncState.start()).not.toThrow();

      syncState.stop();
    });
  });

  // T018: Unit test for timeline gap closure
  describe('Timeline Gap Closure (T018)', () => {
    beforeEach(() => {
      syncState.buildParagraphTimeline(['One', 'Two', 'Three'], 9000);
    });

    it('should close gaps between paragraphs', () => {
      // After rebuild, each paragraph.endTimeMs should equal next.startTimeMs
      syncState.rebuildTimelineWithDuration(9000);

      for (let i = 0; i < syncState.paragraphTimeline.length - 1; i++) {
        const current = syncState.paragraphTimeline[i];
        const next = syncState.paragraphTimeline[i + 1];
        expect(current.endTimeMs).toBe(next.startTimeMs);
      }
    });

    it('should extend last paragraph to actual duration', () => {
      const actualDuration = 12000;
      syncState.rebuildTimelineWithDuration(actualDuration);

      const lastParagraph = syncState.paragraphTimeline[syncState.paragraphTimeline.length - 1];
      expect(lastParagraph.endTimeMs).toBe(actualDuration);
    });

    it('should update durations to match gap-closed times', () => {
      syncState.rebuildTimelineWithDuration(9000);

      for (const timing of syncState.paragraphTimeline) {
        expect(timing.durationMs).toBe(timing.endTimeMs - timing.startTimeMs);
      }
    });

    it('should maintain continuous timeline from 0 to total', () => {
      syncState.rebuildTimelineWithDuration(15000);

      expect(syncState.paragraphTimeline[0].startTimeMs).toBe(0);
      expect(syncState.paragraphTimeline[syncState.paragraphTimeline.length - 1].endTimeMs).toBe(15000);
    });
  });
});
