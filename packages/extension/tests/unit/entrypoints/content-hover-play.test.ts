// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Feature 229 — drives the real content-script main() in jsdom to prove the
 * ambient hover-play wiring: idle extraction marks paragraphs, a paragraph
 * click sends PARAGRAPH_CLICKED, and interactive/selection clicks stay silent.
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import content from '../../../src/entrypoints/content';
import {
  getLastExtractionMode,
  setExtractedParagraphs,
} from '../../../src/utils/content/extractor';

// jsdom has no ResizeObserver; StickyFooter's constructor requires one.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverStub,
  configurable: true,
  writable: true,
});

// Force the setTimeout scheduling branch so fake timers can advance it
// (production Firefox takes the requestIdleCallback branch of the same call).
Object.defineProperty(window, 'requestIdleCallback', {
  value: undefined,
  configurable: true,
  writable: true,
});

const sendMessageMock = browser.runtime.sendMessage as unknown as {
  mockClear: () => void;
  mockResolvedValue: (value: unknown) => void;
  mock: { calls: unknown[][] };
};

type ContentMessageListener = (message: { action: string; [key: string]: unknown }) => unknown;
const addMessageListenerMock = browser.runtime.onMessage.addListener as unknown as {
  mockClear: () => void;
  mock: { calls: Array<[ContentMessageListener]> };
};

beforeAll(() => {
  jest.useFakeTimers();
  sendMessageMock.mockResolvedValue({ success: true, highlights: [] });
});

function setSelection(selection: { isCollapsed: boolean } | null): void {
  Object.defineProperty(window, 'getSelection', {
    value: () => selection,
    configurable: true,
    writable: true,
  });
}

const LOREM =
  'Prose enough for the ambient extractor to consider this page an article worth reading. '.repeat(
    2,
  );

function articleDom(): void {
  document.body.innerHTML =
    // class="post" hits the extractor's Priority-2 article selector; distinct
    // first words keep each paragraph's 100-char dedup key unique.
    '<article class="post">' +
    `<p id="p1">First paragraph. ${LOREM}</p>` +
    `<p id="p2">Second paragraph. ${LOREM}</p>` +
    `<p id="p3">Third paragraph with <a id="link" href="/next">a link</a>. ${LOREM}</p>` +
    '</article>';
}

function articleParagraphTexts(): string[] {
  return ['p1', 'p2', 'p3'].map((id) => document.getElementById(id)?.textContent?.trim() ?? '');
}

function startContentWithMessageListener(): ContentMessageListener {
  (content as { main?: (ctx?: unknown) => void }).main?.();
  const listenerCall =
    addMessageListenerMock.mock.calls[addMessageListenerMock.mock.calls.length - 1];
  if (!listenerCall) throw new Error('content message listener was not registered');
  return listenerCall[0];
}

function paragraphClickMessages(): unknown[][] {
  return sendMessageMock.mock.calls.filter(
    (call) =>
      typeof call[0] === 'object' &&
      call[0] !== null &&
      (call[0] as { type?: string }).type === 'PARAGRAPH_CLICKED',
  );
}

describe('content main() — ambient hover-play (Feature 229)', () => {
  beforeEach(() => {
    // main() is idempotence-guarded per page; reset the guard so each test
    // drives a fresh main() (duplicate page listeners behave identically).
    const proso = (window as { Proso?: { _contentInitialized?: boolean } }).Proso;
    if (proso) proso._contentInitialized = undefined;
    setExtractedParagraphs([]);
    sendMessageMock.mockClear();
    addMessageListenerMock.mockClear();
    Object.defineProperty(window, 'requestIdleCallback', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    setSelection(null);
    articleDom();
  });

  it('marks extracted paragraphs at idle and starts playback on paragraph click', () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    jest.advanceTimersByTime(1300);

    for (const id of ['p1', 'p2', 'p3']) {
      expect(document.getElementById(id)?.classList.contains('proso-hoverable')).toBe(true);
    }

    const p2 = document.getElementById('p2') as Element;
    p2.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const paragraphClicks = paragraphClickMessages();
    expect(paragraphClicks).toHaveLength(1);
    expect(paragraphClicks[0][0]).toMatchObject({ paragraphIndex: 1 });
  });

  it('enables popup selection mode after ambient cache warming', async () => {
    const listener = startContentWithMessageListener();
    jest.advanceTimersByTime(1300);
    const paragraph = document.getElementById('p1') as Element;
    expect(paragraph.classList.contains('proso-hoverable')).toBe(true);
    expect(paragraph.classList.contains('proso-selectable')).toBe(false);

    await listener({ action: 'getParagraphs' });
    await Promise.resolve();
    jest.advanceTimersByTime(20);
    await Promise.resolve();

    expect(paragraph.classList.contains('proso-selectable')).toBe(true);
  });

  it('schedules ambient extraction through requestIdleCallback when available', () => {
    const requestIdleCallback = jest.fn(
      (callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      },
    );
    Object.defineProperty(window, 'requestIdleCallback', {
      value: requestIdleCallback,
      configurable: true,
      writable: true,
    });
    setExtractedParagraphs([document.getElementById('p2') as Element], 'selection');

    (content as { main?: (ctx?: unknown) => void }).main?.();

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    expect(getLastExtractionMode()).toBe('article');
    expect(document.getElementById('p1')?.classList.contains('proso-hoverable')).toBe(true);
  });

  it('keeps one paragraph ordering from pre-idle extraction through playback', async () => {
    const originalTexts = articleParagraphTexts();
    const listener = startContentWithMessageListener();
    setExtractedParagraphs([document.getElementById('p2') as Element], 'selection');

    const initialResponse = await listener({ action: 'getParagraphs' });
    expect(getLastExtractionMode()).toBe('article');
    expect(initialResponse).toEqual({
      paragraphs: originalTexts.map((text, index) => ({ index, text })),
    });

    jest.advanceTimersByTime(1300);
    document
      .querySelector('article')
      ?.insertAdjacentHTML('beforeend', `<p id="p4">Fourth paragraph. ${LOREM}</p>`);
    const response = await listener({
      action: 'extractText',
      mode: 'article',
      useCache: true,
    });

    expect(response).toEqual({
      text: originalTexts.join('\n\n'),
      paragraphs: originalTexts,
      mode: 'article',
    });
  });

  it('does not serve a selection cache as an article cache', async () => {
    const originalTexts = articleParagraphTexts();
    const listener = startContentWithMessageListener();
    setExtractedParagraphs([document.getElementById('p2') as Element], 'selection');

    const response = await listener({
      action: 'extractText',
      mode: 'article',
      useCache: true,
    });

    expect(response).toMatchObject({ paragraphs: originalTexts, mode: 'article' });
    expect((response as { text: string }).text).toContain(originalTexts[0]);
    expect(getLastExtractionMode()).toBe('article');
  });

  it.each([
    ['cold cache', () => setExtractedParagraphs([])],
    [
      'selection cache',
      () => setExtractedParagraphs([document.getElementById('p3') as Element], 'selection'),
    ],
  ])('refreshes %s before mapping a real paragraph click', (_name, seedCache) => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    sendMessageMock.mockClear();
    seedCache();

    document.getElementById('p2')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const paragraphClicks = paragraphClickMessages();
    expect(paragraphClicks.length).toBeGreaterThan(0);
    for (const call of paragraphClicks) {
      expect(call[0]).toMatchObject({ paragraphIndex: 1 });
    }
    expect(getLastExtractionMode()).toBe('article');
  });

  it('keeps link clicks native and ignores them as paragraph clicks', () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    jest.advanceTimersByTime(1300);
    sendMessageMock.mockClear();

    const link = document.getElementById('link') as Element;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(sendMessageMock.mock.calls).toHaveLength(0);
  });

  it('ignores the terminating click of a drag text-selection', () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    jest.advanceTimersByTime(1300);
    sendMessageMock.mockClear();

    setSelection({ isCollapsed: false });
    const p1 = document.getElementById('p1') as Element;
    p1.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(sendMessageMock.mock.calls).toHaveLength(0);
  });
});
