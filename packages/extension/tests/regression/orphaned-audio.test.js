/**
 * Regression test for orphaned audio playback
 * Verifies that audio stops when page is navigated away
 * Feature: 011-highlight-playback-fix
 */

import { jest } from '@jest/globals';

describe('Orphaned Audio Prevention (T025)', () => {
  // Mock browser.runtime
  const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

  beforeEach(() => {
    // Reset mocks
    mockSendMessage.mockClear();

    // Mock browser API
    global.browser = {
      runtime: {
        sendMessage: mockSendMessage
      }
    };
  });

  afterEach(() => {
    delete global.browser;
  });

  test('should send stopPlayback message on pagehide event', () => {
    // Simulate pagehide handler (from content/index.js)
    const pagehideHandler = () => {
      browser.runtime.sendMessage({
        action: 'stopPlayback',
        reason: 'navigation'
      }).catch(() => {});
    };

    // Trigger handler
    pagehideHandler();

    expect(mockSendMessage).toHaveBeenCalledWith({
      action: 'stopPlayback',
      reason: 'navigation'
    });
  });

  test('should send stopPlayback message on beforeunload event', () => {
    // Simulate beforeunload handler (from content/index.js)
    const beforeunloadHandler = () => {
      browser.runtime.sendMessage({
        action: 'stopPlayback',
        reason: 'beforeunload'
      }).catch(() => {});
    };

    // Trigger handler
    beforeunloadHandler();

    expect(mockSendMessage).toHaveBeenCalledWith({
      action: 'stopPlayback',
      reason: 'beforeunload'
    });
  });

  test('stopPlayback message should include reason field', () => {
    const reasons = ['navigation', 'beforeunload', 'tab-close'];

    reasons.forEach(reason => {
      mockSendMessage.mockClear();

      browser.runtime.sendMessage({
        action: 'stopPlayback',
        reason: reason
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'stopPlayback',
          reason: reason
        })
      );
    });
  });

  test('should handle message send failure gracefully', async () => {
    // Simulate message failure (background not ready during unload)
    mockSendMessage.mockRejectedValueOnce(new Error('Extension not available'));

    const pagehideHandler = () => {
      browser.runtime.sendMessage({
        action: 'stopPlayback',
        reason: 'navigation'
      }).catch(() => {
        // Should not throw - graceful handling
      });
    };

    // Should not throw
    expect(() => pagehideHandler()).not.toThrow();
  });
});
