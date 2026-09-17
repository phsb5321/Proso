/**
 * Reader Journey Integration Test
 *
 * Deterministic oracle for the Firefox-first reading path. It joins the real
 * article extractor, server API adapter, server TTS adapter, playback service,
 * cache, highlight synchronization, and playback controls without network I/O.
 *
 * @module tests/integration/reader-journey
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TTSProvider } from '@proso/shared';
import { ProsoApiAdapter } from '../../src/adapters/api/proso-api.adapter';
import { FallbackAudioAdapter } from '../../src/adapters/audio/fallback-audio.adapter';
import { LocalHostAudioAdapter } from '../../src/adapters/audio/local-host-audio.adapter';
import { ServerTtsAudioAdapter } from '../../src/adapters/audio/server-tts-audio.adapter';
import { PlaybackService } from '../../src/core/playback/playback-service';
import { isOk } from '../../src/core/shared/result';
import type { IHighlightSynchronizer } from '../../src/ports/highlight-sync.port';
import {
  extractText,
  getParagraphTexts,
  setExtractedParagraphs,
} from '../../src/utils/content/extractor';
import {
  createLocalHostFetchMock,
  ensureWebCryptoSubtle,
  wavResponse,
} from '../helpers/local-host-audio-fixtures';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../mocks';

const SERVER_URL = 'https://api.proso.com.br';
const TAB_ID = 81;
const PAGE_URL = 'https://example.com/verified-reader-journey';
const FIRST_PARAGRAPH =
  'Accessible reading tools should preserve attention while the spoken words remain visibly connected to the source text.';
const SECOND_PARAGRAPH =
  'A reliable reader must also let people pause, resume, change speed, and move between paragraphs without losing their place.';
const THIRD_PARAGRAPH =
  'This final paragraph makes the article long enough for the production extraction heuristic and confirms ordered navigation.';
/** The three sentences the local-host journey synthesizes, in reading order. */
const SENTENCES = [FIRST_PARAGRAPH, SECOND_PARAGRAPH, THIRD_PARAGRAPH];
/** MockAudioUrlProvider's default URL prefix. */
const MOCK_AUDIO_URL_PREFIX = 'mock://audio/';

const mockFetch = jest.fn<typeof fetch>();

function audioResponse(): Response {
  const audioBlob = new Blob([new Uint8Array(32_000)], { type: 'audio/mpeg' });
  return {
    ok: true,
    status: 200,
    blob: () => Promise.resolve(audioBlob),
    headers: new Headers({
      'Content-Type': 'audio/mpeg',
      'X-Cache-Hit': 'false',
      'X-Credits-Remaining': '0',
      'X-Credits-Used': '0',
      'X-Provider': 'openai',
    }),
  } as Response;
}

describe('reader journey', () => {
  /** Shared start-assertion: a successful start leaves the first paragraph playing. */
  async function assertStartedPlaying(
    service: PlaybackService,
    paragraphs: string[],
    tabId: number,
    pageUrl: string,
  ): Promise<void> {
    const started = await service.start(paragraphs, tabId, pageUrl);
    expect(isOk(started)).toBe(true);
    expect(service.getState()).toMatchObject({
      status: 'playing',
      currentParagraphIndex: 0,
      totalParagraphs: paragraphs.length,
    });
  }

  /** Shared control assertions: pause/resume round-trip and speed change. */
  async function assertPauseResumeAndSpeed(service: PlaybackService): Promise<void> {
    expect(isOk(await service.pause())).toBe(true);
    expect(service.getState().status).toBe('paused');
    expect(isOk(await service.resume())).toBe(true);
    expect(service.getState().status).toBe('playing');
    expect(isOk(await service.setSpeed(1.5))).toBe(true);
    expect(service.getState().speed).toBe(1.5);
  }
  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(audioResponse());
    document.body.innerHTML = `
      <main>
        <article class="article-content">
          <p>${FIRST_PARAGRAPH}</p>
          <p>${SECOND_PARAGRAPH}</p>
          <p>${THIRD_PARAGRAPH}</p>
          <p>${FIRST_PARAGRAPH} ${SECOND_PARAGRAPH} ${THIRD_PARAGRAPH}</p>
        </article>
      </main>
    `;
  });

  /** Restores the uninstrumented global Audio after the PROSO-110 oracle. */
  let restoreAudio: (() => void) | undefined;

  afterEach(() => {
    restoreAudio?.();
    restoreAudio = undefined;
    setExtractedParagraphs([]);
    document.body.replaceChildren();
  });

  it('extracts an article and reads it through the no-key server path with working controls', async () => {
    const extractedText = extractText('article');
    const paragraphs = getParagraphTexts();
    const highlightSync = createMockHighlightSync({ validTabIds: [TAB_ID] });
    const wordTimelines: Array<Parameters<IHighlightSynchronizer['setWordTimeline']>> = [];
    const setWordTimeline = highlightSync.setWordTimeline.bind(highlightSync);
    highlightSync.setWordTimeline = async (...args) => {
      wordTimelines.push(args);
      return setWordTimeline(...args);
    };
    const audioUrlProvider = createMockAudioUrlProvider();
    const service = new PlaybackService({
      audioGenerator: new ServerTtsAudioAdapter(
        new ProsoApiAdapter(SERVER_URL),
        TTSProvider.OpenAI,
      ),
      audioUrlProvider,
      cacheStore: createMockCacheStore(),
      highlightSync,
      settingsStore: createMockSettingsStore(),
    });

    expect(extractedText).toContain(FIRST_PARAGRAPH);
    expect(paragraphs).toEqual([FIRST_PARAGRAPH, SECOND_PARAGRAPH, THIRD_PARAGRAPH]);

    await assertStartedPlaying(service, paragraphs, TAB_ID, PAGE_URL);
    expect(highlightSync.isFooterVisible(TAB_ID)).toBe(true);
    expect(highlightSync.getCurrentParagraphIndex(TAB_ID)).toBe(0);
    expect(wordTimelines[0]?.[0]).toBe(TAB_ID);
    expect(wordTimelines[0]?.[1]).toBe(0);
    expect(wordTimelines[0]?.[2].length).toBeGreaterThan(5);

    const [url, init] = mockFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe(`${SERVER_URL}/api/v1/tts/synthesize`);
    expect(init?.method).toBe('POST');
    expect(headers['X-License-Key']).toBeUndefined();
    expect(JSON.parse(init?.body as string)).toEqual({
      text: FIRST_PARAGRAPH,
      provider: TTSProvider.OpenAI,
    });

    await assertPauseResumeAndSpeed(service);
    expect(isOk(await service.seek(0.4))).toBe(true);
    expect(service.getState().progress).toBe(0.4);

    expect(isOk(await service.next())).toBe(true);
    expect(service.getState().currentParagraphIndex).toBe(1);
    expect(JSON.parse(mockFetch.mock.calls[1]?.[1]?.body as string).text).toBe(SECOND_PARAGRAPH);
    expect(highlightSync.getCurrentParagraphIndex(TAB_ID)).toBe(1);

    expect(isOk(await service.previous())).toBe(true);
    expect(service.getState().currentParagraphIndex).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    expect(isOk(await service.stop())).toBe(true);
    expect(service.getState().status).toBe('stopped');
    expect(highlightSync.isFooterVisible(TAB_ID)).toBe(false);
    expect(highlightSync.clearHighlightsCalls).toContain(TAB_ID);
    expect(audioUrlProvider.revokeUrlCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('reads an article through the local synthesis host at sentence granularity (PROSO-110)', async () => {
    await ensureWebCryptoSubtle();
    const LOCAL_BASE = 'https://host.example';
    const CAPABILITIES = {
      apiVersion: '1',
      ready: true,
      limits: { maxTextUtf8Bytes: 8192, queueCapacity: 8 },
      tts: {
        mediaTypes: ['audio/wav'],
        voices: [
          { id: 'en_US-test-voice', language: 'en-US', mediaTypes: ['audio/wav'], markKinds: [] },
          { id: 'pt_BR-test-voice', language: 'pt-BR', mediaTypes: ['audio/wav'], markKinds: [] },
        ],
      },
    };

    // WAV fixture builder: shared module (mono 16-bit, duration by byte
    // count). The sentence index rides in the first data byte for the
    // ordered-playback oracle below.
    function localWavResponse(sentenceIndex: number): Response {
      return wavResponse(400, sentenceIndex);
    }

    const localFetch = createLocalHostFetchMock({
      capabilities: CAPABILITIES,
      tts: (init) => {
        const request = JSON.parse(String(init?.body)) as { input: string };
        const sentenceIndex = SENTENCES.indexOf(request.input);
        // An unknown input must fail loudly, never alias to sentence zero's
        // marker byte (zero-filled buffers decode as SENTENCES[0]).
        if (sentenceIndex < 0) throw new Error(`unexpected tts input: ${request.input}`);
        return localWavResponse(sentenceIndex);
      },
    });

    const extractedText = extractText('article');
    expect(extractedText).toContain(FIRST_PARAGRAPH);
    // A multi-sentence paragraph: sentence-granular chunking only bites when
    // the paragraph has more than one sentence.
    const paragraphs = [`${FIRST_PARAGRAPH} ${SECOND_PARAGRAPH} ${THIRD_PARAGRAPH}`];
    const highlightSync = createMockHighlightSync({ validTabIds: [TAB_ID] });
    const audioUrlProvider = createMockAudioUrlProvider();
    const service = new PlaybackService({
      audioGenerator: new FallbackAudioAdapter({
        primary: new LocalHostAudioAdapter({ baseUrl: LOCAL_BASE, fetchFn: localFetch }),
        secondary: new ServerTtsAudioAdapter(new ProsoApiAdapter(SERVER_URL), TTSProvider.OpenAI),
        gate: async () => ({ ok: true }),
      }),
      audioUrlProvider,
      cacheStore: createMockCacheStore(),
      highlightSync,
      settingsStore: createMockSettingsStore(),
    });
    // The reader journey detects the article language before playback; the
    // local host needs it to pick a voice (spec D-2).
    service.setLanguage('en');

    // Ordered-playback oracle (PROSO-110): the chunk producer overlaps the
    // next sentence's synthesis with the live one, and under load a lookahead
    // request can be initiated before the live chunk's (observed 15/09:
    // ttsCalls[0] held sentence two). Fetch and createUrl initiation order is
    // therefore NOT playback order. Each WAV carries its sentence's index in
    // its first data byte, and a recording Audio element captures the src
    // sequence playback actually consumed — the order the reader hears.
    const playedSrcs: string[] = [];
    const OriginalAudio = globalThis.Audio;
    const SharedMock = OriginalAudio as unknown as new () => Record<string, unknown>;
    const RecordingAudio = function RecordingAudio(this: Record<string, unknown>) {
      const element = new SharedMock();
      let src = '';
      Object.defineProperty(element, 'src', {
        get: () => src,
        set: (value: string) => {
          src = value;
          if (value) playedSrcs.push(value);
        },
        configurable: true,
      });
      return element;
    } as unknown as { new (): HTMLAudioElement };
    restoreAudio = () => {
      globalThis.Audio = OriginalAudio;
    };
    globalThis.Audio = RecordingAudio as unknown as typeof Audio;

    await assertStartedPlaying(service, paragraphs, TAB_ID, PAGE_URL);

    // Sentence-granular synthesis (FR-7): every /v1/tts request carries ONE
    // sentence — never the whole paragraph.
    const ttsInputs = localFetch.mock.calls
      .filter(([url]) => String(url).endsWith('/v1/tts'))
      .map(([, init]) => (JSON.parse(String(init?.body)) as { input: string }).input);
    expect(ttsInputs.length).toBeGreaterThanOrEqual(1);
    for (const input of ttsInputs) {
      expect(SENTENCES).toContain(input);
    }

    // The first clip the player consumed (FR-11) was the paragraph's first
    // sentence, regardless of which synthesis request the producer pipeline
    // happened to initiate first.
    expect(audioUrlProvider.createUrlCalls.length).toBeGreaterThanOrEqual(1);
    expect(playedSrcs.length).toBeGreaterThanOrEqual(1);
    const firstPlayed = playedSrcs[0]!;
    expect(firstPlayed.startsWith(MOCK_AUDIO_URL_PREFIX)).toBe(true);
    const firstChunkIndex = Number(firstPlayed.slice(MOCK_AUDIO_URL_PREFIX.length)) - 1;
    const firstClipData = audioUrlProvider.createUrlCalls[firstChunkIndex]?.data;
    expect(firstClipData).toBeDefined();
    /** jsdom's Blob lacks arrayBuffer(); read bytes via FileReader. */
    async function blobBytes(blob: Blob): Promise<Uint8Array> {
      if (typeof (blob as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
        return new Uint8Array(await blob.arrayBuffer());
      }
      const reader = new FileReader();
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
      return new Uint8Array(buffer);
    }

    const clipData =
      firstClipData instanceof Blob
        ? await blobBytes(firstClipData)
        : new Uint8Array(firstClipData!);
    const firstPlayedSentence = SENTENCES[clipData[44]!];
    expect(firstPlayedSentence).toBe(FIRST_PARAGRAPH);

    // The chunked path never writes the paragraph cache (host idempotency is
    // its own cache).
    // Controls still work: pause/resume/stop.
    expect(isOk(await service.pause())).toBe(true);
    expect(service.getState().status).toBe('paused');
    expect(isOk(await service.resume())).toBe(true);
    expect(isOk(await service.stop())).toBe(true);
    expect(service.getState().status).toBe('stopped');
    // (pause/resume asserted once above; stop ends the session)
  });
});
