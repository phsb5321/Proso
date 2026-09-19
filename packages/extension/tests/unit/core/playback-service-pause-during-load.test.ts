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
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
} from '../../../src/ports/audio-generator.port';
import { PlaybackQueue } from '../../../src/utils/playback/playback-queue';
import { PrefetchService } from '../../../src/utils/playback/prefetch';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

import {
  type PrefetchPlaybackHarness,
  createPrefetchPlaybackHarness,
} from '../../helpers/prefetch-playback-harness';

/** Poll a condition with a bounded wall-clock budget. */
async function waitForIt(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Start a session whose settings read is still pending and then stop it.
 * Shared by the two start-ownership regressions (slow read, rejecting read).
 */
async function stopWhileSettingsReadPending(options: {
  delayMs: number;
  reject: boolean;
}): Promise<{
  generateMock: PrefetchPlaybackHarness['generateMock'];
  service: PlaybackService;
}> {
  const { generateMock, service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
    settingsLatencyMs: options.reject ? undefined : options.delayMs,
  });
  if (options.reject) {
    (service as unknown as { deps: { settingsStore: { getSettings: () => Promise<unknown> } } }).deps.settingsStore =
      {
        getSettings: () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('storage unavailable')), options.delayMs);
          }),
      };
  }
  service.setLanguage('en');

  const starting = service.start(['Proso reads.'], 7, 'https://example.test/article');
  await new Promise((resolve) => setTimeout(resolve, Math.max(5, Math.floor(options.delayMs / 4))));
  await service.stop();
  await starting;
  await new Promise((resolve) => setTimeout(resolve, options.delayMs + 40));
  return { generateMock, service };
}

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
    const { audioGenerator, prefetch, service } = createPrefetchPlaybackHarness(
      createInstantAudioGenerator(),
    );

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');

    // Wait for the lookahead batch to buffer paragraph 1. The premise of the
    // test is that next() takes the prefetch route, so assert it rather than
    // assuming it.
    await waitForIt(() => prefetch.has(1));
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

  it('abandons a start whose settings read outlives a stop', async () => {
    const { generateMock, service } = await stopWhileSettingsReadPending({
      delayMs: 60,
      reject: false,
    });
    expect(generateMock).not.toHaveBeenCalled();
    expect(service.getState().status).toBe('stopped');
  });

  it('abandons a start whose settings read rejects after a stop', async () => {
    const { generateMock, service } = await stopWhileSettingsReadPending({
      delayMs: 40,
      reject: true,
    });
    expect(generateMock).not.toHaveBeenCalled();
    expect(service.getState().status).toBe('stopped');
  });

  it('does not resurrect a session when a stop lands during its teardown', async () => {
    // start() over a playing session awaits the old session's teardown; an
    // external stop during that await must win over the suspended start.
    const { generateMock, service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
      highlightLatencyMs: 60,
    });
    service.setLanguage('en');

    await service.start(['First article.'], 7, 'https://example.test/first');
    await waitForIt(() => generateMock.mock.calls.length >= 1);

    const restart = service.start(['Second article.'], 7, 'https://example.test/second');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.stop();
    await restart;
    await new Promise((resolve) => setTimeout(resolve, 150));

    const texts = generateMock.mock.calls.map((call) => (call[0] as AudioRequest).text);
    expect(texts).not.toContain('Second article.');
    expect(service.getState().status).toBe('stopped');
  });

  it('a superseded empty start cannot overwrite stopped state with an error', async () => {
    const { service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
      highlightLatencyMs: 60,
    });
    service.setLanguage('en');

    await service.start(['First article.'], 7, 'https://example.test/first');
    const bogus = service.start([], 7, 'https://example.test/empty');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.stop();
    const result = await bogus;
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(result.ok).toBe(true);
    expect(service.getState().status).toBe('stopped');
    expect(service.getState().error).toBeNull();
  });

  it('lets the latest concurrent start win', async () => {
    const { generateMock, service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
      settingsLatencyMs: 40,
    });
    service.setLanguage('en');

    const first = service.start(['Older article.'], 7, 'https://example.test/older');
    const second = service.start(['Newer article.'], 7, 'https://example.test/newer');
    await Promise.all([first, second]);
    await waitForIt(() => generateMock.mock.calls.length >= 1);

    const texts = generateMock.mock.calls.map((call) => (call[0] as AudioRequest).text);
    expect(texts).not.toContain('Older article.');
    expect(texts).toContain('Newer article.');
    expect(service.getState().status).toBe('playing');
    await service.stop();
  });

  it('discards a prefetched clip whose spoken text no longer matches the rules', async () => {
    const rule = (spoken: string) => ({
      id: 'r1',
      locale: 'all' as const,
      match: 'Proso',
      spoken,
      matchMode: 'word' as const,
      caseSensitive: false,
      enabled: true,
    });
    const { generateMock, service, settingsStore } = createPrefetchPlaybackHarness(
      createInstantAudioGenerator(),
      {
        settings: { pronunciationLexiconEnabled: true, pronunciationLexicon: [rule('Prôzo')] },
      },
    );
    service.setLanguage('en');

    await service.start(['Proso reads.', 'Proso again.'], 7, 'https://example.test/article');
    await waitForIt(() => generateMock.mock.calls.length >= 2);
    expect((generateMock.mock.calls[1]?.[0] as AudioRequest).text).toContain('Prôzo');

    // The reader edits the rule after the lookahead was buffered.
    await settingsStore.updateSettings({
      pronunciationLexicon: [rule('Prôzo novo')],
    });
    await service.next();

    const texts = generateMock.mock.calls.map((call) => (call[0] as AudioRequest).text);
    expect(texts.some((text) => text.includes('Prôzo novo'))).toBe(true);
    expect(texts.filter((text) => text.includes('Prôzo reads'))).toHaveLength(1);
    await service.stop();
  });

  it('speaks the reader pronunciation rules for every provider', async () => {
    const { generateMock, service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
      settings: {
        pronunciationLexiconEnabled: true,
        pronunciationLexicon: [
          {
            id: 'rule-1',
            locale: 'all',
            match: 'Proso',
            spoken: 'Prôzo',
            matchMode: 'word',
            caseSensitive: false,
            enabled: true,
          },
        ],
      },
    });
    service.setLanguage('en');

    await service.start(['Proso reads.'], 7, 'https://example.test/article');
    await waitForIt(() => generateMock.mock.calls.length >= 1);

    const request = generateMock.mock.calls[0]?.[0] as AudioRequest;
    expect(request.text).toBe('Prôzo reads.');
    await service.stop();
  });

  it('prefetches the spoken text and keys the cache by it', async () => {
    // The lookahead path must synthesize the same normalized text the live
    // path sends, and write the durable cache under the same identity —
    // otherwise a prefetched paragraph reads un-normalized and the cache
    // disagrees with live playback.
    const { generateMock, highlightSync, service } = createPrefetchPlaybackHarness(
      createInstantAudioGenerator(),
    );
    service.setLanguage('en');

    await service.start(
      ['In 2022 he wrote.', 'Another 2022 paragraph.'],
      7,
      'https://example.test/article',
    );
    await waitForIt(() => generateMock.mock.calls.length >= 2);

    const prefetchRequest = generateMock.mock.calls[1]?.[0] as AudioRequest;
    expect(prefetchRequest.text).toContain('two thousand twenty-two');
    expect(await service.isParagraphCached(1)).toBe(true);

    // Consuming the prefetched paragraph must publish timings in SOURCE
    // coordinates: the printed token, never the spoken expansion words, and
    // with offsets that point into the paragraph text.
    const timelineSpy = jest.spyOn(highlightSync, 'setWordTimeline');
    await service.next();
    const published = timelineSpy.mock.calls.at(-1)?.[2] ?? [];
    const words = published.map((timing) => timing.word);
    expect(words).toContain('2022');
    expect(words).not.toContain('thousand');
    const paragraphWord = published.find((timing) => timing.word === 'paragraph');
    expect(paragraphWord?.charOffset).toBe('Another 2022 paragraph.'.indexOf('paragraph'));
    await service.stop();
  });

  it('discards a prefetch entry completed under an old voice (FR-012)', async () => {
    // A voice change while a lookahead request is still in flight used to
    // label the completed entry with the NEW voice (the label was read at
    // completion, not at request time), so the consume-side params check
    // passed and pre-change audio played under the new voice's name. The
    // entry must carry the voice it was REQUESTED with and be discarded.
    const { audioGenerator, generateMock, audioUrlProvider, prefetch, service } =
      createPrefetchPlaybackHarness(createInstantAudioGenerator());
    let released = false;
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    generateMock.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as AudioRequest;
      if (request.text.includes('second') && !released) {
        await secondGate;
      }
      return Ok({
        audioBlob: new Blob([request.voice ?? 'voiceless'], { type: 'audio/mpeg' }),
        durationMs: 1_000,
        wordTimings: null,
      });
    });

    await service.start(['first paragraph', 'second paragraph'], 7, 'https://example.test/article');

    // Wait until the lookahead for paragraph 1 is IN FLIGHT (unvoiced), then
    // change the voice mid-flight.
    await waitForIt(() => generateMock.mock.calls.length >= 2);
    expect(generateMock.mock.calls.length).toBe(2);
    await service.setVoice('cold-voice');

    // Release the stale lookahead. Its label must be the voice it was
    // requested with, so the consume path discards it and pays for a fresh
    // cold-voice synthesis instead of replaying pre-change audio.
    released = true;
    releaseSecond?.();
    await waitForIt(() => prefetch.has(1));
    expect(prefetch.has(1)).toBe(true);
    await service.next();

    const requestedVoices = generateMock.mock.calls.map((call) => (call[0] as AudioRequest).voice);
    expect(requestedVoices).toEqual([null, null, 'cold-voice']);
    // The stale entry's blob URL was revoked, not leaked (FR-011).
    expect(audioUrlProvider.revokeUrlCalls).toContain('mock://audio/2');
    expect(service.getState().status).toBe('playing');
    prefetch.stop();
  });
});
