/**
 * Unit tests for highlight synchronization
 * Tests drift detection threshold and resync timing
 * Feature: 011-highlight-playback-fix
 */

import { PlaybackSyncState } from '../../src/utils/audio/playback-sync';

describe('Highlight Sync - Drift Detection (T009)', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
    // Build a sample timeline
    syncState.buildParagraphTimeline(['Para 1', 'Para 2', 'Para 3'], 9000);
  });

  afterEach(() => {
    syncState.reset();
  });

  test('should detect drift when threshold exceeded (200ms)', () => {
    // Set drift threshold
    syncState._driftThresholdMs = 200;

    // Simulate drift of 250ms (exceeds threshold)
    syncState._driftMs = 250;

    expect(syncState.isDrifting).toBe(true);
    expect(Math.abs(syncState.driftMs)).toBeGreaterThan(200);
  });

  test('should not detect drift when under threshold', () => {
    syncState._driftThresholdMs = 200;

    // Simulate drift of 150ms (under threshold)
    syncState._driftMs = 150;

    expect(syncState.isDrifting).toBe(false);
  });

  test('should detect negative drift (highlight behind audio)', () => {
    syncState._driftThresholdMs = 200;

    // Simulate negative drift of -250ms
    syncState._driftMs = -250;

    expect(syncState.isDrifting).toBe(true);
  });

  test('should reset drift on seekTo', () => {
    syncState._driftMs = 300;
    expect(syncState.isDrifting).toBe(true);

    syncState.seekTo(5000);

    expect(syncState._driftMs).toBe(0);
    expect(syncState.isDrifting).toBe(false);
  });

  test('should reset drift on reset()', () => {
    syncState._driftMs = 300;

    syncState.reset();

    expect(syncState._driftMs).toBe(0);
  });
});

describe('Highlight Sync - Resync Timing (T010)', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
    // Build timeline with word timing
    syncState.buildParagraphTimeline(['Word one two three four five'], 5000);
    syncState.setWordTimeline([
      { word: 'Word', startTimeMs: 0, endTimeMs: 500, charOffset: 0, charLength: 4 },
      { word: 'one', startTimeMs: 500, endTimeMs: 1000, charOffset: 5, charLength: 3 },
      { word: 'two', startTimeMs: 1000, endTimeMs: 1500, charOffset: 9, charLength: 3 },
      { word: 'three', startTimeMs: 1500, endTimeMs: 2500, charOffset: 13, charLength: 5 },
      { word: 'four', startTimeMs: 2500, endTimeMs: 3500, charOffset: 19, charLength: 4 },
      { word: 'five', startTimeMs: 3500, endTimeMs: 5000, charOffset: 24, charLength: 4 }
    ]);
  });

  afterEach(() => {
    syncState.reset();
  });

  test('should find word using binary search (O(log n))', () => {
    // Test binary search at various times
    expect(syncState._binarySearchWord(250)).toBe(0);  // 'Word'
    expect(syncState._binarySearchWord(750)).toBe(1);  // 'one'
    expect(syncState._binarySearchWord(1250)).toBe(2); // 'two'
    expect(syncState._binarySearchWord(2000)).toBe(3); // 'three'
    expect(syncState._binarySearchWord(3000)).toBe(4); // 'four'
    expect(syncState._binarySearchWord(4000)).toBe(5); // 'five'
  });

  test('should handle time between words', () => {
    // Time exactly at word boundary
    expect(syncState._binarySearchWord(500)).toBe(1); // Start of 'one'
    expect(syncState._binarySearchWord(1000)).toBe(2); // Start of 'two'
  });

  test('should handle time before first word', () => {
    // Before any words start - should return first word
    const result = syncState._binarySearchWord(-100);
    expect(result).toBe(0);
  });

  test('should handle time after last word', () => {
    // After all words end - should return last word
    const result = syncState._binarySearchWord(10000);
    expect(result).toBe(5);
  });

  test('should return -1 for empty word timeline', () => {
    syncState.clearWordTimeline();
    expect(syncState._binarySearchWord(1000)).toBe(-1);
  });

  test('seekTo should update currentTimeMs immediately', () => {
    const startTime = performance.now();

    syncState.seekTo(2500);

    const elapsed = performance.now() - startTime;

    expect(syncState.currentTimeMs).toBe(2500);
    expect(elapsed).toBeLessThan(50); // Should complete within 50ms
  });

  test('syncToParagraph should find correct paragraph', () => {
    // Build multi-paragraph timeline
    syncState.buildParagraphTimeline(['P1', 'P2', 'P3'], 9000);

    syncState._currentTimeMs = 4000; // Middle of timeline
    syncState.syncToParagraph();

    expect(syncState.currentParagraphIndex).toBe(1); // Second paragraph
  });
});

// =========================================================================
// US1: Paragraph Transition Race Condition Fix (021-comprehensive-overhaul)
// =========================================================================

describe('Highlight Sync - Timeline Ready Acknowledgment (T011)', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
  });

  afterEach(() => {
    syncState.reset();
  });

  test('timelineReady should be true by default', () => {
    expect(syncState.timelineReady).toBe(true);
  });

  test('setTimelinePending should set timelineReady to false', () => {
    syncState.setTimelinePending(1);

    expect(syncState.timelineReady).toBe(false);
    expect(syncState._pendingTimelineParagraph).toBe(1);
  });

  test('setTimelineReady should set timelineReady to true for correct paragraph', () => {
    syncState.setTimelinePending(2);
    expect(syncState.timelineReady).toBe(false);

    syncState.setTimelineReady(2);

    expect(syncState.timelineReady).toBe(true);
    expect(syncState._pendingTimelineParagraph).toBe(-1);
  });

  test('setTimelineReady should ignore wrong paragraph index', () => {
    syncState.setTimelinePending(2);

    syncState.setTimelineReady(1); // Wrong paragraph

    expect(syncState.timelineReady).toBe(false);
    expect(syncState._pendingTimelineParagraph).toBe(2);
  });

  test('setTimelineReady should accept any paragraph when none pending', () => {
    expect(syncState._pendingTimelineParagraph).toBe(-1);

    syncState.setTimelineReady(5);

    expect(syncState.timelineReady).toBe(true);
  });
});

describe('Highlight Sync - Sync Loop Waits for Timeline Ready (T012)', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
    syncState.buildParagraphTimeline(['Para 1', 'Para 2'], 6000);
    syncState.setWordTimeline([
      { word: 'Hello', startTimeMs: 0, endTimeMs: 500 },
      { word: 'world', startTimeMs: 500, endTimeMs: 1000 }
    ]);
  });

  afterEach(() => {
    syncState.reset();
  });

  test('hasWordTiming should be true when timeline is set', () => {
    expect(syncState.hasWordTiming).toBe(true);
  });

  test('sync should be skipped when timelineReady is false', () => {
    syncState.setTimelinePending(1);

    // Simulate sync loop check
    const shouldSync = syncState.hasWordTiming && syncState.timelineReady;

    expect(shouldSync).toBe(false);
  });

  test('sync should proceed when timelineReady is true', () => {
    // Timeline ready (default state)
    const shouldSync = syncState.hasWordTiming && syncState.timelineReady;

    expect(shouldSync).toBe(true);
  });

  test('sync should proceed after TIMELINE_READY received', () => {
    // Pending
    syncState.setTimelinePending(1);
    expect(syncState.hasWordTiming && syncState.timelineReady).toBe(false);

    // ACK received
    syncState.setTimelineReady(1);
    expect(syncState.hasWordTiming && syncState.timelineReady).toBe(true);
  });

  test('reset should restore timelineReady to true', () => {
    syncState.setTimelinePending(1);
    expect(syncState.timelineReady).toBe(false);

    syncState.reset();

    expect(syncState.timelineReady).toBe(true);
  });
});

describe('Highlight Sync - Paragraph Transition (T010)', () => {
  let syncState;

  beforeEach(() => {
    syncState = new PlaybackSyncState();
    syncState.buildParagraphTimeline(['Para 1', 'Para 2', 'Para 3'], 9000);
  });

  afterEach(() => {
    syncState.reset();
  });

  test('word highlighting should work after paragraph 0 completes', () => {
    // 1. Setup paragraph 0
    syncState.setWordTimeline([
      { word: 'First', startTimeMs: 0, endTimeMs: 500 }
    ]);
    expect(syncState.hasWordTiming).toBe(true);

    // 2. Clear word timeline (paragraph 0 ends)
    syncState.clearWordTimeline();
    expect(syncState.hasWordTiming).toBe(false);

    // 3. Setup paragraph 1
    syncState.setTimelinePending(1);
    syncState.setWordTimeline([
      { word: 'Second', startTimeMs: 0, endTimeMs: 500 }
    ]);
    syncState.setTimelineReady(1);

    // 4. Word highlighting should work
    expect(syncState.hasWordTiming).toBe(true);
    expect(syncState.timelineReady).toBe(true);

    const wordIndex = syncState._binarySearchWord(250);
    expect(wordIndex).toBe(0);
  });

  test('complete paragraph 0 -> 1 -> 2 transition', () => {
    // Paragraph 0
    syncState.setWordTimeline([{ word: 'P0', startTimeMs: 0, endTimeMs: 1000 }]);
    expect(syncState._binarySearchWord(500)).toBe(0);

    // Transition to paragraph 1
    syncState.clearWordTimeline();
    syncState.setTimelinePending(1);
    syncState.setWordTimeline([{ word: 'P1', startTimeMs: 0, endTimeMs: 1000 }]);
    syncState.setTimelineReady(1);
    expect(syncState._binarySearchWord(500)).toBe(0);

    // Transition to paragraph 2
    syncState.clearWordTimeline();
    syncState.setTimelinePending(2);
    syncState.setWordTimeline([{ word: 'P2', startTimeMs: 0, endTimeMs: 1000 }]);
    syncState.setTimelineReady(2);
    expect(syncState._binarySearchWord(500)).toBe(0);
    expect(syncState.timelineReady).toBe(true);
  });
});
