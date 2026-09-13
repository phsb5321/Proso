// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for footer message handlers.
 *
 * Tests all six footer handlers registered via registerFooterHandlers:
 *   - footer.show
 *   - footer.hide
 *   - footer.stateUpdate
 *   - footer.action
 *   - footer.visibilityChanged
 *   - footer.positionChanged
 *
 * Footer handlers return raw objects (FooterOperationResponse /
 * FooterActionResponse) — NOT Result<>. They use module-level DI via
 * setHighlightSync() and setActiveTabId().
 *
 * @module tests/unit/handlers/footer.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { IHighlightSynchronizer } from '../../../src/ports/highlight-sync.port';
import type {
  FooterOperationResponse,
  FooterActionResponse,
} from '../../../src/handlers/footer.handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic imports)
// ---------------------------------------------------------------------------

// footer.handlers.ts does not import wxt/browser directly, but keep mock
// in case transitive deps pull it in.
jest.unstable_mockModule('wxt/browser', () => ({
  browser: { tabs: { sendMessage: jest.fn() } },
}));

// Mock composition module for footer.action handler (T025)
const mockResult = { ok: true as const, value: {} };
const mockPlaybackService = {
  pause: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  resume: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  stop: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  next: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  previous: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  seekToParagraph: jest.fn<() => Promise<typeof mockResult>>().mockResolvedValue(mockResult),
  setSpeed: jest.fn(),
  getState: jest.fn().mockReturnValue({ status: 'idle' }),
};

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getPlaybackService: jest.fn(() => mockPlaybackService),
  isPlaybackServiceAvailable: jest.fn(() => true),
}));

// Dynamic imports after mocks are wired
const { registerFooterHandlers, setHighlightSync, setActiveTabId } = await import(
  '../../../src/handlers/footer.handlers'
);
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Mock IHighlightSynchronizer factory
// ---------------------------------------------------------------------------

function createMockHighlightSync(): jest.Mocked<IHighlightSynchronizer> {
  return {
    highlightParagraph: jest.fn(),
    highlightWord: jest.fn(),
    clearHighlights: jest.fn(),
    showFooter: jest.fn(),
    hideFooter: jest.fn(),
    updateFooterState: jest.fn(),
  } as unknown as jest.Mocked<IHighlightSynchronizer>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResult<T>(value: T) {
  return { ok: true as const, value };
}

function errResult<E>(error: E) {
  return { ok: false as const, error };
}

/**
 * Unwrap the dispatch envelope returned by registry.dispatch().
 * The registry wraps every handler return in its own Result. This helper
 * asserts the outer dispatch succeeded and returns the inner value.
 */
function unwrapDispatch<T>(outer: { ok: boolean; value?: T; error?: unknown }): T {
  expect(outer.ok).toBe(true);
  if (!outer.ok) throw new Error('dispatch failed');
  return (outer as { ok: true; value: T }).value;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('footer.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockSync: jest.Mocked<IHighlightSynchronizer>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    mockSync = createMockHighlightSync();

    // Inject dependencies via module-level DI
    setHighlightSync(mockSync);
    setActiveTabId(42);

    registerFooterHandlers(registry);
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all six footer handlers', () => {
      expect(registry.has('footer.show')).toBe(true);
      expect(registry.has('footer.hide')).toBe(true);
      expect(registry.has('footer.stateUpdate')).toBe(true);
      expect(registry.has('footer.action')).toBe(true);
      expect(registry.has('footer.visibilityChanged')).toBe(true);
      expect(registry.has('footer.positionChanged')).toBe(true);
    });

    it('should register exactly 6 handlers', () => {
      expect(registry.size).toBe(6);
    });
  });

  // -----------------------------------------------------------------------
  // footer.show
  // -----------------------------------------------------------------------

  describe('footer.show', () => {
    it('should call showFooter with the provided tabId', async () => {
      mockSync.showFooter.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.show', { tabId: 10 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockSync.showFooter).toHaveBeenCalledWith(10);
    });

    it('should fall back to activeTabId when tabId is 0 (falsy)', async () => {
      mockSync.showFooter.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.show', { tabId: 0 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      // tabId 0 is falsy, so handler falls back to activeTabId (42)
      expect(mockSync.showFooter).toHaveBeenCalledWith(42);
    });

    it('should return error when showFooter result is Err', async () => {
      mockSync.showFooter.mockResolvedValue(
        errResult({ type: 'content_script_not_loaded' as const }),
      );

      const outer = await registry.dispatch('footer.show', { tabId: 10 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('content_script_not_loaded');
    });

    it('should return error when no tabId and no activeTabId', async () => {
      setActiveTabId(null);

      const outer = await registry.dispatch('footer.show', { tabId: 0 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active tab');
    });

    it('should throw when highlightSync is not set', async () => {
      // Re-create registry without setting highlightSync
      const freshRegistry = new HandlerRegistry();
      // Set sync to null by casting - the setter only accepts IHighlightSynchronizer,
      // but we need to test the null path. Use a fresh module import approach instead:
      // We inject null via setActiveTabId pattern. The actual guard is in getHighlightSync().
      // Since we can't call setHighlightSync(null), we test that the dispatch wraps
      // the thrown error as execution_failed.
      setHighlightSync(null as unknown as IHighlightSynchronizer);
      registerFooterHandlers(freshRegistry);

      const outer = await freshRegistry.dispatch('footer.show', { tabId: 10 });

      expect(outer.ok).toBe(false);
      if (!outer.ok) {
        expect(outer.error).toEqual(
          expect.objectContaining({
            type: 'execution_failed',
            handlerName: 'footer.show',
          }),
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // footer.hide
  // -----------------------------------------------------------------------

  describe('footer.hide', () => {
    it('should call hideFooter with the provided tabId', async () => {
      mockSync.hideFooter.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.hide', { tabId: 7 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockSync.hideFooter).toHaveBeenCalledWith(7);
    });

    it('should fall back to activeTabId when tabId is falsy', async () => {
      mockSync.hideFooter.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.hide', { tabId: 0 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(mockSync.hideFooter).toHaveBeenCalledWith(42);
    });

    it('should return error when hideFooter result is Err', async () => {
      mockSync.hideFooter.mockResolvedValue(
        errResult({ type: 'message_failed' as const, message: 'tab closed' }),
      );

      const outer = await registry.dispatch('footer.hide', { tabId: 7 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('message_failed');
    });

    it('should return error when no tabId and no activeTabId', async () => {
      setActiveTabId(null);

      const outer = await registry.dispatch('footer.hide', { tabId: 0 });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active tab');
    });
  });

  // -----------------------------------------------------------------------
  // footer.stateUpdate
  // -----------------------------------------------------------------------

  describe('footer.stateUpdate', () => {
    const validParams = {
      tabId: 5,
      status: 'playing' as const,
      currentIndex: 3,
      totalParagraphs: 10,
      progress: 0.3,
      currentTime: '0:45',
      totalTime: '2:30',
      speed: 1.5,
    };

    it('should call updateFooterState with constructed FooterState', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.stateUpdate', validParams);
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(mockSync.updateFooterState).toHaveBeenCalledWith(5, {
        status: 'playing',
        currentIndex: 3,
        totalParagraphs: 10,
        progress: 0.3,
        currentTime: '0:45',
        totalTime: '2:30',
        speed: 1.5,
        voice: null,
      });
    });

    it('should fall back to activeTabId when tabId is falsy', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('footer.stateUpdate', {
        ...validParams,
        tabId: 0,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(mockSync.updateFooterState).toHaveBeenCalledWith(42, expect.any(Object));
    });

    it('should return error when updateFooterState result is Err', async () => {
      mockSync.updateFooterState.mockResolvedValue(
        errResult({ type: 'tab_not_found' as const, tabId: 5 }),
      );

      const outer = await registry.dispatch('footer.stateUpdate', validParams);
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('tab_not_found');
    });

    it('should return error when no tabId and no activeTabId', async () => {
      setActiveTabId(null);

      const outer = await registry.dispatch('footer.stateUpdate', {
        ...validParams,
        tabId: 0,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active tab');
    });

    it('should pass all footer state fields correctly', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      const pausedParams = {
        tabId: 99,
        status: 'paused' as const,
        currentIndex: 0,
        totalParagraphs: 1,
        progress: 0,
        currentTime: '0:00',
        totalTime: '0:00',
        speed: 0.5,
      };

      await registry.dispatch('footer.stateUpdate', pausedParams);

      expect(mockSync.updateFooterState).toHaveBeenCalledWith(99, {
        status: 'paused',
        currentIndex: 0,
        totalParagraphs: 1,
        progress: 0,
        currentTime: '0:00',
        totalTime: '0:00',
        speed: 0.5,
        voice: null,
      });
    });
  });

  // -----------------------------------------------------------------------
  // footer.action
  // -----------------------------------------------------------------------

  describe('footer.action', () => {
    it('should return success with the action name', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'play' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('play');
    });

    it('should handle pause action', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'pause' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('pause');
    });

    it('should handle next action', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'next' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('next');
    });

    it('should handle prev action', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'prev' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('prev');
    });

    it('should handle speed action with value', async () => {
      const outer = await registry.dispatch('footer.action', {
        action: 'speed',
        value: 2.0,
      });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('speed');
    });

    it('converts a seek percentage to a paragraph index (regression)', async () => {
      // Footer sends a 0-100 progress percentage; the handler must convert it to
      // a paragraph index, not pass the raw percent (which clamps to the last
      // paragraph). 50% of 10 paragraphs -> index 5.
      mockPlaybackService.getState.mockReturnValueOnce({
        status: 'playing',
        totalParagraphs: 10,
      });

      await registry.dispatch('footer.action', { action: 'seek', value: 50 });

      expect(mockPlaybackService.seekToParagraph).toHaveBeenCalledWith(5);
      expect(mockPlaybackService.seekToParagraph).not.toHaveBeenCalledWith(50);
    });

    it('should handle stop action', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'stop' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('stop');
    });

    it('should succeed even with an unknown action name', async () => {
      // footer.action is a passthrough — it does not validate action names
      const outer = await registry.dispatch('footer.action', {
        action: 'unknown-action',
      });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('unknown-action');
    });

    it('should not require highlightSync to be set', async () => {
      // footer.action does not call getHighlightSync() — but T025 added PlaybackService dependency
      setHighlightSync(null as unknown as IHighlightSynchronizer);

      const outer = await registry.dispatch('footer.action', { action: 'play' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
      expect(result.action).toBe('play');
    });

    it('should return error when PlaybackService is not available', async () => {
      // Temporarily override mock to return false
      const { isPlaybackServiceAvailable } = await import(resolve(srcDir, 'composition'));
      (isPlaybackServiceAvailable as jest.Mock).mockReturnValueOnce(false);

      const outer = await registry.dispatch('footer.action', { action: 'play' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('PlaybackService not available');
    });
  });

  // -----------------------------------------------------------------------
  // footer.visibilityChanged
  // -----------------------------------------------------------------------

  describe('footer.visibilityChanged', () => {
    it('should return success for minimize event', async () => {
      const outer = await registry.dispatch('footer.visibilityChanged', {
        isMinimized: true,
        isVisible: true,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return success for expand event', async () => {
      const outer = await registry.dispatch('footer.visibilityChanged', {
        isMinimized: false,
        isVisible: true,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should return success when footer becomes hidden', async () => {
      const outer = await registry.dispatch('footer.visibilityChanged', {
        isVisible: false,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should return success with empty params', async () => {
      const outer = await registry.dispatch('footer.visibilityChanged', {});
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should not require highlightSync to be set', async () => {
      setHighlightSync(null as unknown as IHighlightSynchronizer);

      const outer = await registry.dispatch('footer.visibilityChanged', {
        isMinimized: true,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // footer.positionChanged
  // -----------------------------------------------------------------------

  describe('footer.positionChanged', () => {
    it('should return success for numeric position', async () => {
      const outer = await registry.dispatch('footer.positionChanged', {
        x: 100,
        yOffset: 50,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return success for "center" x position', async () => {
      const outer = await registry.dispatch('footer.positionChanged', {
        x: 'center',
        yOffset: 0,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should return success for "left" x position', async () => {
      const outer = await registry.dispatch('footer.positionChanged', {
        x: 'left',
        yOffset: 10,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should return success for "right" x position', async () => {
      const outer = await registry.dispatch('footer.positionChanged', {
        x: 'right',
        yOffset: -5,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('should not require highlightSync to be set', async () => {
      setHighlightSync(null as unknown as IHighlightSynchronizer);

      const outer = await registry.dispatch('footer.positionChanged', {
        x: 200,
        yOffset: 30,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: highlightSync not initialized
  // -----------------------------------------------------------------------

  describe('highlightSync not initialized', () => {
    beforeEach(() => {
      setHighlightSync(null as unknown as IHighlightSynchronizer);
    });

    it('footer.show should fail via dispatch execution_failed', async () => {
      const outer = await registry.dispatch('footer.show', { tabId: 1 });

      expect(outer.ok).toBe(false);
      if (!outer.ok) {
        expect(outer.error).toEqual(
          expect.objectContaining({
            type: 'execution_failed',
            handlerName: 'footer.show',
          }),
        );
      }
    });

    it('footer.hide should fail via dispatch execution_failed', async () => {
      const outer = await registry.dispatch('footer.hide', { tabId: 1 });

      expect(outer.ok).toBe(false);
      if (!outer.ok) {
        expect(outer.error).toEqual(
          expect.objectContaining({
            type: 'execution_failed',
            handlerName: 'footer.hide',
          }),
        );
      }
    });

    it('footer.stateUpdate should fail via dispatch execution_failed', async () => {
      const outer = await registry.dispatch('footer.stateUpdate', {
        tabId: 1,
        status: 'playing',
        currentIndex: 0,
        totalParagraphs: 5,
        progress: 0,
        currentTime: '0:00',
        totalTime: '1:15',
        speed: 1,
      });

      expect(outer.ok).toBe(false);
      if (!outer.ok) {
        expect(outer.error).toEqual(
          expect.objectContaining({
            type: 'execution_failed',
            handlerName: 'footer.stateUpdate',
          }),
        );
      }
    });

    it('footer.action should still succeed (no sync dependency)', async () => {
      const outer = await registry.dispatch('footer.action', { action: 'play' });
      const result = unwrapDispatch(outer) as FooterActionResponse;

      expect(result.success).toBe(true);
    });

    it('footer.visibilityChanged should still succeed (no sync dependency)', async () => {
      const outer = await registry.dispatch('footer.visibilityChanged', {
        isMinimized: false,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });

    it('footer.positionChanged should still succeed (no sync dependency)', async () => {
      const outer = await registry.dispatch('footer.positionChanged', {
        x: 0,
        yOffset: 0,
      });
      const result = unwrapDispatch(outer) as FooterOperationResponse;

      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: activeTabId interaction
  // -----------------------------------------------------------------------

  describe('activeTabId interaction', () => {
    it('should use provided tabId over activeTabId', async () => {
      setActiveTabId(99);
      mockSync.showFooter.mockResolvedValue(okResult(undefined));

      await registry.dispatch('footer.show', { tabId: 55 });

      expect(mockSync.showFooter).toHaveBeenCalledWith(55);
    });

    it('should use activeTabId when tabId is missing from params', async () => {
      setActiveTabId(77);
      mockSync.hideFooter.mockResolvedValue(okResult(undefined));

      // Params object has no tabId key at all — handler reads undefined which is falsy
      await registry.dispatch('footer.hide', {});

      expect(mockSync.hideFooter).toHaveBeenCalledWith(77);
    });
  });

  // -----------------------------------------------------------------------
  // T026: Footer state update field validation (SC-006)
  // -----------------------------------------------------------------------

  describe('footer state fields (T026)', () => {
    it('should require all footer state fields in stateUpdate', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      const fullState = {
        tabId: 1,
        status: 'playing' as const,
        currentIndex: 2,
        totalParagraphs: 10,
        progress: 0.2,
        currentTime: '0:30',
        totalTime: '2:30',
        speed: 1.5,
      };

      const outer = await registry.dispatch('footer.stateUpdate', fullState);
      const result = unwrapDispatch(outer) as FooterOperationResponse;
      expect(result.success).toBe(true);

      // Verify the FooterState passed to adapter has all required fields
      const passedState = mockSync.updateFooterState.mock.calls[0]?.[1];
      expect(passedState).toEqual({
        status: 'playing',
        currentIndex: 2,
        totalParagraphs: 10,
        progress: 0.2,
        currentTime: '0:30',
        totalTime: '2:30',
        speed: 1.5,
        voice: null,
      });
    });

    it('should pass currentTime as formatted string (not currentText)', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      await registry.dispatch('footer.stateUpdate', {
        tabId: 1,
        status: 'playing' as const,
        currentIndex: 5,
        totalParagraphs: 20,
        progress: 0.75,
        currentTime: '1:45',
        totalTime: '3:00',
        speed: 1.0,
      });

      const passedState = mockSync.updateFooterState.mock.calls[0]?.[1];

      // Verify currentTime is a formatted string
      expect(typeof passedState?.currentTime).toBe('string');
      expect(passedState?.currentTime).toMatch(/^\d+:\d{2}$/);

      // Verify totalTime is a formatted string
      expect(typeof passedState?.totalTime).toBe('string');
      expect(passedState?.totalTime).toMatch(/^\d+:\d{2}$/);

      // Verify NO currentText field exists
      expect(passedState).not.toHaveProperty('currentText');
    });

    it('should include all 7 required fields in FooterState', async () => {
      mockSync.updateFooterState.mockResolvedValue(okResult(undefined));

      await registry.dispatch('footer.stateUpdate', {
        tabId: 1,
        status: 'idle' as const,
        currentIndex: 0,
        totalParagraphs: 0,
        progress: 0,
        currentTime: '0:00',
        totalTime: '0:00',
        speed: 1.0,
      });

      const passedState = mockSync.updateFooterState.mock.calls[0]?.[1];
      const requiredFields = [
        'status',
        'currentIndex',
        'totalParagraphs',
        'progress',
        'currentTime',
        'totalTime',
        'speed',
      ];

      for (const field of requiredFields) {
        expect(passedState).toHaveProperty(field);
      }
    });
  });
});
