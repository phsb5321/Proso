/**
 * Timer Sync Test Utilities
 *
 * Provides mock audio elements and helpers for testing footer timer sync.
 *
 * @module tests/fixtures/timer-helpers
 */

import { jest } from '@jest/globals';

/**
 * Mock audio element with controllable currentTime
 */
export interface MockAudioElement {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  ended: boolean;

  // Event handlers
  ontimeupdate: ((this: HTMLAudioElement, ev: Event) => void) | null;
  onended: ((this: HTMLAudioElement, ev: Event) => void) | null;
  onplay: ((this: HTMLAudioElement, ev: Event) => void) | null;
  onpause: ((this: HTMLAudioElement, ev: Event) => void) | null;
  onerror: ((this: HTMLAudioElement, ev: ErrorEvent) => void) | null;

  // Methods
  play: jest.Mock;
  pause: jest.Mock;
  load: jest.Mock;

  // Test utilities
  _emitTimeUpdate: () => void;
  _emitEnded: () => void;
  _emitPlay: () => void;
  _emitPause: () => void;
  _setCurrentTime: (time: number) => void;
  _advanceTime: (seconds: number) => void;
}

/**
 * Create a mock audio element for testing
 */
export function createMockAudioElement(options?: {
  duration?: number;
  currentTime?: number;
  paused?: boolean;
  playbackRate?: number;
}): MockAudioElement {
  const mockAudio: MockAudioElement = {
    currentTime: options?.currentTime ?? 0,
    duration: options?.duration ?? 60,
    paused: options?.paused ?? true,
    playbackRate: options?.playbackRate ?? 1,
    volume: 1,
    muted: false,
    ended: false,

    ontimeupdate: null,
    onended: null,
    onplay: null,
    onpause: null,
    onerror: null,

    play: jest.fn(() => {
      mockAudio.paused = false;
      mockAudio._emitPlay();
      return Promise.resolve();
    }),
    pause: jest.fn(() => {
      mockAudio.paused = true;
      mockAudio._emitPause();
    }),
    load: jest.fn(),

    _emitTimeUpdate() {
      if (mockAudio.ontimeupdate) {
        mockAudio.ontimeupdate.call(
          mockAudio as unknown as HTMLAudioElement,
          new Event('timeupdate')
        );
      }
    },

    _emitEnded() {
      mockAudio.ended = true;
      mockAudio.paused = true;
      if (mockAudio.onended) {
        mockAudio.onended.call(mockAudio as unknown as HTMLAudioElement, new Event('ended'));
      }
    },

    _emitPlay() {
      if (mockAudio.onplay) {
        mockAudio.onplay.call(mockAudio as unknown as HTMLAudioElement, new Event('play'));
      }
    },

    _emitPause() {
      if (mockAudio.onpause) {
        mockAudio.onpause.call(mockAudio as unknown as HTMLAudioElement, new Event('pause'));
      }
    },

    _setCurrentTime(time: number) {
      mockAudio.currentTime = Math.max(0, Math.min(time, mockAudio.duration));
      mockAudio._emitTimeUpdate();
    },

    _advanceTime(seconds: number) {
      const newTime = mockAudio.currentTime + seconds * mockAudio.playbackRate;
      if (newTime >= mockAudio.duration) {
        mockAudio.currentTime = mockAudio.duration;
        mockAudio._emitTimeUpdate();
        mockAudio._emitEnded();
      } else {
        mockAudio.currentTime = newTime;
        mockAudio._emitTimeUpdate();
      }
    },
  };

  return mockAudio;
}

/**
 * Simulate timeupdate events at regular intervals
 */
export function createTimeupdateSimulator(
  mockAudio: MockAudioElement,
  options?: {
    intervalMs?: number;
    advancePerTick?: number;
  }
) {
  const intervalMs = options?.intervalMs ?? 250; // ~4 times per second (browser standard)
  const advancePerTick = options?.advancePerTick ?? intervalMs / 1000;
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (!mockAudio.paused && !mockAudio.ended) {
          mockAudio._advanceTime(advancePerTick);
        }
      }, intervalMs);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    tick() {
      if (!mockAudio.paused && !mockAudio.ended) {
        mockAudio._advanceTime(advancePerTick);
      }
    },

    tickTo(targetTime: number) {
      while (mockAudio.currentTime < targetTime && !mockAudio.ended) {
        mockAudio._advanceTime(advancePerTick);
      }
    },
  };
}

/**
 * Footer state update payload for testing
 */
export interface FooterStateUpdatePayload {
  isPlaying: boolean;
  currentTime: string;
  totalTime: string;
  progress: number;
  currentParagraph: number;
  totalParagraphs: number;
}

/**
 * Assert footer state matches expected values
 */
export function assertFooterState(
  actual: FooterStateUpdatePayload,
  expected: Partial<FooterStateUpdatePayload>
) {
  if (expected.isPlaying !== undefined) {
    expect(actual.isPlaying).toBe(expected.isPlaying);
  }
  if (expected.currentTime !== undefined) {
    expect(actual.currentTime).toBe(expected.currentTime);
  }
  if (expected.totalTime !== undefined) {
    expect(actual.totalTime).toBe(expected.totalTime);
  }
  if (expected.progress !== undefined) {
    expect(actual.progress).toBeCloseTo(expected.progress, 1);
  }
  if (expected.currentParagraph !== undefined) {
    expect(actual.currentParagraph).toBe(expected.currentParagraph);
  }
  if (expected.totalParagraphs !== undefined) {
    expect(actual.totalParagraphs).toBe(expected.totalParagraphs);
  }
}

/**
 * Assert timer is within acceptable drift threshold
 */
export function assertTimerWithinDrift(
  displayedSeconds: number,
  actualSeconds: number,
  maxDriftMs: number = 500
) {
  const driftMs = Math.abs(displayedSeconds - actualSeconds) * 1000;
  expect(driftMs).toBeLessThanOrEqual(maxDriftMs);
}

/**
 * Format seconds to M:SS string (matches production formatTime)
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse M:SS string back to seconds
 */
export function parseTime(timeStr: string): number {
  const match = timeStr.match(/^(\d+):(\d{2})$/);
  if (!match) {
    return 0;
  }
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  return mins * 60 + secs;
}

/**
 * Create a mock message sender for testing footer state updates
 */
export function createFooterStateMessageCapture() {
  const messages: FooterStateUpdatePayload[] = [];

  const capture = jest.fn((payload: FooterStateUpdatePayload) => {
    messages.push({ ...payload });
  });

  return {
    capture,
    messages,
    lastMessage: () => messages[messages.length - 1],
    reset: () => {
      messages.length = 0;
      capture.mockClear();
    },
  };
}
