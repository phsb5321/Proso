/**
 * Audio Playback Testing Fixture for Playwright E2E Tests
 *
 * Provides TTS API network interception and audio state assertion helpers.
 * Allows deterministic audio testing without external API calls.
 *
 * @see specs/038-browser-e2e-hardening/research.md
 *
 * FR-010: Test playback with deterministic audio fixtures
 * SC-003: Playback starts within 1500ms
 * SC-004: Cancellation completes within 200ms
 * SC-005: No stuck playback states after 10 cycles
 */

import { test as base, type Page, type Route, type Request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Audio fixture paths (relative to tests/fixtures/audio/)
const FIXTURES_DIR = path.join(__dirname, '../../../fixtures/audio');

/**
 * Standard audio fixtures with known durations
 */
export const AudioFixtures = {
  SHORT: 'short-speech.mp3', // 500ms
  MEDIUM: 'medium-speech.mp3', // 2000ms
  LONG: 'long-speech.mp3', // 5000ms
  SILENCE: 'silence.mp3', // 1000ms
  SILENT_1S: 'silent-1s.mp3', // 1000ms (legacy)
} as const;

/**
 * Expected durations for each fixture (in seconds)
 */
export const AudioDurations: Record<string, number> = {
  [AudioFixtures.SHORT]: 0.5,
  [AudioFixtures.MEDIUM]: 2.0,
  [AudioFixtures.LONG]: 5.0,
  [AudioFixtures.SILENCE]: 1.0,
  [AudioFixtures.SILENT_1S]: 1.0,
};

/**
 * TTS API endpoint patterns for network interception
 */
export const TTS_ENDPOINTS = {
  OPENAI: '**/v1/audio/speech',
  ELEVENLABS: '**/v1/text-to-speech/**',
  CARTESIA: '**/tts/bytes',
  GROQ: '**/v1/audio/speech', // Groq uses OpenAI-compatible API
} as const;

/**
 * Information about an intercepted TTS request
 */
export interface InterceptedTTSRequest {
  provider: string;
  url: string;
  timestamp: number;
  responseFixture: string;
}

/**
 * Audio fixture state for tracking interceptions
 */
export interface AudioFixtureState {
  /** All intercepted TTS requests */
  interceptedRequests: InterceptedTTSRequest[];
  /** Whether interception is active */
  isActive: boolean;
  /** Default fixture to use for responses */
  defaultFixture: string;
  /** Warnings about unmatched routes */
  warnings: string[];
}

/**
 * Get the full path to an audio fixture file
 */
export function getFixturePath(fixtureName: string): string {
  const fullPath = path.join(FIXTURES_DIR, fixtureName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Audio fixture not found: ${fullPath}`);
  }
  return fullPath;
}

/**
 * Set up TTS API network interception on a page
 * Intercepts requests to TTS APIs and returns audio fixture instead
 */
export async function setupTTSInterception(
  page: Page,
  state: AudioFixtureState,
  options: {
    fixture?: string;
    /** If true, abort requests instead of fulfilling with fixture */
    abortRequests?: boolean;
  } = {}
): Promise<void> {
  const { fixture = AudioFixtures.MEDIUM, abortRequests = false } = options;
  state.defaultFixture = fixture;
  state.isActive = true;

  const fixturePath = getFixturePath(fixture);

  // Handler function for intercepted requests
  const handleTTSRequest = async (route: Route, request: Request, provider: string) => {
    const interceptedRequest: InterceptedTTSRequest = {
      provider,
      url: request.url(),
      timestamp: Date.now(),
      responseFixture: fixture,
    };
    state.interceptedRequests.push(interceptedRequest);

    if (abortRequests) {
      await route.abort('connectionfailed');
      return;
    }

    // Fulfill with audio fixture
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      path: fixturePath,
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Test-Fixture': fixture,
      },
    });
  };

  // Set up route handlers for each provider
  await page.route(TTS_ENDPOINTS.OPENAI, (route, request) =>
    handleTTSRequest(route, request, 'OpenAI')
  );

  await page.route(TTS_ENDPOINTS.ELEVENLABS, (route, request) =>
    handleTTSRequest(route, request, 'ElevenLabs')
  );

  await page.route(TTS_ENDPOINTS.CARTESIA, (route, request) =>
    handleTTSRequest(route, request, 'Cartesia')
  );
}

/**
 * Remove TTS interception from a page
 */
export async function removeTTSInterception(page: Page, state: AudioFixtureState): Promise<void> {
  state.isActive = false;
  await page.unroute(TTS_ENDPOINTS.OPENAI);
  await page.unroute(TTS_ENDPOINTS.ELEVENLABS);
  await page.unroute(TTS_ENDPOINTS.CARTESIA);
}

/**
 * Wait for audio element to start playing
 * Returns true if playback started within timeout
 */
export async function waitForAudioPlaying(
  page: Page,
  timeout = 1500
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const audio = document.querySelector('audio');
        return audio && !audio.paused;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for audio element to stop playing (paused or ended)
 * Returns true if playback stopped within timeout
 */
export async function waitForAudioStopped(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const audio = document.querySelector('audio');
        return !audio || audio.paused || audio.ended;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for canplaythrough event on audio element
 * Indicates audio has buffered enough to play through
 */
export async function waitForCanPlayThrough(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.locator('audio').evaluate((audio: HTMLAudioElement) => {
      return new Promise<boolean>((resolve) => {
        if (audio.readyState >= 4) {
          resolve(true);
          return;
        }
        const handler = () => {
          audio.removeEventListener('canplaythrough', handler);
          resolve(true);
        };
        audio.addEventListener('canplaythrough', handler);
        setTimeout(() => {
          audio.removeEventListener('canplaythrough', handler);
          resolve(false);
        }, 5000);
      });
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for audio ended event
 */
export async function waitForAudioEnded(
  page: Page,
  timeout = 10000
): Promise<boolean> {
  try {
    await page.locator('audio').evaluate((audio: HTMLAudioElement) => {
      return new Promise<boolean>((resolve) => {
        if (audio.ended) {
          resolve(true);
          return;
        }
        const handler = () => {
          audio.removeEventListener('ended', handler);
          resolve(true);
        };
        audio.addEventListener('ended', handler);
      });
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current audio element state
 */
export async function getAudioState(page: Page): Promise<{
  exists: boolean;
  paused: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  readyState: number;
  error: string | null;
} | null> {
  try {
    return await page.evaluate(() => {
      const audio = document.querySelector('audio');
      if (!audio) {
        return {
          exists: false,
          paused: true,
          ended: false,
          currentTime: 0,
          duration: 0,
          readyState: 0,
          error: null,
        };
      }
      return {
        exists: true,
        paused: audio.paused,
        ended: audio.ended,
        currentTime: audio.currentTime,
        duration: audio.duration || 0,
        readyState: audio.readyState,
        error: audio.error ? audio.error.message : null,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Count audio elements on the page
 * Useful for detecting memory leaks (audio element accumulation)
 */
export async function countAudioElements(page: Page): Promise<number> {
  try {
    return await page.evaluate(() => document.querySelectorAll('audio').length);
  } catch {
    return 0;
  }
}

/**
 * Get performance memory info (Chromium only)
 */
export async function getMemoryInfo(page: Page): Promise<{
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
} | null> {
  try {
    return await page.evaluate(() => {
      const memory = (performance as any).memory;
      if (!memory) return null;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Extended test with audio fixtures
 */
export const testWithAudio = base.extend<{
  audioState: AudioFixtureState;
}>({
  audioState: async ({ page }, use) => {
    const state: AudioFixtureState = {
      interceptedRequests: [],
      isActive: false,
      defaultFixture: AudioFixtures.MEDIUM,
      warnings: [],
    };

    await setupTTSInterception(page, state);
    await use(state);
    await removeTTSInterception(page, state);

    // Log any warnings
    if (state.warnings.length > 0) {
      console.log('[Audio Fixture] Warnings:');
      for (const warning of state.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    // Log interception summary
    if (state.interceptedRequests.length > 0) {
      console.log(`[Audio Fixture] Intercepted ${state.interceptedRequests.length} TTS request(s)`);
    }
  },
});

// Re-export for convenience
export { expect } from '@playwright/test';
