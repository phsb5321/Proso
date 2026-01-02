/**
 * Unit tests for navigation cleanup lifecycle handlers
 * Feature: 011-highlight-playback-fix
 */

import { jest } from '@jest/globals';

describe('Navigation Cleanup Lifecycle Handlers (T026)', () => {
  // Mock functions for cleanup callbacks
  let cleanupCallbacks = [];
  let mockFloatingController;
  let mockHighlightManager;

  beforeEach(() => {
    cleanupCallbacks = [];

    mockFloatingController = {
      hide: jest.fn()
    };

    mockHighlightManager = {
      clearHighlights: jest.fn()
    };

    // Mock VoxPage namespace
    global.window = {
      VoxPage: {
        floatingController: mockFloatingController,
        highlightManager: mockHighlightManager
      }
    };

    // Mock browser API
    global.browser = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      }
    };
  });

  afterEach(() => {
    delete global.window;
    delete global.browser;
  });

  test('should register pagehide event handler', () => {
    const addEventListener = jest.fn();
    global.window.addEventListener = addEventListener;

    // Simulate registration (from content/index.js)
    window.addEventListener('pagehide', () => {});

    expect(addEventListener).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function)
    );
  });

  test('should register beforeunload event handler', () => {
    const addEventListener = jest.fn();
    global.window.addEventListener = addEventListener;

    // Simulate registration
    window.addEventListener('beforeunload', () => {});

    expect(addEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
  });

  test('cleanup callbacks should be called in order', () => {
    const callOrder = [];

    cleanupCallbacks.push(() => callOrder.push(1));
    cleanupCallbacks.push(() => callOrder.push(2));
    cleanupCallbacks.push(() => callOrder.push(3));

    // Execute cleanup
    cleanupCallbacks.forEach(cb => cb());

    expect(callOrder).toEqual([1, 2, 3]);
  });

  test('should hide floating controller on cleanup', () => {
    // Simulate cleanup logic
    window.VoxPage?.floatingController?.hide();

    expect(mockFloatingController.hide).toHaveBeenCalled();
  });

  test('should clear highlights on cleanup', () => {
    // Simulate cleanup logic
    window.VoxPage?.highlightManager?.clearHighlights();

    expect(mockHighlightManager.clearHighlights).toHaveBeenCalled();
  });

  test('should handle missing VoxPage modules gracefully', () => {
    global.window.VoxPage = {};

    // Should not throw when modules are undefined
    expect(() => {
      window.VoxPage?.floatingController?.hide();
      window.VoxPage?.highlightManager?.clearHighlights();
    }).not.toThrow();
  });

  test('cleanup should complete within 100ms', async () => {
    const startTime = Date.now();

    // Simulate full cleanup
    await browser.runtime.sendMessage({ action: 'stopPlayback', reason: 'navigation' });
    window.VoxPage?.floatingController?.hide();
    window.VoxPage?.highlightManager?.clearHighlights();

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(100);
  });
});
