/**
 * Pausing during a paragraph transition.
 *
 * Every paragraph boundary passes through `loading` while the next clip is
 * fetched. A pause pressed in that window used to be rejected outright
 * (`canPause` required `playing`), and even once accepted the in-flight fetch
 * still called `play()` when it landed — so the reading resumed by itself with
 * no user action. Both are user-visible: "I hit pause and it kept reading."
 *
 * @module tests/unit/core/playback-service-pause-during-load
 */

import { describe, expect, it, jest } from '@jest/globals';

import { PlaybackService } from '../../../src/core/playback/playback-service';
import type { AudioError } from '../../../src/core/shared/errors';
import { Ok, isOk } from '../../../src/core/shared/result';
import type { Result } from '../../../src/core/shared/result';
import type { AudioResponse, IAudioGenerator } from '../../../src/ports/audio-generator.port';
import { PlaybackQueue } from '../../../src/utils/playback/playback-queue';
import { PrefetchService } from '../../../src/utils/playback/prefetch';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

/** A generator whose clip is always ready — the fetch window is not the subject here. */
function createInstantAudioGenerator(): IAudioGenerator {
  return {
    providerId: 'elevenlabs',
    supportsWordTiming: false,
    supportedLanguages: [],
    generateAudio: jest.fn(async () =>
      Ok({
        audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
        durationMs: 1_000,
        wordTimings: null,
      }),
    ),
    getVoices: jest.fn(async () => Ok([])),
    validateCredentials: jest.fn(async () => true),
  };
}

describe('PlaybackService pause during a paragraph load', () => {
  it('holds the pause and does not start the clip that was still loading', async () => {
    let resolveAudio: ((response: Result<AudioResponse, AudioError>) => void) | undefined;
    let markGenerationStarted: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });

    const audioGenerator: IAudioGenerator = {
      providerId: 'elevenlabs',
      supportsWordTiming: false,
      supportedLanguages: [],
      generateAudio: jest.fn(
        () =>
          new Promise<Result<AudioResponse, AudioError>>((resolve) => {
            resolveAudio = resolve;
            markGenerationStarted?.();
          }),
      ),
      getVoices: jest.fn(async () => Ok([])),
      validateCredentials: jest.fn(async () => true),
    };

    const playSpy = jest.spyOn(
      globalThis.Audio.prototype as unknown as { play: () => Promise<void> },
      'play',
    );

    try {
      const service = new PlaybackService({
        audioGenerator,
        audioUrlProvider: createMockAudioUrlProvider(),
        cacheStore: createMockCacheStore(),
        highlightSync: createMockHighlightSync({ validTabIds: [7] }),
        settingsStore: createMockSettingsStore(),
      });

      const pendingStart = service.start(
        ['first paragraph of the article', 'second paragraph of the article'],
        7,
        'https://example.test/article',
      );
      await generationStarted;
      expect(service.getState().status).toBe('loading');

      // The press lands while the clip is still in flight.
      const paused = await service.pause();
      expect(isOk(paused)).toBe(true);
      expect(service.getState().status).toBe('paused');

      resolveAudio?.(
        Ok({
          audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
          durationMs: 1_000,
          wordTimings: null,
        }),
      );
      await pendingStart;

      // The fetch landed after the pause: it must not un-pause the reading.
      expect(service.getState().status).toBe('paused');
      expect(playSpy).not.toHaveBeenCalled();

      // Resuming plays the clip that was already loaded — no second fetch.
      const resumed = await service.resume();
      expect(isOk(resumed)).toBe(true);
      expect(service.getState().status).toBe('playing');
      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(audioGenerator.generateAudio).toHaveBeenCalledTimes(1);
    } finally {
      playSpy.mockRestore();
    }
  });

  it('does not auto-advance when the clip ends after the reader paused', async () => {
    const audioGenerator = createInstantAudioGenerator();

    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
    });

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');
    expect(service.getState().status).toBe('playing');
    expect(service.getState().currentParagraphIndex).toBe(0);

    await service.pause();
    expect(service.getState().status).toBe('paused');

    // The clip had already reached its end, so the `ended` event is still
    // queued when the pause lands. Delivering it must not resume reading.
    const audio = (service as unknown as { audioElement: HTMLAudioElement }).audioElement;
    audio.dispatchEvent(new Event('ended'));
    await Promise.resolve();

    expect(service.getState().status).toBe('paused');
    expect(service.getState().currentParagraphIndex).toBe(0);
    expect(audioGenerator.generateAudio).toHaveBeenCalledTimes(1);
  });

  it('reports a resume that the browser refuses instead of claiming to play', async () => {
    // The pause guard makes resume() the FIRST play() for a clip that loaded
    // while paused — attachAndPlay() skipped its own. So the rejections it maps
    // (autoplay policy, undecodable blob) now land in resume(), where dropping
    // one would leave a footer claiming `playing` over a silent element with
    // nothing to press.
    const audioGenerator = createInstantAudioGenerator();
    const highlightSync = createMockHighlightSync({ validTabIds: [7] });

    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync,
      settingsStore: createMockSettingsStore(),
    });

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');
    await service.pause();
    expect(service.getState().status).toBe('paused');

    const playSpy = jest
      .spyOn(globalThis.Audio.prototype as unknown as { play: () => Promise<void> }, 'play')
      .mockRejectedValue(new DOMException('play() blocked by autoplay policy', 'NotAllowedError'));

    try {
      const resumed = await service.resume();

      expect(isOk(resumed)).toBe(false);
      expect(service.getState().status).toBe('error');
      // The reader is told why, through the same toast every other playback
      // failure uses.
      expect(highlightSync.showErrorCalls).toEqual([
        expect.objectContaining({
          tabId: 7,
          message: 'Playback was blocked by the browser. Click play to start audio.',
        }),
      ]);
    } finally {
      playSpy.mockRestore();
    }
  });

  it('does not resurrect a session stopped while the resume was starting', async () => {
    // Awaiting play() gives resume() a window it never had, and stop() is not
    // gated on status — it can land inside that window and clear the element's
    // source. Writing `playing` afterwards would claim a session the reader
    // ended is still reading.
    const audioGenerator = createInstantAudioGenerator();

    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
    });

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');
    await service.pause();

    // The stop lands while resume()'s play() is still settling.
    const playSpy = jest
      .spyOn(globalThis.Audio.prototype as unknown as { play: () => Promise<void> }, 'play')
      .mockImplementation(async () => {
        await service.stop();
      });

    try {
      await service.resume();
      expect(service.getState().status).toBe('stopped');
    } finally {
      playSpy.mockRestore();
    }
  });

  it('starts the clip that lands after a resume taken before it attached', async () => {
    // Pausing during the FIRST paragraph's fetch leaves no audio element at
    // all, so resume() has nothing to play. It must not strand the reader in a
    // silent `playing`: the fetch is still in flight (pause does not abort it),
    // and attachAndPlay sees a non-paused status when it lands.
    let resolveAudio: ((response: Result<AudioResponse, AudioError>) => void) | undefined;
    let markGenerationStarted: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });

    const audioGenerator: IAudioGenerator = {
      providerId: 'elevenlabs',
      supportsWordTiming: false,
      supportedLanguages: [],
      generateAudio: jest.fn(
        () =>
          new Promise<Result<AudioResponse, AudioError>>((resolve) => {
            resolveAudio = resolve;
            markGenerationStarted?.();
          }),
      ),
      getVoices: jest.fn(async () => Ok([])),
      validateCredentials: jest.fn(async () => true),
    };

    const playSpy = jest.spyOn(
      globalThis.Audio.prototype as unknown as { play: () => Promise<void> },
      'play',
    );

    try {
      const service = new PlaybackService({
        audioGenerator,
        audioUrlProvider: createMockAudioUrlProvider(),
        cacheStore: createMockCacheStore(),
        highlightSync: createMockHighlightSync({ validTabIds: [7] }),
        settingsStore: createMockSettingsStore(),
      });

      const pendingStart = service.start(
        ['first paragraph', 'second paragraph'],
        7,
        'https://example.test/article',
      );
      await generationStarted;

      await service.pause();
      // No clip has ever attached, so there is nothing for resume() to play.
      expect(
        (service as unknown as { audioElement: HTMLAudioElement | null }).audioElement,
      ).toBeNull();

      await service.resume();
      expect(playSpy).not.toHaveBeenCalled();

      resolveAudio?.(
        Ok({
          audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
          durationMs: 1_000,
          wordTimings: null,
        }),
      );
      await pendingStart;

      // The in-flight fetch landed and started itself — silence is not the
      // resting state.
      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(service.getState().status).toBe('playing');
    } finally {
      playSpy.mockRestore();
    }
  });

  it('holds the pause when the clip came from the prefetch buffer', async () => {
    // The prefetch tail is a second route to the same "clip is ready, start
    // reading" decision. It skips the network, so its window is short — but it
    // is exactly the window a reader hits when pausing between paragraphs of a
    // warm article, and a status of `playing` over a paused audio element is
    // the same lost press.
    const audioGenerator = createInstantAudioGenerator();

    const queue = new PlaybackQueue();
    const prefetch = new PrefetchService({
      maxBufferSize: 5,
      maxConcurrent: 2,
      batchIntervalMs: 1,
    });
    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
      prefetch: { service: prefetch, queue },
    });
    prefetch.configure(
      queue,
      (text, index) => service.generatePrefetchAudio(text, index),
      (index) => service.isParagraphCached(index),
    );

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');

    // Wait for the lookahead batch to buffer paragraph 1. The premise of the
    // test is that next() takes the prefetch route, so assert it rather than
    // assuming it.
    for (let i = 0; i < 50 && !prefetch.has(1); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(prefetch.has(1)).toBe(true);

    // The press lands while the buffered clip is being attached.
    const playSpy = jest
      .spyOn(globalThis.Audio.prototype as unknown as { play: () => Promise<void> }, 'play')
      .mockImplementation(async () => {
        await service.pause();
      });

    try {
      await service.next();

      expect(service.getState().status).toBe('paused');
      // Buffer consumed, so the reader did not pay for a second fetch either.
      expect(audioGenerator.generateAudio).toHaveBeenCalledTimes(2);
    } finally {
      playSpy.mockRestore();
      prefetch.stop();
    }
  });
});
