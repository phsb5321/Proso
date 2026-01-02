/**
 * Unit tests for highlight synchronization
 * Tests drift detection threshold and resync timing
 * Feature: 011-highlight-playback-fix
 */

import { PlaybackSyncState } from '../../background/playback-sync.js';

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
