/**
 * PlaybackService chunked-path tests (spec 100 FR-7/FR-11, PROSO-110).
 *
 * A generator advertising `supportsChunkedSynthesis` (the local synthesis
 * host) is consumed at sentence granularity: chunk 0 starts playback, the
 * drain fills the queue ahead, and the element's 'ended' plays the next
 * queued chunk instead of advancing to the next paragraph.
 *
 * @module tests/unit/core/playback-service-chunked
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlaybackService } from '../../../src/core/playback/playback-service';
import type { AudioError } from '../../../src/core/shared/errors';
import { audioError, playbackError } from '../../../src/core/shared/errors';
import { Err, Ok } from '../../../src/core/shared/result';
import type { Result } from '../../../src/core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  ChunkedSynthesisOptions,
  IAudioGenerator,
  Voice,
} from '../../../src/ports/audio-generator.port';
import {
  type MockAudioUrlProvider,
  type MockCacheStore,
  type MockHighlightSync,
  type MockSettingsStore,
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

/**
 * A minimal chunked generator: yields one Ok response per sentence with a
 * distinguishable blob (the blob's type carries the chunk index).
 */
class ChunkedMockGenerator implements IAudioGenerator {
  readonly providerId = 'local' as const;
  readonly supportsWordTiming = false;
  readonly supportsChunkedSynthesis = true;
  readonly supportedLanguages: readonly string[] = ['pt-BR', 'en-US'];
  readonly yieldedChunks: string[] = [];
  readonly requests: AudioRequest[] = [];
  readonly chunkCalls: Array<{
    readonly request: AudioRequest;
    readonly options?: ChunkedSynthesisOptions;
  }> = [];

  constructor(
    readonly sentences: string[] = ['First sentence.', 'Second sentence.'],
    private readonly timings: AudioResponse['wordTimings'][] = [],
  ) {}

  async generateAudio(): Promise<Result<AudioResponse, AudioError>> {
    throw new Error('chunked generator has no single-shot path');
  }

  async *generateAudioChunks(
    request: AudioRequest,
    _signal?: AbortSignal,
    options?: ChunkedSynthesisOptions,
  ): AsyncGenerator<Result<AudioResponse, AudioError>, void, void> {
    this.chunkCalls.push({ request, options });
    for (const sentence of this.sentences) {
      this.requests.push({ text: sentence, voice: null, speed: 1, language: 'en' });
      const index = this.yieldedChunks.length;
      this.yieldedChunks.push(sentence);
      yield Ok({
        audioBlob: new Blob([`chunk-${index}`], { type: `audio/chunk-${index}` }),
        durationMs: 1000 + index * 100,
        wordTimings: this.timings[index] ?? null,
      });
    }
  }

  async getVoices(): Promise<Result<Voice[], AudioError>> {
    return Ok([]);
  }

  async validateCredentials(): Promise<boolean> {
    return true;
  }
}

describe('PlaybackService chunked path', () => {
  let service: PlaybackService;
  let generator: ChunkedMockGenerator;
  let mockAudioUrlProvider: MockAudioUrlProvider;
  let mockCacheStore: MockCacheStore;
  let mockHighlightSync: MockHighlightSync;
  let mockSettingsStore: MockSettingsStore;
  let endedHandler: (() => void) | null;
  let errorHandler: (() => void) | null;

  /** jsdom Blob lacks .text(); read via FileReader. */
  function readBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  /** Fire the clip's ended event and let the microtask queue settle. */
  async function endClip(): Promise<void> {
    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const testParagraphs = [
    'First sentence. Second sentence.',
    'Next paragraph. With two sentences.',
  ];
  const testTabId = 123;
  const testPageUrl = 'https://example.com/article';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    generator = new ChunkedMockGenerator();
    mockAudioUrlProvider = createMockAudioUrlProvider();
    mockCacheStore = createMockCacheStore();
    mockHighlightSync = createMockHighlightSync({ validTabIds: [testTabId] });
    mockSettingsStore = createMockSettingsStore();
    endedHandler = null;
    errorHandler = null;

    // Capture the audio element's 'ended' listener so tests can drive the
    // chunk continuation deterministically.
    const originalAddEventListener = Audio.prototype.addEventListener;
    jest.spyOn(Audio.prototype, 'addEventListener').mockImplementation(function (
      this: HTMLAudioElement,
      event: unknown,
      cb: unknown,
    ) {
      if (event === 'ended') endedHandler = cb as () => void;
      if (event === 'error') errorHandler = cb as () => void;
      return originalAddEventListener.call(this, event as string, cb as EventListener);
    });
    jest.spyOn(Audio.prototype, 'play').mockImplementation(() => Promise.resolve());

    service = new PlaybackService({
      audioGenerator: generator,
      audioUrlProvider: mockAudioUrlProvider,
      cacheStore: mockCacheStore,
      highlightSync: mockHighlightSync,
      settingsStore: mockSettingsStore,
    });
  });

  it('silences the old voice and ignores its ended event while the replacement loads', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    const pause = jest.spyOn(Audio.prototype, 'pause');
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    generator.generateAudioChunks = async function* (request) {
      generator.chunkCalls.push({ request });
      await ready;
      yield Ok({ audioBlob: new Blob(['replacement']), durationMs: 1000, wordTimings: null });
    };
    await mockSettingsStore.updateSettings({ voice: 'River' });
    try {
      expect(pause).toHaveBeenCalled();
      expect(service.getState().status).toBe('loading');
      endedHandler?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(service.getState().currentParagraphIndex).toBe(0);
      expect(generator.chunkCalls.at(-1)?.request.text).toContain('First sentence');
    } finally {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await service.stop();
    }
  });

  it('does not start the paragraph lookahead prefetcher for a chunked generator', async () => {
    const prefetchStart = jest.fn();
    const prefetchStop = jest.fn();
    const queueStart = jest.fn();
    const queuePause = jest.fn();
    service = new PlaybackService({
      audioGenerator: generator,
      audioUrlProvider: mockAudioUrlProvider,
      cacheStore: mockCacheStore,
      highlightSync: mockHighlightSync,
      settingsStore: mockSettingsStore,
      prefetch: {
        service: {
          start: prefetchStart,
          stop: prefetchStop,
          clearBuffer: jest.fn(),
        } as never,
        queue: {
          initialize: jest.fn(),
          start: queueStart,
          pause: queuePause,
          stop: jest.fn(),
        } as never,
      },
    });

    await service.start(testParagraphs, testTabId, testPageUrl);
    expect(queueStart).toHaveBeenCalledWith(0);
    expect(prefetchStart).not.toHaveBeenCalled();

    await service.pause();
    prefetchStart.mockClear();
    await service.resume();
    expect(prefetchStart).not.toHaveBeenCalled();
  });

  it('clears stale highlighting before it shows a chunk synthesis error', async () => {
    generator.generateAudioChunks = async function* () {
      yield Err(audioError.providerError('unsupported_input', 'Unsupported structural glyph'));
    };
    const clearSpy = jest.spyOn(mockHighlightSync, 'clearHighlights');
    const errorSpy = jest.spyOn(mockHighlightSync, 'showError');

    const result = await service.start(testParagraphs, testTabId, testPageUrl);

    expect(result.ok).toBe(false);
    expect(clearSpy).toHaveBeenCalledWith(testTabId);
    expect(errorSpy).toHaveBeenCalled();
    expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
      errorSpy.mock.invocationCallOrder[0]!,
    );
  });

  it('starts playback from chunk 0 without waiting for the whole paragraph', async () => {
    const result = await service.start(testParagraphs, testTabId, testPageUrl);
    expect(result.ok).toBe(true);
    expect(service.getState().status).toBe('playing');

    // Only the first sentence was synthesized for playback to start; the rest
    // drain in the background (one in flight + one prefetched).
    expect(generator.yieldedChunks.length).toBeGreaterThanOrEqual(1);
    const firstBlob = mockAudioUrlProvider.createUrlCalls[0]?.data as Blob;
    expect(await readBlob(firstBlob)).toBe('chunk-0');

    // The chunked path bypasses the paragraph cache (the host's idempotent
    // replay is its own cache).
    expect(mockCacheStore.setCalls).toHaveLength(0);

    // Let the drain fill the queue.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(generator.yieldedChunks).toEqual(
      testParagraphs[0] ? ['First sentence.', 'Second sentence.'] : [],
    );
  });

  it('hands the generator the next paragraph so its prefetch spans the boundary', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Byte-identical to the request text paragraph 1 will be read with: the
    // generator adopts primed work by comparing the two, so an approximation
    // silently reverts to a cold start at the boundary (PROSO-209).
    expect(generator.chunkCalls[0]?.options?.nextText).toBe('Next paragraph. With two sentences.');

    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.getState().currentParagraphIndex).toBe(1);
    expect(generator.chunkCalls[1]?.request.text).toBe(generator.chunkCalls[0]?.options?.nextText);
    // Nothing follows the last paragraph, so nothing is primed for it.
    expect(generator.chunkCalls[1]?.options?.nextText).toBeNull();
  });

  it('announces only the speakable part of the next paragraph', async () => {
    const paragraphs = ['First sentence. Second sentence.', '────. Actual words.'];
    await service.start(paragraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generator.chunkCalls[0]?.options?.nextText).toBe('Actual words.');
  });

  it("consumes the queued chunk on 'ended' instead of advancing the paragraph", async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(endedHandler).not.toBeNull();
    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Chunk 1 played; the paragraph did NOT advance.
    expect(mockAudioUrlProvider.createUrlCalls.length).toBe(2);
    const secondBlob = mockAudioUrlProvider.createUrlCalls[1]?.data as Blob;
    expect(await readBlob(secondBlob)).toBe('chunk-1');
    expect(service.getState().currentParagraphIndex).toBe(0);
  });

  it('publishes sentence-local timelines on a monotonic paragraph clock', async () => {
    const timelineSpy = jest.spyOn(mockHighlightSync, 'setWordTimeline');

    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstTimeline = timelineSpy.mock.calls.at(-1)?.[2];
    expect(service.getTimingBasis()).toBe('estimated');
    expect(firstTimeline?.map((entry) => entry.word)).toEqual(['First', 'sentence']);
    expect(firstTimeline?.[0]?.charOffset).toBe(0);
    expect(firstTimeline?.at(-1)?.endTimeMs).toBeCloseTo(1000);

    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondTimeline = timelineSpy.mock.calls.at(-1)?.[2];
    expect(secondTimeline?.map((entry) => entry.word)).toEqual(['Second', 'sentence']);
    expect(secondTimeline?.[0]?.charOffset).toBe(testParagraphs[0].indexOf('Second'));
    expect(secondTimeline?.[0]?.startTimeMs).toBeCloseTo(1000);
    expect(secondTimeline?.at(-1)?.endTimeMs).toBeCloseTo(2100);
  });

  it('skips a structural-only sentence instead of timing the full paragraph', async () => {
    const structuralGenerator = new ChunkedMockGenerator(['Second sentence.']);
    service.setAudioGenerator(structuralGenerator);
    const timelineSpy = jest.spyOn(mockHighlightSync, 'setWordTimeline');

    await service.start(['────. Second sentence.'], testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(structuralGenerator.yieldedChunks).toEqual(['Second sentence.']);
    const timeline = timelineSpy.mock.calls.at(-1)?.[2];
    expect(timeline?.map((entry) => entry.word)).toEqual(['Second', 'sentence']);
    expect(timeline?.[0]?.charOffset).toBe('────. '.length);
    expect(timeline?.[0]?.startTimeMs).toBe(0);
  });

  it('advances past an all-structural paragraph', async () => {
    const structuralGenerator = new ChunkedMockGenerator(['Actual words.']);
    service.setAudioGenerator(structuralGenerator);

    const result = await service.start(['────.', 'Actual words.'], testTabId, testPageUrl);

    expect(result.ok).toBe(true);
    expect(service.getState().status).toBe('playing');
    expect(service.getState().currentParagraphIndex).toBe(1);
    expect(structuralGenerator.yieldedChunks).toEqual(['Actual words.']);
  });

  it('preserves provider timings while translating them to the paragraph clock', async () => {
    const timedGenerator = new ChunkedMockGenerator(undefined, [
      [{ word: 'First', startMs: 100, endMs: 400 }],
      [{ word: 'Second', startMs: 50, endMs: 500 }],
    ]);
    service.setAudioGenerator(timedGenerator);
    const timelineSpy = jest.spyOn(mockHighlightSync, 'setWordTimeline');

    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.getTimingBasis()).toBe('provider');
    expect(timelineSpy.mock.calls.at(-1)?.[2]).toEqual([
      {
        word: 'First',
        charOffset: 0,
        charLength: 5,
        startTimeMs: 100,
        endTimeMs: 400,
      },
    ]);

    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(timelineSpy.mock.calls.at(-1)?.[2]).toEqual([
      {
        word: 'Second',
        charOffset: testParagraphs[0].indexOf('Second'),
        charLength: 6,
        startTimeMs: 1050,
        endTimeMs: 1500,
      },
    ]);
  });

  it('rejects an over-limit source sentence before opening the chunk generator', async () => {
    const result = await service.start(['a'.repeat(8193)], testTabId, testPageUrl);

    expect(result.ok).toBe(false);
    expect(service.getState().status).toBe('error');
    expect(generator.yieldedChunks).toHaveLength(0);
  });

  it('fails closed when a generator yields more chunks than source sentences', async () => {
    const extraGenerator = new ChunkedMockGenerator(['Only sentence.', 'Unexpected chunk.']);
    service.setAudioGenerator(extraGenerator);

    await service.start(['Only sentence.'], testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.getState().status).toBe('error');
    expect(mockHighlightSync.showErrorCalls.at(-1)?.message).toContain(
      'more audio chunks than source sentences',
    );
  });

  it('advances to the next paragraph once the chunk queue is exhausted', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await endClip(); // chunk 1
    await endClip(); // queue empty; the wait resolves when the drain confirms completion

    for (let i = 0; i < 50 && service.getState().currentParagraphIndex !== 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(service.getState().currentParagraphIndex).toBe(1);
  });

  it('ignores an error reported by an older playback generation', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    const internals = service as unknown as {
      playbackGeneration: number;
      setError(
        error: ReturnType<typeof playbackError.playbackFailed>,
        tabId?: number,
        generation?: number,
      ): Promise<void>;
    };
    const staleGeneration = internals.playbackGeneration;
    internals.playbackGeneration += 1;
    const clearSpy = jest.spyOn(mockHighlightSync, 'clearHighlights');
    const errorSpy = jest.spyOn(mockHighlightSync, 'showError');

    await internals.setError(
      playbackError.playbackFailed('Old request failed'),
      undefined,
      staleGeneration,
    );

    expect(clearSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(service.getState().status).toBe('playing');
  });

  it('ignores the media error emitted when stop clears the audio source', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    const errorSpy = jest.spyOn(mockHighlightSync, 'showError');

    await service.stop();
    errorHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockHighlightSync.isFooterVisible(testTabId)).toBe(false);
  });

  it('does not let an older stop hide a superseding generation', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    const originalClear = mockHighlightSync.clearHighlights.bind(mockHighlightSync);
    jest.spyOn(mockHighlightSync, 'clearHighlights').mockImplementation(async (tabId) => {
      const result = await originalClear(tabId);
      (service as unknown as { playbackGeneration: number }).playbackGeneration += 1;
      return result;
    });
    const hideSpy = jest.spyOn(mockHighlightSync, 'hideFooter');

    await service.stop();

    expect(hideSpy).not.toHaveBeenCalled();
    expect(service.getState().status).toBe('playing');
    expect(mockHighlightSync.updateFooterStateCalls.at(-1)?.state.status).not.toBe('stopped');
  });

  it('stop() discards the chunk queue (no stale chunk plays after a stop)', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await service.stop();
    const callsBefore = mockAudioUrlProvider.createUrlCalls.length;
    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockAudioUrlProvider.createUrlCalls.length).toBe(callsBefore);
    expect(service.getState().status).toBe('stopped');
    expect(service.getState().currentParagraphIndex).toBe(0);
  });

  it('waits for a slow chunk instead of advancing early (no sentence skip)', async () => {
    // The producer needs longer than the old 500ms grace period for its
    // second sentence. The paragraph's remaining sentences must still play —
    // the old timer advanced anyway and dropped them silently.
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    generator.generateAudioChunks = async function* (request) {
      generator.chunkCalls.push({ request });
      yield Ok({ audioBlob: new Blob(['chunk-0']), durationMs: 300, wordTimings: null });
      await secondGate;
      yield Ok({ audioBlob: new Blob(['chunk-1']), durationMs: 300, wordTimings: null });
    };

    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      endedHandler?.();
      // Past the old 500ms grace: still paragraph 0, no advance happened.
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(service.getState().status).toBe('playing');
      expect(service.getState().currentParagraphIndex).toBe(0);

      // The slow chunk lands: playback must consume it rather than skip it.
      const urlsBefore = mockAudioUrlProvider.createUrlCalls.length;
      releaseSecond?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockAudioUrlProvider.createUrlCalls.length).toBeGreaterThan(urlsBefore);
      expect(service.getState().currentParagraphIndex).toBe(0);
    } finally {
      releaseSecond?.();
      await service.stop();
    }
  });

  it('joins two concurrent next() calls into one advance', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await Promise.all([service.next(), service.next()]);

    // Both presses landed as one transition — index 1, never 2.
    expect(service.getState().currentParagraphIndex).toBe(1);
    await service.stop();
  });

  it('does not double-advance when the clip ends as the reader presses Next', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await endClip(); // consumes the queued second chunk
    // The final clip ends: that fires the auto-advance path while the reader
    // presses Next in the same instant. Without the join both advance and the
    // paragraph in between is skipped.
    endedHandler?.();
    void service.next();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(service.getState().currentParagraphIndex).toBe(1);
    await service.stop();
  });

  it('does not join a transition from a torn-down session across stop/start', async () => {
    // Cold navigation: hold the pending Next's clip, tear the session down,
    // start a fresh session, then press Next again. The new press must not be
    // deduplicated against the obsolete transition.
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    generator.generateAudioChunks = async function* (request) {
      generator.chunkCalls.push({ request });
      if (request.text.includes('Second paragraph')) {
        await gate;
      }
      yield Ok({ audioBlob: new Blob(['clip']), durationMs: 300, wordTimings: null });
    };

    await service.start(['First paragraph.', 'Second paragraph.'], testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pendingNext = service.next(); // held on the gate
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.stop();
    await service.start(['Fresh one.', 'Fresh two.'], testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const advanced = await Promise.race([
      service.next().then(() => service.getState().currentParagraphIndex),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000)),
    ]);
    expect(advanced).toBe(1);

    release?.(); // the obsolete transition completes late and must not disturb
    await pendingNext.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.getState().currentParagraphIndex).toBe(1);
    await service.stop();
  });

  it('skips a structural-only paragraph mid-transition without deadlocking', async () => {
    // The internal skip must not join the transition that is awaiting it:
    // 'return this.next()' inside the transition body formed a promise cycle
    // and locked every later navigation.
    // One chunk per paragraph, so the first clip's end reaches the
    // auto-advance path directly.
    generator.generateAudioChunks = async function* (request) {
      generator.chunkCalls.push({ request });
      yield Ok({ audioBlob: new Blob(['only']), durationMs: 300, wordTimings: null });
    };
    await service.start(
      ['First words.', '─────.', 'Actual words.'],
      testTabId,
      testPageUrl,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    endedHandler?.(); // queue is empty and the drain is done -> auto-advance

    const settled = await Promise.race([
      (async () => {
        for (let i = 0; i < 100 && service.getState().currentParagraphIndex !== 2; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return service.getState().currentParagraphIndex;
      })(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000)),
    ]);

    expect(settled).toBe(2);
    expect(service.getState().status).toBe('playing');
    await service.stop();
  });
});
