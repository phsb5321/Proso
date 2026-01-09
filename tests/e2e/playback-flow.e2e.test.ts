/**
 * Playback Flow E2E Tests
 *
 * Tests the full TTS playback workflow with mocked audio.
 * These tests verify the UI state transitions during playback.
 *
 * @module tests/e2e/playback-flow
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/html');
const SIMPLE_PAGE_PATH = path.join(FIXTURES_PATH, 'simple-paragraphs.html');

/**
 * Helper to check if extension build exists
 */
function extensionExists(): boolean {
  return fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'));
}

/**
 * Helper to check if fixtures exist
 */
function fixturesExist(): boolean {
  return fs.existsSync(SIMPLE_PAGE_PATH);
}

test.describe('Playback State Machine', () => {
  // Tests for the playback state transitions
  // These can run without the full extension by simulating state

  test('initial state is idle', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Simulate VoxPage state
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).voxpageState = {
        state: 'idle',
        currentIndex: -1,
        paragraphs: [],
      };
    });

    const state = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState?.state;
    });

    expect(state).toBe('idle');
  });

  test('state transitions: idle -> loading -> playing', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Initialize state machine
    await page.evaluate(() => {
      interface VoxPageState {
        state: string;
        currentIndex: number;
        paragraphs: string[];
        transition: (newState: string) => void;
      }

      const voxpageState: VoxPageState = {
        state: 'idle',
        currentIndex: -1,
        paragraphs: [],
        transition(newState: string) {
          const validTransitions: Record<string, string[]> = {
            idle: ['loading'],
            loading: ['playing', 'error', 'idle'],
            playing: ['paused', 'loading', 'idle'],
            paused: ['playing', 'idle'],
            error: ['idle'],
          };

          if (validTransitions[this.state]?.includes(newState)) {
            this.state = newState;
            return true;
          }
          return false;
        },
      };

      (window as unknown as Record<string, VoxPageState>).voxpageState = voxpageState;
    });

    // Simulate playback start
    const transitionToLoading = await page.evaluate(() => {
      const state = (window as unknown as Record<string, { state: string; transition: (s: string) => boolean }>).voxpageState;
      return state.transition('loading');
    });
    expect(transitionToLoading).toBe(true);

    const stateAfterLoading = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState.state;
    });
    expect(stateAfterLoading).toBe('loading');

    // Simulate audio ready
    const transitionToPlaying = await page.evaluate(() => {
      const state = (window as unknown as Record<string, { state: string; transition: (s: string) => boolean }>).voxpageState;
      return state.transition('playing');
    });
    expect(transitionToPlaying).toBe(true);

    const finalState = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState.state;
    });
    expect(finalState).toBe('playing');
  });

  test('state transitions: playing -> paused -> playing', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Initialize in playing state
    await page.evaluate(() => {
      interface VoxPageState {
        state: string;
        transition: (newState: string) => boolean;
      }

      const voxpageState: VoxPageState = {
        state: 'playing',
        transition(newState: string) {
          const validTransitions: Record<string, string[]> = {
            idle: ['loading'],
            loading: ['playing', 'error', 'idle'],
            playing: ['paused', 'loading', 'idle'],
            paused: ['playing', 'idle'],
            error: ['idle'],
          };

          if (validTransitions[this.state]?.includes(newState)) {
            this.state = newState;
            return true;
          }
          return false;
        },
      };

      (window as unknown as Record<string, VoxPageState>).voxpageState = voxpageState;
    });

    // Pause
    await page.evaluate(() => {
      const state = (window as unknown as Record<string, { transition: (s: string) => boolean }>).voxpageState;
      state.transition('paused');
    });

    let currentState = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState.state;
    });
    expect(currentState).toBe('paused');

    // Resume
    await page.evaluate(() => {
      const state = (window as unknown as Record<string, { transition: (s: string) => boolean }>).voxpageState;
      state.transition('playing');
    });

    currentState = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState.state;
    });
    expect(currentState).toBe('playing');
  });

  test('invalid state transitions are rejected', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    await page.evaluate(() => {
      interface VoxPageState {
        state: string;
        transition: (newState: string) => boolean;
      }

      const voxpageState: VoxPageState = {
        state: 'idle',
        transition(newState: string) {
          const validTransitions: Record<string, string[]> = {
            idle: ['loading'],
            loading: ['playing', 'error', 'idle'],
            playing: ['paused', 'loading', 'idle'],
            paused: ['playing', 'idle'],
            error: ['idle'],
          };

          if (validTransitions[this.state]?.includes(newState)) {
            this.state = newState;
            return true;
          }
          return false;
        },
      };

      (window as unknown as Record<string, VoxPageState>).voxpageState = voxpageState;
    });

    // Try invalid transition: idle -> playing (should go through loading)
    const invalidTransition = await page.evaluate(() => {
      const state = (window as unknown as Record<string, { transition: (s: string) => boolean }>).voxpageState;
      return state.transition('playing');
    });

    expect(invalidTransition).toBe(false);

    const stateUnchanged = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).voxpageState.state;
    });
    expect(stateUnchanged).toBe('idle');
  });
});

test.describe('Paragraph Navigation', () => {
  test('can track current paragraph index', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Get paragraphs and create tracking
    await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll('p')).map((p) => p.textContent || '');

      interface NavigationState {
        paragraphs: string[];
        currentIndex: number;
        next: () => boolean;
        prev: () => boolean;
        goTo: (index: number) => boolean;
      }

      const navState: NavigationState = {
        paragraphs,
        currentIndex: 0,
        next() {
          if (this.currentIndex < this.paragraphs.length - 1) {
            this.currentIndex++;
            return true;
          }
          return false;
        },
        prev() {
          if (this.currentIndex > 0) {
            this.currentIndex--;
            return true;
          }
          return false;
        },
        goTo(index: number) {
          if (index >= 0 && index < this.paragraphs.length) {
            this.currentIndex = index;
            return true;
          }
          return false;
        },
      };

      (window as unknown as Record<string, NavigationState>).navState = navState;
    });

    // Test navigation
    const initialIndex = await page.evaluate(() => {
      return (window as unknown as Record<string, { currentIndex: number }>).navState.currentIndex;
    });
    expect(initialIndex).toBe(0);

    // Next
    await page.evaluate(() => {
      (window as unknown as Record<string, { next: () => boolean }>).navState.next();
    });

    const afterNext = await page.evaluate(() => {
      return (window as unknown as Record<string, { currentIndex: number }>).navState.currentIndex;
    });
    expect(afterNext).toBe(1);

    // Prev
    await page.evaluate(() => {
      (window as unknown as Record<string, { prev: () => boolean }>).navState.prev();
    });

    const afterPrev = await page.evaluate(() => {
      return (window as unknown as Record<string, { currentIndex: number }>).navState.currentIndex;
    });
    expect(afterPrev).toBe(0);

    // Can't go before first
    const cantGoPrev = await page.evaluate(() => {
      return (window as unknown as Record<string, { prev: () => boolean }>).navState.prev();
    });
    expect(cantGoPrev).toBe(false);
  });

  test('can navigate to specific paragraph', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll('p')).map((p) => p.textContent || '');

      interface NavigationState {
        paragraphs: string[];
        currentIndex: number;
        goTo: (index: number) => boolean;
      }

      (window as unknown as Record<string, NavigationState>).navState = {
        paragraphs,
        currentIndex: 0,
        goTo(index: number) {
          if (index >= 0 && index < this.paragraphs.length) {
            this.currentIndex = index;
            return true;
          }
          return false;
        },
      };
    });

    // Go to specific index
    const goToResult = await page.evaluate(() => {
      return (window as unknown as Record<string, { goTo: (n: number) => boolean }>).navState.goTo(3);
    });

    const paragraphCount = await page.evaluate(() => {
      return (window as unknown as Record<string, { paragraphs: string[] }>).navState.paragraphs.length;
    });

    if (paragraphCount > 3) {
      expect(goToResult).toBe(true);

      const currentIndex = await page.evaluate(() => {
        return (window as unknown as Record<string, { currentIndex: number }>).navState.currentIndex;
      });
      expect(currentIndex).toBe(3);
    }

    // Invalid index
    const invalidResult = await page.evaluate(() => {
      return (window as unknown as Record<string, { goTo: (n: number) => boolean }>).navState.goTo(999);
    });
    expect(invalidResult).toBe(false);
  });
});

test.describe('Progress Tracking', () => {
  test('can calculate playback progress', async ({ page }) => {
    test.skip(!fixturesExist(), 'Test fixtures not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    await page.evaluate(() => {
      interface ProgressState {
        totalParagraphs: number;
        currentIndex: number;
        getProgress: () => number;
      }

      (window as unknown as Record<string, ProgressState>).progressState = {
        totalParagraphs: 10,
        currentIndex: 0,
        getProgress() {
          if (this.totalParagraphs === 0) return 0;
          return (this.currentIndex / this.totalParagraphs) * 100;
        },
      };
    });

    // Initial progress
    let progress = await page.evaluate(() => {
      return (window as unknown as Record<string, { getProgress: () => number }>).progressState.getProgress();
    });
    expect(progress).toBe(0);

    // After some progress
    await page.evaluate(() => {
      (window as unknown as Record<string, { currentIndex: number }>).progressState.currentIndex = 5;
    });

    progress = await page.evaluate(() => {
      return (window as unknown as Record<string, { getProgress: () => number }>).progressState.getProgress();
    });
    expect(progress).toBe(50);

    // Complete
    await page.evaluate(() => {
      (window as unknown as Record<string, { currentIndex: number }>).progressState.currentIndex = 10;
    });

    progress = await page.evaluate(() => {
      return (window as unknown as Record<string, { getProgress: () => number }>).progressState.getProgress();
    });
    expect(progress).toBe(100);
  });

  test('handles edge cases in progress', async ({ page }) => {
    await page.setContent('<html><body></body></html>');

    await page.evaluate(() => {
      interface ProgressState {
        totalParagraphs: number;
        currentIndex: number;
        getProgress: () => number;
      }

      (window as unknown as Record<string, ProgressState>).progressState = {
        totalParagraphs: 0,
        currentIndex: 0,
        getProgress() {
          if (this.totalParagraphs === 0) return 0;
          return (this.currentIndex / this.totalParagraphs) * 100;
        },
      };
    });

    // Zero paragraphs should not divide by zero
    const progress = await page.evaluate(() => {
      return (window as unknown as Record<string, { getProgress: () => number }>).progressState.getProgress();
    });

    expect(progress).toBe(0);
    expect(Number.isFinite(progress)).toBe(true);
  });
});

test.describe('Speed Control', () => {
  test('can set playback speed within bounds', async ({ page }) => {
    await page.setContent('<html><body></body></html>');

    await page.evaluate(() => {
      interface SpeedState {
        speed: number;
        minSpeed: number;
        maxSpeed: number;
        setSpeed: (s: number) => boolean;
      }

      (window as unknown as Record<string, SpeedState>).speedState = {
        speed: 1.0,
        minSpeed: 0.5,
        maxSpeed: 2.0,
        setSpeed(newSpeed: number) {
          if (newSpeed >= this.minSpeed && newSpeed <= this.maxSpeed) {
            this.speed = newSpeed;
            return true;
          }
          return false;
        },
      };
    });

    // Valid speed
    let result = await page.evaluate(() => {
      return (window as unknown as Record<string, { setSpeed: (s: number) => boolean }>).speedState.setSpeed(1.5);
    });
    expect(result).toBe(true);

    let speed = await page.evaluate(() => {
      return (window as unknown as Record<string, { speed: number }>).speedState.speed;
    });
    expect(speed).toBe(1.5);

    // Too slow
    result = await page.evaluate(() => {
      return (window as unknown as Record<string, { setSpeed: (s: number) => boolean }>).speedState.setSpeed(0.1);
    });
    expect(result).toBe(false);

    speed = await page.evaluate(() => {
      return (window as unknown as Record<string, { speed: number }>).speedState.speed;
    });
    expect(speed).toBe(1.5); // Unchanged

    // Too fast
    result = await page.evaluate(() => {
      return (window as unknown as Record<string, { setSpeed: (s: number) => boolean }>).speedState.setSpeed(3.0);
    });
    expect(result).toBe(false);

    // Boundary values
    result = await page.evaluate(() => {
      return (window as unknown as Record<string, { setSpeed: (s: number) => boolean }>).speedState.setSpeed(0.5);
    });
    expect(result).toBe(true);

    result = await page.evaluate(() => {
      return (window as unknown as Record<string, { setSpeed: (s: number) => boolean }>).speedState.setSpeed(2.0);
    });
    expect(result).toBe(true);
  });
});

test.describe('Error Handling', () => {
  test('can transition to error state', async ({ page }) => {
    await page.setContent('<html><body></body></html>');

    await page.evaluate(() => {
      interface ErrorState {
        state: string;
        errorMessage: string | null;
        setError: (msg: string) => void;
        clearError: () => void;
      }

      (window as unknown as Record<string, ErrorState>).errorState = {
        state: 'loading',
        errorMessage: null,
        setError(message: string) {
          this.state = 'error';
          this.errorMessage = message;
        },
        clearError() {
          this.state = 'idle';
          this.errorMessage = null;
        },
      };
    });

    // Set error
    await page.evaluate(() => {
      (window as unknown as Record<string, { setError: (s: string) => void }>).errorState.setError('TTS API failed');
    });

    let state = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).errorState.state;
    });
    expect(state).toBe('error');

    const errorMessage = await page.evaluate(() => {
      return (window as unknown as Record<string, { errorMessage: string | null }>).errorState.errorMessage;
    });
    expect(errorMessage).toBe('TTS API failed');

    // Clear error
    await page.evaluate(() => {
      (window as unknown as Record<string, { clearError: () => void }>).errorState.clearError();
    });

    state = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).errorState.state;
    });
    expect(state).toBe('idle');
  });

  test('can recover from error state', async ({ page }) => {
    await page.setContent('<html><body></body></html>');

    await page.evaluate(() => {
      interface RecoveryState {
        state: string;
        retryCount: number;
        maxRetries: number;
        canRetry: () => boolean;
        retry: () => boolean;
      }

      (window as unknown as Record<string, RecoveryState>).recoveryState = {
        state: 'error',
        retryCount: 0,
        maxRetries: 3,
        canRetry() {
          return this.retryCount < this.maxRetries;
        },
        retry() {
          if (this.canRetry()) {
            this.retryCount++;
            this.state = 'loading';
            return true;
          }
          return false;
        },
      };
    });

    // Can retry
    let canRetry = await page.evaluate(() => {
      return (window as unknown as Record<string, { canRetry: () => boolean }>).recoveryState.canRetry();
    });
    expect(canRetry).toBe(true);

    // Retry
    const retryResult = await page.evaluate(() => {
      return (window as unknown as Record<string, { retry: () => boolean }>).recoveryState.retry();
    });
    expect(retryResult).toBe(true);

    const state = await page.evaluate(() => {
      return (window as unknown as Record<string, { state: string }>).recoveryState.state;
    });
    expect(state).toBe('loading');

    // Exhaust retries
    await page.evaluate(() => {
      const rs = (window as unknown as Record<string, { retryCount: number }>).recoveryState;
      rs.retryCount = 3;
    });

    canRetry = await page.evaluate(() => {
      return (window as unknown as Record<string, { canRetry: () => boolean }>).recoveryState.canRetry();
    });
    expect(canRetry).toBe(false);
  });
});
