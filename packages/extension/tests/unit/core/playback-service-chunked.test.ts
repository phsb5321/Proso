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
import { Ok } from '../../../src/core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
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

  constructor(
    readonly sentences: string[] = ['First sentence.', 'Second sentence.'],
    private readonly timings: AudioResponse['wordTimings'][] = [],
  ) {}

  async generateAudio(): Promise<never> {
    throw new Error('chunked generator has no single-shot path');
  }

  async *generateAudioChunks(): AsyncGenerator<
    import('../../../src/core/shared/result').Result<AudioResponse, never>,
    void,
    void
  > {
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

  async getVoices(): Promise<import('../../../src/core/shared/result').Result<Voice[], never>> {
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

  /** jsdom Blob lacks .text(); read via FileReader. */
  function readBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
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

    // Capture the audio element's 'ended' listener so tests can drive the
    // chunk continuation deterministically.
    const originalAddEventListener = Audio.prototype.addEventListener;
    jest.spyOn(Audio.prototype, 'addEventListener').mockImplementation(function (
      this: HTMLAudioElement,
      event: unknown,
      cb: unknown,
    ) {
      if (event === 'ended') endedHandler = cb as () => void;
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
    expect(firstTimeline?.map((entry) => entry.word)).toEqual(['First', 'sentence.']);
    expect(firstTimeline?.[0]?.charOffset).toBe(0);
    expect(firstTimeline?.at(-1)?.endTimeMs).toBeCloseTo(1000);

    endedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondTimeline = timelineSpy.mock.calls.at(-1)?.[2];
    expect(secondTimeline?.map((entry) => entry.word)).toEqual(['Second', 'sentence.']);
    expect(secondTimeline?.[0]?.charOffset).toBe(testParagraphs[0].indexOf('Second'));
    expect(secondTimeline?.[0]?.startTimeMs).toBeCloseTo(1000);
    expect(secondTimeline?.at(-1)?.endTimeMs).toBeCloseTo(2100);
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

    endedHandler?.(); // chunk 1
    await new Promise((resolve) => setTimeout(resolve, 0));
    endedHandler?.(); // queue empty -> next()

    expect(service.getState().currentParagraphIndex).toBe(1);
  });

  it('stop() discards the chunk queue (no stale chunk plays after a stop)', async () => {
    await service.start(testParagraphs, testTabId, testPageUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await service.stop();
    const callsBefore = mockAudioUrlProvider.createUrlCalls.length;
    endedHandler?.();

    // The generation changed on stop: the ended handler must not play a stale
    // chunk (playNextChunk checks the generation).
    expect(mockAudioUrlProvider.createUrlCalls.length).toBe(callsBefore);
  });
});
