/**
 * Playback Handlers Unit Tests
 *
 * Tests for playback message handlers registered on the HandlerRegistry.
 * Validates that each handler correctly delegates to PlaybackService,
 * performs parameter validation, and returns proper Result types.
 *
 * @module tests/unit/handlers/playback.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks – must be declared BEFORE any dynamic imports
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPlaybackService = {
  getState: jest.fn<() => any>(),
  start: jest.fn<() => Promise<any>>(),
  pause: jest.fn<() => any>(),
  resume: jest.fn<() => Promise<any>>(),
  stop: jest.fn<() => any>(),
  next: jest.fn<() => Promise<any>>(),
  previous: jest.fn<() => Promise<any>>(),
  seekToParagraph: jest.fn<() => Promise<any>>(),
  setSpeed: jest.fn<() => any>(),
  seek: jest.fn<() => Promise<any>>(),
  resyncPosition: jest.fn<() => boolean>(),
  // PROSO-147: the real service has had this since the language feature and
  // nothing ever called it, so `detectedLanguage` stayed null for every audio
  // request. A mock that omits it is how the dead wiring stayed invisible —
  // the same shape PR #144 found with `setProvider`.
  setLanguage: jest.fn<(language: string | null) => void>(),
};

const mockGetPlaybackService = jest.fn<() => any>(() => mockPlaybackService);
const mockIsPlaybackServiceAvailable = jest.fn<() => boolean>(() => true);

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getPlaybackService: mockGetPlaybackService,
  isPlaybackServiceAvailable: mockIsPlaybackServiceAvailable,
}));

const mockTabsQuery = jest.fn<(queryInfo: any) => Promise<any[]>>();
const mockTabsSendMessage = jest.fn<(tabId: number, message: any) => Promise<any>>();

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    tabs: {
      query: mockTabsQuery,
      sendMessage: mockTabsSendMessage,
    },
  },
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER mocking
// ---------------------------------------------------------------------------

const { registerPlaybackHandlers } = await import('../../../src/handlers/playback.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Unwrap the outer dispatch Result (always Ok when handler is registered)
 * and return the inner handler result which is itself a Result.
 */
function unwrapDispatch(dispatchResult: { ok: boolean; value?: unknown; error?: unknown }): {
  ok: boolean;
  value?: any;
  error?: any;
} {
  if (!dispatchResult.ok) {
    throw new Error(`dispatch itself failed: ${JSON.stringify(dispatchResult.error)}`);
  }
  return dispatchResult.value as { ok: boolean; value?: any; error?: any };
}

/** Default playback state returned by the mock service. */
function defaultState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'playing' as const,
    currentParagraphIndex: 0,
    totalParagraphs: 5,
    progress: 0,
    speed: 1.0,
    provider: 'elevenlabs',
    voice: 'default',
    mode: 'article',
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Playback Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Defaults: service available, standard state
    mockIsPlaybackServiceAvailable.mockReturnValue(true);
    mockGetPlaybackService.mockReturnValue(mockPlaybackService);
    mockPlaybackService.getState.mockReturnValue(defaultState());

    // Default tab mock
    mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);
    mockTabsSendMessage.mockResolvedValue(null);

    // Default async method results (Ok)
    mockPlaybackService.start.mockResolvedValue({ ok: true, value: undefined });
    mockPlaybackService.pause.mockReturnValue({ ok: true, value: undefined });
    mockPlaybackService.resume.mockResolvedValue({ ok: true, value: undefined });
    mockPlaybackService.stop.mockReturnValue({ ok: true, value: undefined });
    mockPlaybackService.next.mockResolvedValue({ ok: true, value: undefined });
    mockPlaybackService.previous.mockResolvedValue({ ok: true, value: undefined });
    mockPlaybackService.seekToParagraph.mockResolvedValue({ ok: true, value: undefined });
    mockPlaybackService.setSpeed.mockReturnValue({ ok: true, value: undefined });
    mockPlaybackService.resyncPosition.mockReturnValue(true);

    // Fresh registry for every test
    registry = new HandlerRegistry();
    registerPlaybackHandlers(registry);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  describe('registration', () => {
    it('should register all 11 playback handlers plus PARAGRAPH_CLICKED', () => {
      const names = registry.getHandlerNames();
      const expected = [
        'playback.getState',
        'playback.start',
        'playback.pause',
        'playback.resume',
        'playback.stop',
        'playback.next',
        'playback.previous',
        'playback.seekToParagraph',
        'playback.resync',
        'playback.setSpeed',
        'playback.seek',
        'PARAGRAPH_CLICKED',
      ];
      for (const name of expected) {
        expect(names).toContain(name);
      }
      expect(names.filter((n: string) => n.startsWith('playback.'))).toHaveLength(11);
      expect(names).toContain('PARAGRAPH_CLICKED');
    });
  });

  // -----------------------------------------------------------------------
  // playback.getState
  // -----------------------------------------------------------------------
  describe('playback.getState', () => {
    it('should return mapped playback state on success', async () => {
      mockPlaybackService.getState.mockReturnValue(
        defaultState({ status: 'playing', currentParagraphIndex: 2, totalParagraphs: 10 }),
      );

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.status).toBe('playing');
      expect(result.value.currentParagraph).toBe(2);
      expect(result.value.totalParagraphs).toBe(10);
      expect(result.value.progress).toBe(20); // (2/10)*100
      expect(result.value.speed).toBe(1.0);
      expect(result.value.provider).toBe('elevenlabs');
    });

    it('should map idle status to stopped', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'idle' }));

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.status).toBe('stopped');
    });

    it('should map error status to stopped', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'error' }));

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.status).toBe('stopped');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when getState throws', async () => {
      mockPlaybackService.getState.mockImplementation(() => {
        throw new Error('unexpected boom');
      });

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('unexpected boom');
    });

    it('should return progress 0 when totalParagraphs is 0', async () => {
      mockPlaybackService.getState.mockReturnValue(
        defaultState({ totalParagraphs: 0, currentParagraphIndex: 0 }),
      );

      const raw = await registry.dispatch('playback.getState', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.progress).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // playback.start
  // -----------------------------------------------------------------------
  describe('playback.start', () => {
    it('should start playback with provided paragraphs and tabId', async () => {
      const params = {
        paragraphs: ['Hello world', 'Second paragraph'],
        tabId: 99,
        pageUrl: 'https://example.com',
      };

      const raw = await registry.dispatch('playback.start', params);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        params.paragraphs,
        99,
        'https://example.com',
      );
    });

    it('should extract text from active tab when no paragraphs provided', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { paragraphs: ['Extracted text'] };
        }
        return null;
      });

      const raw = await registry.dispatch('playback.start', {});
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        ['Extracted text'],
        42,
        'https://example.com/page',
      );
    });

    it('should return error when no active tab found', async () => {
      mockTabsQuery.mockResolvedValue([]);

      const raw = await registry.dispatch('playback.start', {});
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBe('No active tab');
    });

    it('should return error when text extraction fails', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockResolvedValue(null);

      const raw = await registry.dispatch('playback.start', {});
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBe('Failed to extract text');
    });

    it('should return error when extracted paragraphs are empty', async () => {
      mockTabsSendMessage.mockResolvedValue({ paragraphs: [] });

      const raw = await registry.dispatch('playback.start', {});
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBe('No text found on page');
    });

    it('should propagate PlaybackService start error', async () => {
      mockPlaybackService.start.mockResolvedValue({
        ok: false,
        error: { type: 'no_content', mode: 'article' },
      });

      const raw = await registry.dispatch('playback.start', {
        paragraphs: ['Some text'],
        tabId: 1,
        pageUrl: 'https://example.com',
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('No content found');
    });

    it('should send FOOTER_SHOW to content script before starting', async () => {
      const params = {
        paragraphs: ['Hello'],
        tabId: 99,
        pageUrl: 'https://example.com',
      };

      await registry.dispatch('playback.start', params);

      // Verify FOOTER_SHOW was sent
      const footerCall = mockTabsSendMessage.mock.calls.find(
        (call: any[]) => call[1]?.action === 'FOOTER_SHOW',
      );
      expect(footerCall).toBeDefined();
      expect(footerCall![0]).toBe(99);
    });

    it('should default extraction mode to article', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { paragraphs: ['Article text'] };
        }
        return null;
      });

      await registry.dispatch('playback.start', {});

      const extractCall = mockTabsSendMessage.mock.calls.find(
        (call: any[]) => call[1]?.action === 'extractText',
      );
      expect(extractCall![1].mode).toBe('article');
    });

    it('should forward mode=selection to the content script extractText call', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { text: 'Selected words', paragraphs: ['Selected words'] };
        }
        return null;
      });

      const raw = await registry.dispatch('playback.start', { mode: 'selection' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      const extractCall = mockTabsSendMessage.mock.calls.find(
        (call: any[]) => call[1]?.action === 'extractText',
      );
      expect(extractCall![1].mode).toBe('selection');
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        ['Selected words'],
        42,
        'https://example.com',
      );
    });

    it('gives PlaybackService the language it shows in the footer (PROSO-147)', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockResolvedValue({ paragraphs: ['Some article text'] });

      const raw = await registry.dispatch('playback.start', {});
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      // The setter existed and nothing called it, so every request carried a
      // null language. Managed providers chose a voice server-side and hid it;
      // the reader's own host declines an undetermined language, so the local
      // route answered "Language not supported: und" for every article.
      const footerCall = mockTabsSendMessage.mock.calls.find(
        (call: any[]) => call[1]?.action === 'FOOTER_LANGUAGE_UPDATE',
      );
      expect(footerCall).toBeDefined();
      expect(mockPlaybackService.setLanguage).toHaveBeenCalledWith(footerCall![1].languageCode);
      // Nothing detected for this tab: the product default, not null.
      expect(mockPlaybackService.setLanguage).toHaveBeenCalledWith('en');
    });

    it('should fall back to splitting raw selection text when paragraphs are empty', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          // Selection that does not map to whole block elements: empty
          // paragraphs but raw text present.
          return { text: 'First chunk\n\nSecond chunk', paragraphs: [] };
        }
        return null;
      });

      const raw = await registry.dispatch('playback.start', { mode: 'selection' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        ['First chunk', 'Second chunk'],
        42,
        'https://example.com',
      );
    });

    it('should read a single-line selection as one paragraph', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { text: '  just one sentence  ', paragraphs: [] };
        }
        return null;
      });

      const raw = await registry.dispatch('playback.start', { mode: 'selection' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        ['just one sentence'],
        42,
        'https://example.com',
      );
    });

    it('should report no text when selection text is empty and no paragraphs', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { text: '   ', paragraphs: [] };
        }
        return null;
      });

      const raw = await registry.dispatch('playback.start', { mode: 'selection' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBe('No text found on page');
    });

    it('should reject an invalid mode value', async () => {
      const raw = await registry.dispatch('playback.start', { mode: 'bogus' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.start', {
        paragraphs: ['text'],
        tabId: 1,
        pageUrl: 'url',
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when an unexpected error is thrown', async () => {
      mockPlaybackService.start.mockRejectedValue(new Error('crash'));

      const raw = await registry.dispatch('playback.start', {
        paragraphs: ['text'],
        tabId: 1,
        pageUrl: 'url',
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('crash');
    });
  });

  // -----------------------------------------------------------------------
  // playback.pause
  // -----------------------------------------------------------------------
  describe('playback.pause', () => {
    it('should pause playback successfully', async () => {
      const raw = await registry.dispatch('playback.pause', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.pause).toHaveBeenCalled();
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.pause', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when pause throws', async () => {
      mockPlaybackService.pause.mockImplementation(() => {
        throw new Error('cannot pause');
      });

      const raw = await registry.dispatch('playback.pause', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('cannot pause');
    });
  });

  // -----------------------------------------------------------------------
  // playback.resume
  // -----------------------------------------------------------------------
  describe('playback.resume', () => {
    it('should resume playback successfully', async () => {
      const raw = await registry.dispatch('playback.resume', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.resume).toHaveBeenCalled();
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.resume', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should propagate resume failure from service', async () => {
      mockPlaybackService.resume.mockResolvedValue({
        ok: false,
        error: { type: 'playback_failed', reason: 'Not paused' },
      });

      const raw = await registry.dispatch('playback.resume', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Not paused');
    });

    it('should return operation_failed when resume throws', async () => {
      mockPlaybackService.resume.mockRejectedValue(new Error('resume crash'));

      const raw = await registry.dispatch('playback.resume', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.stop
  // -----------------------------------------------------------------------
  describe('playback.stop', () => {
    it('should stop playback successfully', async () => {
      const raw = await registry.dispatch('playback.stop', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.stop).toHaveBeenCalled();
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.stop', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when stop throws', async () => {
      mockPlaybackService.stop.mockImplementation(() => {
        throw new Error('stop failed');
      });

      const raw = await registry.dispatch('playback.stop', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('stop failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.next
  // -----------------------------------------------------------------------
  describe('playback.next', () => {
    it('should skip to next paragraph and return currentParagraph', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ currentParagraphIndex: 3 }));

      const raw = await registry.dispatch('playback.next', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.currentParagraph).toBe(3);
      expect(mockPlaybackService.next).toHaveBeenCalled();
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.next', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should propagate next failure from service', async () => {
      mockPlaybackService.next.mockResolvedValue({
        ok: false,
        error: { type: 'invalid_paragraph_index', index: 10, max: 5 },
      });

      const raw = await registry.dispatch('playback.next', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Invalid paragraph index');
    });

    it('should return operation_failed when next throws', async () => {
      mockPlaybackService.next.mockRejectedValue(new Error('next crash'));

      const raw = await registry.dispatch('playback.next', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.previous
  // -----------------------------------------------------------------------
  describe('playback.previous', () => {
    it('should skip to previous paragraph and return currentParagraph', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ currentParagraphIndex: 1 }));

      const raw = await registry.dispatch('playback.previous', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.currentParagraph).toBe(1);
      expect(mockPlaybackService.previous).toHaveBeenCalled();
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.previous', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should propagate previous failure from service', async () => {
      mockPlaybackService.previous.mockResolvedValue({
        ok: false,
        error: { type: 'playback_failed', reason: 'Already at start' },
      });

      const raw = await registry.dispatch('playback.previous', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Already at start');
    });

    it('should return operation_failed when previous throws', async () => {
      mockPlaybackService.previous.mockRejectedValue(new Error('previous crash'));

      const raw = await registry.dispatch('playback.previous', undefined);
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.seekToParagraph
  // -----------------------------------------------------------------------
  describe('playback.seekToParagraph', () => {
    it('should seek to the given paragraph index', async () => {
      const raw = await registry.dispatch('playback.seekToParagraph', {
        paragraphIndex: 4,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.currentParagraph).toBe(4);
      expect(mockPlaybackService.seekToParagraph).toHaveBeenCalledWith(4);
    });

    it('should return invalid_params when paragraphIndex is not a number', async () => {
      const raw = await registry.dispatch('playback.seekToParagraph', {
        paragraphIndex: 'three',
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.seekToParagraph', {
        paragraphIndex: 0,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should propagate seekToParagraph failure from service', async () => {
      mockPlaybackService.seekToParagraph.mockResolvedValue({
        ok: false,
        error: { type: 'invalid_paragraph_index', index: 100, max: 5 },
      });

      const raw = await registry.dispatch('playback.seekToParagraph', {
        paragraphIndex: 100,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Invalid paragraph index 100');
    });

    it('should return operation_failed when seekToParagraph throws', async () => {
      mockPlaybackService.seekToParagraph.mockRejectedValue(new Error('seek crash'));

      const raw = await registry.dispatch('playback.seekToParagraph', {
        paragraphIndex: 2,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.resync
  // -----------------------------------------------------------------------
  describe('playback.resync', () => {
    it('should push the position when the tab being read into asks', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ activeTabId: 42 }));
      mockPlaybackService.resyncPosition.mockReturnValue(true);

      const raw = await registry.dispatch('playback.resync', { __tabId: 42 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true, resynced: true });
      expect(mockPlaybackService.resyncPosition).toHaveBeenCalledTimes(1);
    });

    it('should report no resync when the service has no position to send', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ activeTabId: 42 }));
      mockPlaybackService.resyncPosition.mockReturnValue(false);

      const raw = await registry.dispatch('playback.resync', { __tabId: 42 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true, resynced: false });
    });

    it('should not send another tab its position', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ activeTabId: 42 }));

      const raw = await registry.dispatch('playback.resync', { __tabId: 7 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true, resynced: false });
      expect(mockPlaybackService.resyncPosition).not.toHaveBeenCalled();
    });

    it('should answer a caller with no tab id, such as the popup', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ activeTabId: 42 }));
      mockPlaybackService.resyncPosition.mockReturnValue(true);

      const raw = await registry.dispatch('playback.resync', { reason: 'visibilitychange' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true, resynced: true });
    });

    it('should return service_unavailable when playback is not initialized', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.resync', { __tabId: 42 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return invalid_params when the tab id is not a tab id', async () => {
      const raw = await registry.dispatch('playback.resync', { __tabId: -3 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return operation_failed when the service throws', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ activeTabId: 42 }));
      mockPlaybackService.resyncPosition.mockImplementation(() => {
        throw new Error('resync crash');
      });

      const raw = await registry.dispatch('playback.resync', { __tabId: 42 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // playback.setSpeed
  // -----------------------------------------------------------------------
  describe('playback.setSpeed', () => {
    it('should set speed to a valid value', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 1.5 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(mockPlaybackService.setSpeed).toHaveBeenCalledWith(1.5);
    });

    it('should accept boundary value 0.5', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 0.5 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
    });

    it('should accept boundary value 2.0', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 2.0 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
    });

    it('should return invalid_params when speed is below 0.5', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 0.3 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return invalid_params when speed is above 2.0', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 3.0 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return invalid_params when speed is not a number', async () => {
      const raw = await registry.dispatch('playback.setSpeed', { speed: 'fast' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.setSpeed', { speed: 1.0 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when setSpeed throws', async () => {
      mockPlaybackService.setSpeed.mockImplementation(() => {
        throw new Error('speed crash');
      });

      const raw = await registry.dispatch('playback.setSpeed', { speed: 1.0 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('speed crash');
    });
  });

  // -----------------------------------------------------------------------
  // playback.seek
  // -----------------------------------------------------------------------
  describe('playback.seek', () => {
    it('should convert progress percentage to paragraph index and seek', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ totalParagraphs: 10 }));

      const raw = await registry.dispatch('playback.seek', { progress: 50 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      // 50% of 10 paragraphs = index 5
      expect(result.value.currentParagraph).toBe(5);
      expect(mockPlaybackService.seekToParagraph).toHaveBeenCalledWith(5);
    });

    it('should handle progress 0 (beginning)', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ totalParagraphs: 10 }));

      const raw = await registry.dispatch('playback.seek', { progress: 0 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.currentParagraph).toBe(0);
    });

    it('should handle progress 100 (end)', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ totalParagraphs: 10 }));

      const raw = await registry.dispatch('playback.seek', { progress: 100 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      // 100% of 10 = 10 (floor)
      expect(result.value.currentParagraph).toBe(10);
    });

    it('should handle 0 totalParagraphs gracefully', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ totalParagraphs: 0 }));

      const raw = await registry.dispatch('playback.seek', { progress: 50 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.currentParagraph).toBe(0);
    });

    it('should return invalid_params when progress is below 0', async () => {
      const raw = await registry.dispatch('playback.seek', { progress: -1 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return invalid_params when progress is above 100', async () => {
      const raw = await registry.dispatch('playback.seek', { progress: 101 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return invalid_params when progress is not a number', async () => {
      const raw = await registry.dispatch('playback.seek', { progress: 'halfway' });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('invalid_params');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('playback.seek', { progress: 50 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should propagate seekToParagraph failure', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ totalParagraphs: 10 }));
      mockPlaybackService.seekToParagraph.mockResolvedValue({
        ok: false,
        error: { type: 'invalid_paragraph_index', index: 5, max: 4 },
      });

      const raw = await registry.dispatch('playback.seek', { progress: 50 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Invalid paragraph index');
    });

    it('should return operation_failed when seek throws', async () => {
      mockPlaybackService.getState.mockImplementation(() => {
        throw new Error('state crash');
      });

      const raw = await registry.dispatch('playback.seek', { progress: 50 });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
    });
  });

  // -----------------------------------------------------------------------
  // PARAGRAPH_CLICKED
  // -----------------------------------------------------------------------
  describe('PARAGRAPH_CLICKED', () => {
    it('should start playback and seek to clicked paragraph when idle', async () => {
      // Service starts idle
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'idle' }));
      // Tab with paragraphs
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { paragraphs: ['p0', 'p1', 'p2', 'p3', 'p4'] };
        }
        return null;
      });

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 3,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.playbackStarted).toBe(true);
      expect(mockPlaybackService.start).toHaveBeenCalledWith(
        ['p0', 'p1', 'p2', 'p3', 'p4'],
        42,
        'https://example.com',
      );
      expect(mockPlaybackService.seekToParagraph).toHaveBeenCalledWith(3);
    });

    it('should start playback at paragraph 0 without seeking', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'idle' }));
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { paragraphs: ['p0', 'p1'] };
        }
        return null;
      });

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 0,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      // Should NOT call seekToParagraph for paragraph 0
      expect(mockPlaybackService.seekToParagraph).not.toHaveBeenCalled();
    });

    it('should seek to paragraph when already playing', async () => {
      // Already playing with 5 paragraphs
      mockPlaybackService.getState.mockReturnValue(
        defaultState({ status: 'playing', totalParagraphs: 5 }),
      );

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 2,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.playbackStarted).toBe(true);
      // Should NOT call start — just seek
      expect(mockPlaybackService.start).not.toHaveBeenCalled();
      expect(mockPlaybackService.seekToParagraph).toHaveBeenCalledWith(2);
    });

    it('should return error when no active tab', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'idle' }));
      mockTabsQuery.mockResolvedValue([]);

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 0,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('No active tab');
    });

    it('should return error when text extraction fails', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'stopped' }));
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockResolvedValue(null);

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 0,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Failed to extract text');
    });

    it('should return error for invalid paragraph index when idle', async () => {
      mockPlaybackService.getState.mockReturnValue(defaultState({ status: 'idle' }));
      mockTabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
      mockTabsSendMessage.mockImplementation(async (_tabId: number, msg: any) => {
        if (msg.action === 'extractText') {
          return { paragraphs: ['p0', 'p1'] };
        }
        return null;
      });

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 10,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Invalid paragraph index');
    });

    it('should return error for invalid paragraph index when playing', async () => {
      mockPlaybackService.getState.mockReturnValue(
        defaultState({ status: 'playing', totalParagraphs: 3 }),
      );

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 5,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('Invalid paragraph index');
    });

    it('should return service_unavailable when service is not available', async () => {
      mockIsPlaybackServiceAvailable.mockReturnValue(false);

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 0,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('service_unavailable');
    });

    it('should return operation_failed when an unexpected error is thrown', async () => {
      mockPlaybackService.getState.mockImplementation(() => {
        throw new Error('unexpected crash');
      });

      const raw = await registry.dispatch('PARAGRAPH_CLICKED', {
        paragraphIndex: 0,
        isCached: false,
      });
      const result = unwrapDispatch(raw);

      expect(result.ok).toBe(false);
      expect(result.error.type).toBe('operation_failed');
      expect(result.error.message).toBe('unexpected crash');
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: dispatch for unregistered handler
  // -----------------------------------------------------------------------
  describe('dispatch unknown handler', () => {
    it('should return not_found for unregistered handler', async () => {
      const raw = await registry.dispatch('playback.nonexistent', undefined);

      expect(raw.ok).toBe(false);
      if (!raw.ok) {
        expect(raw.error.type).toBe('not_found');
      }
    });
  });
});
