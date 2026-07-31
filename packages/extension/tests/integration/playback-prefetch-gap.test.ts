/**
 * Playback Prefetch Gap Integration Test
 *
 * Falsifiable bound on NFR-001: once the lookahead prefetch pipeline (S3)
 * has had time to warm the buffer for the next paragraph, moving to that
 * paragraph must not re-pay the network round trip. Uses Jest fake timers
 * so the bound is measured deterministically against the fake clock instead
 * of wall time — "gap bounded" is proven by showing playback resolves
 * without the fake clock ever advancing, not by a wall-clock race.
 *
 * @module tests/integration/playback-prefetch-gap
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlaybackService } from '../../src/core/playback/playback-service';
import type { AudioError } from '../../src/core/shared/errors';
import { Ok } from '../../src/core/shared/result';
import type { Result } from '../../src/core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
} from '../../src/ports/audio-generator.port';
import { PlaybackQueue } from '../../src/utils/playback/playback-queue';
import { PrefetchService } from '../../src/utils/playback/prefetch';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../mocks';

const TAB_ID = 91;
const PAGE_URL = 'https://example.test/prefetch-gap';
const FIRST_PARAGRAPH = 'first paragraph text long enough to be real reading content';
const SECOND_PARAGRAPH = 'second paragraph that should already be buffered by the time it plays';

// Simulated per-call TTS network latency. Kept large relative to the batch
// interval below so "the buffer was actually warm" can't be confused with
// "the assertions happened to run before either timer fired" — a bound that
// could pass by luck would defeat the point of this test existing.
const GENERATE_DELAY_MS = 4_000;
const BATCH_INTERVAL_MS = 50;

/**
 * Deterministic fake IAudioGenerator whose generateAudio only resolves
 * after a (fake-clock) setTimeout. This is the single source of delay in
 * the whole test, shared by both the live playback path and the prefetch
 * path — both ultimately call `IAudioGenerator.generateAudio`.
 */
function createDelayedAudioGenerator(): {
  generator: IAudioGenerator;
  callCount: () => number;
} {
  let calls = 0;
  const generator: IAudioGenerator = {
    providerId: 'elevenlabs',
    supportsWordTiming: false,
    supportedLanguages: [],
    generateAudio: jest.fn(
      (_request: AudioRequest, _signal?: AbortSignal) =>
        new Promise<Result<AudioResponse, AudioError>>((resolve) => {
          calls++;
          setTimeout(() => {
            resolve(
              Ok({
                audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
                durationMs: 1_000,
                wordTimings: null,
              }),
            );
          }, GENERATE_DELAY_MS);
        }),
    ),
    getVoices: jest.fn(async () => Ok([])),
    validateCredentials: jest.fn(async () => true),
  };
  return { generator, callCount: () => calls };
}

/**
 * Flushes a bounded number of microtask ticks — no timer/macrotask is ever
 * advanced — and reports whether `promise` had settled by then. A promise
 * still blocked on a pending `setTimeout` (real or fake) cannot become
 * settled by this loop; only one whose remaining chain is pure microtasks
 * can. This is the falsifiable measurement the whole test rests on:
 * "gap bounded" means settled-by-here, "gap not bounded" means still
 * pending after 100 ticks (which is as good as "never", since nothing here
 * ever moves the fake clock).
 */
async function settlesWithoutAdvancingTimers(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  for (let i = 0; i < 100; i++) {
    await Promise.resolve();
  }
  return settled;
}

describe('playback prefetch gap (NFR-001)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays the next paragraph without re-paying network latency once prefetch has warmed the buffer', async () => {
    const { generator, callCount } = createDelayedAudioGenerator();
    const queue = new PlaybackQueue();
    const prefetch = new PrefetchService({
      maxBufferSize: 5,
      maxConcurrent: 2,
      batchIntervalMs: BATCH_INTERVAL_MS,
    });
    const service = new PlaybackService({
      audioGenerator: generator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [TAB_ID] }),
      settingsStore: createMockSettingsStore(),
      prefetch: { service: prefetch, queue },
    });
    prefetch.configure(
      queue,
      (text, index) => service.generatePrefetchAudio(text, index),
      (index) => service.isParagraphCached(index),
    );

    const pendingStart = service.start([FIRST_PARAGRAPH, SECOND_PARAGRAPH], TAB_ID, PAGE_URL);

    // Let paragraph 0 finish its own fetch AND let the prefetch batch fetch
    // paragraph 1 into the buffer while paragraph 0 is "playing" — this is
    // the scenario NFR-001 exists to protect.
    await jest.advanceTimersByTimeAsync(GENERATE_DELAY_MS + BATCH_INTERVAL_MS + 100);
    await pendingStart;

    expect(callCount()).toBe(2); // paragraph 0 (live) + paragraph 1 (prefetch)
    expect(prefetch.has(1)).toBe(true); // buffer actually warmed before next()

    const pendingNext = service.next();
    const resolvedWithoutNetworkDelay = await settlesWithoutAdvancingTimers(pendingNext);

    // The falsifiable bound: next() must resolve without the fake clock
    // ever advancing. If prefetch weren't wired (or the buffer weren't
    // consulted), next() would fall through to the network branch and this
    // would stay false until GENERATE_DELAY_MS of fake time passed.
    expect(resolvedWithoutNetworkDelay).toBe(true);
    await pendingNext;

    expect(callCount()).toBe(2); // next() consumed the buffer — no 3rd network call
    expect(service.getState()).toMatchObject({
      status: 'playing',
      currentParagraphIndex: 1,
    });
  });
});
