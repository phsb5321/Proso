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

  afterEach(() => {
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

    const started = await service.start(paragraphs, TAB_ID, PAGE_URL);

    expect(isOk(started)).toBe(true);
    expect(service.getState()).toMatchObject({
      status: 'playing',
      currentParagraphIndex: 0,
      totalParagraphs: paragraphs.length,
    });
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

    expect(isOk(await service.pause())).toBe(true);
    expect(service.getState().status).toBe('paused');
    expect(isOk(await service.resume())).toBe(true);
    expect(service.getState().status).toBe('playing');
    expect(isOk(await service.setSpeed(1.5))).toBe(true);
    expect(service.getState().speed).toBe(1.5);
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
});
