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
  getExtractedParagraphs,
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

// Disconnect observers from the previous content-script world between cases.
const observers = new Set<MutationObserver>();
const NativeMutationObserver = window.MutationObserver;
window.MutationObserver = class extends NativeMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    observers.add(this);
  }
};

// Force the setTimeout scheduling branch so fake timers can advance it
// (production Firefox takes the requestIdleCallback branch of the same call).
Object.defineProperty(window, 'requestIdleCallback', {
  value: undefined,
  configurable: true,
  writable: true,
});

const storageGetMock = browser.storage.local.get as unknown as jest.Mock<
  (key: unknown) => Promise<Record<string, unknown>>
>;
type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
const storageListenerMock = browser.storage.onChanged.addListener as unknown as jest.Mock<
  (listener: StorageListener) => void
>;
const documentListeners = jest.spyOn(document, 'addEventListener');

function changeOrigins(value: unknown, area = 'local'): void {
  const listeners = storageListenerMock.mock.calls;
  const listener = listeners[listeners.length - 1]?.[0];
  if (!listener) throw new Error('storage listener was not registered');
  listener({ hoverPlayOrigins: { newValue: value } }, area);
}

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

async function hoverSecondParagraph(): Promise<HTMLButtonElement> {
  startContentWithMessageListener();
  await Promise.resolve();
  jest.advanceTimersByTime(1300);
  document.getElementById('p2')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const control = document.querySelector<HTMLButtonElement>('.proso-hover-play-icon');
  expect(control).not.toBeNull();
  return control!;
}

describe('content main() — ambient hover-play (Feature 229)', () => {
  beforeEach(() => {
    for (const [type, listener, options] of documentListeners.mock.calls) {
      document.removeEventListener(type, listener, options);
    }
    documentListeners.mockClear();
    storageListenerMock.mockClear();
    storageGetMock.mockReset();
    storageGetMock.mockResolvedValue({ hoverPlayOrigins: [window.location.origin] });
    for (const observer of observers) observer.disconnect();
    observers.clear();
    // The shared control is attached outside body to escape host clipping.
    document.querySelectorAll('.proso-hover-play-icon').forEach((node) => node.remove());
    jest.clearAllTimers();
    // main() is idempotence-guarded per page; reset the guard so each test
    // drives a fresh main(); document listeners were detached above.
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

  it('leaves a first-visit text-rich page unmarked at idle', async () => {
    storageGetMock.mockResolvedValue({});
    (content as { main?: (ctx?: unknown) => void }).main?.();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
  });

  it('does not mark or start playback on unengaged prose clicks or mutations', async () => {
    storageGetMock.mockResolvedValue({ hoverPlayOrigins: ['https://unrelated.example'] });
    startContentWithMessageListener();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    document.querySelector('article')?.insertAdjacentHTML('beforeend', `<h1>${LOREM}</h1>`);
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    document.getElementById('p2')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
    expect(getExtractedParagraphs()).toHaveLength(0);
    expect(paragraphClickMessages()).toHaveLength(0);
  });

  it('marks the current article when reading engages its origin, even with the footer visible', async () => {
    storageGetMock.mockResolvedValue({});
    const listener = startContentWithMessageListener();
    await Promise.resolve();
    await listener({ action: 'extractText', mode: 'article' });
    await listener({ action: 'FOOTER_SHOW' });
    const paragraphs = [...getExtractedParagraphs()];
    try {
      changeOrigins([window.location.origin], 'sync');
      jest.advanceTimersByTime(1300);
      expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
      changeOrigins([window.location.origin]);
      jest.advanceTimersByTime(1300);
      expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(3);
      expect(getExtractedParagraphs()).toEqual(paragraphs);
      changeOrigins(undefined);
      expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
    } finally {
      await listener({ action: 'FOOTER_HIDE' });
    }
  });

  it.each(['extractText', 'getParagraphs', 'getArticleText'])(
    'marks a late article cache from %s after engagement arrived with the footer visible',
    async (action) => {
      storageGetMock.mockResolvedValue({});
      const listener = startContentWithMessageListener();
      await Promise.resolve();
      await listener({ action: 'FOOTER_SHOW' });
      try {
        changeOrigins([window.location.origin]);
        jest.advanceTimersByTime(1300);
        expect(getExtractedParagraphs()).toHaveLength(0);
        await listener({ action, mode: 'article' });
        jest.advanceTimersByTime(1300);
        expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(3);
        expect(getExtractedParagraphs()).toEqual(
          ['p1', 'p2', 'p3'].map((id) => document.getElementById(id)),
        );
        changeOrigins([]);
        expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
      } finally {
        await listener({ action: 'FOOTER_HIDE' });
      }
    },
  );

  it('leaves explicit extraction on an unengaged origin without ambient paint', async () => {
    storageGetMock.mockResolvedValue({});
    const listener = startContentWithMessageListener();
    await Promise.resolve();
    await listener({ action: 'extractText', mode: 'article' });
    jest.advanceTimersByTime(1300);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
  });

  it('keeps ambient marking when playback removes the explicit selection controls', async () => {
    const listener = startContentWithMessageListener();
    await Promise.resolve();
    await listener({ action: 'getParagraphs' });
    jest.advanceTimersByTime(1300);
    await listener({ action: 'disableSelectionMode' });
    expect(document.querySelectorAll('.proso-selectable, .proso-play-icon')).toHaveLength(0);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(3);
  });

  it('offers one play control for an engaged paragraph and removes it on eviction', async () => {
    const control = await hoverSecondParagraph();
    const paragraph = document.getElementById('p2') as HTMLElement;
    expect(control?.hidden).toBe(false);
    expect(control?.getAttribute('aria-label')).toBe('Play from paragraph');
    expect(paragraph.contains(control)).toBe(false);
    control?.click();
    expect(paragraphClickMessages()).toHaveLength(1);
    expect(paragraphClickMessages()[0][0]).toMatchObject({ paragraphIndex: 1 });
    changeOrigins([]);
    expect(control?.hidden).toBe(true);
    control?.click();
    expect(paragraphClickMessages()).toHaveLength(1);
  });

  it('keeps the control reachable across its gutter and dismisses it on Escape or scroll', async () => {
    const control = await hoverSecondParagraph();
    const paragraph = document.getElementById('p2') as HTMLElement;
    paragraph.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    );
    document.body.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    jest.advanceTimersByTime(100);
    expect(control.hidden).toBe(false);
    control.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    jest.advanceTimersByTime(200);
    expect(control.hidden).toBe(false);
    control.focus();
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(control.hidden).toBe(true);
    paragraph.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    document.dispatchEvent(new Event('scroll'));
    expect(control.hidden).toBe(true);
    expect(paragraph.classList.contains('proso-hover-active')).toBe(false);
  });

  it('shows no play control on first-visit hover or a native link', async () => {
    storageGetMock.mockResolvedValue({});
    startContentWithMessageListener();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    document.getElementById('p2')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(document.querySelector('.proso-hover-play-icon')).toBeNull();
    changeOrigins([window.location.origin]);
    jest.advanceTimersByTime(1300);
    document
      .getElementById('link')
      ?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(document.querySelector('.proso-hover-play-icon')).toBeNull();
  });

  it('keeps a newer engagement event when the initial storage read resolves late', async () => {
    let resolveStorage: (value: Record<string, unknown>) => void = () => {};
    storageGetMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStorage = resolve;
      }),
    );
    startContentWithMessageListener();
    changeOrigins([window.location.origin]);
    resolveStorage({});
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(3);
  });

  it('rechecks engagement before a queued idle pass can mark', async () => {
    startContentWithMessageListener();
    await Promise.resolve();
    changeOrigins([]);
    jest.advanceTimersByTime(1300);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
  });

  it('marks newly routed prose on an engaged origin', async () => {
    startContentWithMessageListener();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    document
      .querySelector('article')
      ?.insertAdjacentHTML('beforeend', `<p id="routed">Routed paragraph. ${LOREM}</p>`);
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('routed')?.classList.contains('proso-hoverable')).toBe(true);
  });

  it('fails closed when origin storage cannot be read', async () => {
    storageGetMock.mockRejectedValue(new Error('storage unavailable'));
    startContentWithMessageListener();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    expect(document.querySelectorAll('.proso-hoverable')).toHaveLength(0);
  });

  it('marks extracted paragraphs at idle and starts playback on paragraph click', async () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    await Promise.resolve();
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
    await Promise.resolve();
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

  it('schedules ambient extraction through requestIdleCallback when available', async () => {
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
    await Promise.resolve();

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    expect(getLastExtractionMode()).toBe('article');
    expect(document.getElementById('p1')?.classList.contains('proso-hoverable')).toBe(true);
  });

  it('keeps one paragraph ordering from pre-idle extraction through playback', async () => {
    const originalTexts = articleParagraphTexts();
    const listener = startContentWithMessageListener();
    await Promise.resolve();
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
    await Promise.resolve();
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
  ])('refreshes %s before mapping a real paragraph click', async (_name, seedCache) => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    await Promise.resolve();
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

  it('keeps link clicks native and ignores them as paragraph clicks', async () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    sendMessageMock.mockClear();

    const link = document.getElementById('link') as Element;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(sendMessageMock.mock.calls).toHaveLength(0);
  });

  it('ignores the terminating click of a drag text-selection', async () => {
    (content as { main?: (ctx?: unknown) => void }).main?.();
    await Promise.resolve();
    jest.advanceTimersByTime(1300);
    sendMessageMock.mockClear();

    setSelection({ isCollapsed: false });
    const p1 = document.getElementById('p1') as Element;
    p1.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(sendMessageMock.mock.calls).toHaveLength(0);
  });

  it('rechecks active reading when a queued routed-content idle pass executes', async () => {
    const idleCallbacks: Array<() => void> = [];
    window.requestIdleCallback = (callback) => {
      idleCallbacks.push(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
      return idleCallbacks.length;
    };
    const listener = startContentWithMessageListener();
    await Promise.resolve();
    idleCallbacks.shift()?.();
    const originalParagraphs = [...getExtractedParagraphs()];
    document
      .querySelector('article')
      ?.insertAdjacentHTML('beforeend', `<p id="routed">Routed paragraph. ${LOREM}</p>`);
    await Promise.resolve(); // deliver MutationObserver records
    jest.advanceTimersByTime(1500); // queue, but do not execute, the idle pass
    expect(idleCallbacks.length).toBeGreaterThan(0);

    await listener({ action: 'FOOTER_SHOW' });
    expect(document.querySelector('#proso-sticky-footer')).not.toBeNull();
    try {
      for (const callback of idleCallbacks) callback();
      expect(getExtractedParagraphs()).toEqual(originalParagraphs);
      expect(document.getElementById('routed')?.classList.contains('proso-hoverable')).toBe(false);
    } finally {
      await listener({ action: 'FOOTER_HIDE' });
    }
  });
});
