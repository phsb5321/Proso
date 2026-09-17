/**
 * Highlight Wire-Message Contract Tests (T013)
 *
 * Verifies the exact message shapes the real HighlightSyncAdapter places on
 * the wire via browser.tabs.sendMessage. These guard the content-script
 * contract: the adapter must emit `index` (NOT `paragraphIndex`) for highlight
 * messages, and footer-state updates must carry string `currentTime`/`totalTime`
 * (NOT a `currentText` field).
 *
 * @module tests/contract/highlight-message.contract
 * @feature 062-hexagonal-wiring-recovery
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HighlightSyncAdapter } from '../../src/adapters/messaging/highlight-sync.adapter';
import type { FooterState } from '../../src/ports/highlight-sync.port';
import { isOk } from '../../src/core/shared/result';

/**
 * Minimal typed view of the globals the adapter reaches for.
 * jest-webextension-mock provides `browser`; we replace the two methods the
 * adapter calls so we can capture and assert the payloads.
 */
declare const browser: {
  tabs: { sendMessage: jest.Mock };
  runtime: { sendMessage: jest.Mock };
};

describe('HighlightSyncAdapter wire-message contract (T013)', () => {
  let adapter: HighlightSyncAdapter;
  const tabId = 42;

  beforeEach(() => {
    adapter = new HighlightSyncAdapter();
    // Capture outbound messages; resolve so the adapter returns Ok.
    browser.tabs.sendMessage = jest.fn(async () => undefined);
    // updateFooterState also broadcasts to the popup via runtime.sendMessage.
    browser.runtime.sendMessage = jest.fn(async () => undefined);
  });

  describe('highlightParagraph()', () => {
    it('emits a highlight message keyed by `index`, not `paragraphIndex`', async () => {
      const timestamp = 1_700_000_000_000;
      const result = await adapter.highlightParagraph(tabId, 3, true, 'Some text', timestamp);

      expect(isOk(result)).toBe(true);
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);

      const [sentTabId, message] = browser.tabs.sendMessage.mock.calls[0] as [
        number,
        Record<string, unknown>,
      ];
      expect(sentTabId).toBe(tabId);
      expect(message).toEqual({
        type: 'highlight',
        index: 3,
        text: 'Some text',
        timestamp,
        scroll: true,
      });
      // Regression guard: the legacy `paragraphIndex` key must be gone.
      expect(message).not.toHaveProperty('paragraphIndex');
    });
  });

  describe('updateFooterState()', () => {
    it('carries string currentTime/totalTime and no currentText field', async () => {
      const state: FooterState = {
        status: 'playing',
        currentIndex: 2,
        totalParagraphs: 10,
        progress: 0.5,
        currentTime: '1:30',
        totalTime: '5:00',
        speed: 1.25,
        voice: null,
      };

      const result = await adapter.updateFooterState(tabId, state);

      expect(isOk(result)).toBe(true);
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);

      const [sentTabId, message] = browser.tabs.sendMessage.mock.calls[0] as [
        number,
        Record<string, unknown>,
      ];
      expect(sentTabId).toBe(tabId);
      expect(message.type).toBe('FOOTER_STATE_UPDATE');

      // currentTime / totalTime must be present and string-typed.
      expect(typeof message.currentTime).toBe('string');
      expect(typeof message.totalTime).toBe('string');
      expect(message.currentTime).toBe('1:30');
      expect(message.totalTime).toBe('5:00');

      // Regression guard: no `currentText` field on the footer payload.
      expect(message).not.toHaveProperty('currentText');
    });

    it('sends progress as the percentage the footer draws with', async () => {
      // FooterState.progress is a 0-1 fraction; the footer writes what it
      // receives straight into a CSS width and reports it as a 0-100 slider
      // value. Sending the fraction through drew every bar under 1% wide.
      const state: FooterState = {
        status: 'playing',
        currentIndex: 5,
        totalParagraphs: 10,
        progress: 0.42,
        currentTime: '1:03',
        totalTime: '2:30',
        speed: 1.0,
        voice: 'voice-river',
      };

      await adapter.updateFooterState(tabId, state);

      const [, message] = browser.tabs.sendMessage.mock.calls[0] as [
        number,
        Record<string, unknown>,
      ];
      expect(message.progress).toBeCloseTo(42);
      expect(message.voice).toBe('voice-river');

      // The popup reads the same fraction and does its own conversion.
      const [broadcast] = browser.runtime.sendMessage.mock.calls[0] as [
        { state: Record<string, unknown> },
      ];
      expect(broadcast.state.progress).toBe(42);
    });
  });
});
