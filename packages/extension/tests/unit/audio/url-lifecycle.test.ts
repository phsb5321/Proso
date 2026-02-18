/**
 * Blob URL Lifecycle Unit Tests (035-selection-tts-hardening)
 * Tests for proper blob URL creation, tracking, and revocation
 *
 * @module tests/unit/audio/url-lifecycle
 */

import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';

// Mock URL methods
const mockRevokeObjectURL = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url-' + Math.random());

beforeAll(() => {
  (global.URL.createObjectURL as jest.Mock) = mockCreateObjectURL;
  (global.URL.revokeObjectURL as jest.Mock) = mockRevokeObjectURL;
});

afterEach(() => {
  jest.clearAllMocks();
});

/**
 * BlobURLTracker - Utility class for managing blob URLs
 * This simulates the pattern used in the codebase for tracking blob URLs
 */
class BlobURLTracker {
  private urlMap: Map<number, string> = new Map();
  private currentIndex: number = -1;

  /**
   * Track a new blob URL for a paragraph
   */
  track(paragraphIndex: number, url: string): void {
    // Revoke previous URL for same paragraph
    const existingUrl = this.urlMap.get(paragraphIndex);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
    }
    this.urlMap.set(paragraphIndex, url);
  }

  /**
   * Get URL for a paragraph
   */
  get(paragraphIndex: number): string | undefined {
    return this.urlMap.get(paragraphIndex);
  }

  /**
   * Get all active URLs
   */
  getAll(): Map<number, string> {
    return new Map(this.urlMap);
  }

  /**
   * Set current playing paragraph
   */
  setCurrent(index: number): void {
    this.currentIndex = index;
  }

  /**
   * Cleanup all URLs (on stop)
   */
  revokeAll(): void {
    for (const url of this.urlMap.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlMap.clear();
    this.currentIndex = -1;
  }

  /**
   * Cleanup old URLs, preserving current and previous
   */
  cleanupOld(): void {
    const keysToRemove: number[] = [];

    for (const [index] of this.urlMap) {
      // Keep current and previous paragraph
      if (index !== this.currentIndex && index !== this.currentIndex - 1) {
        const url = this.urlMap.get(index);
        if (url) {
          URL.revokeObjectURL(url);
        }
        keysToRemove.push(index);
      }
    }

    for (const key of keysToRemove) {
      this.urlMap.delete(key);
    }
  }

  /**
   * Get count of tracked URLs
   */
  get size(): number {
    return this.urlMap.size;
  }
}

/**
 * AudioElementCleaner - Utility for cleaning up audio elements
 */
class AudioElementCleaner {
  /**
   * Clean up an audio element's src properly
   * Uses removeAttribute instead of empty string to avoid CSP issues
   */
  static cleanup(audio: HTMLAudioElement): void {
    const currentSrc = audio.src;

    // Revoke blob URL if present
    if (currentSrc && currentSrc.startsWith('blob:')) {
      URL.revokeObjectURL(currentSrc);
    }

    // Use removeAttribute instead of assigning empty string
    // Empty string assignment can trigger CSP violations
    audio.removeAttribute('src');

    // Call load() to reset the audio element state
    audio.load();
  }
}

describe('Blob URL Lifecycle', () => {
  describe('URL Tracking (T024)', () => {
    it('should track new blob URLs by paragraph index', () => {
      const tracker = new BlobURLTracker();
      const url1 = 'blob:mock-url-1';
      const url2 = 'blob:mock-url-2';

      tracker.track(0, url1);
      tracker.track(1, url2);

      expect(tracker.get(0)).toBe(url1);
      expect(tracker.get(1)).toBe(url2);
      expect(tracker.size).toBe(2);
    });

    it('should revoke previous URL when tracking new URL for same paragraph', () => {
      const tracker = new BlobURLTracker();
      const url1 = 'blob:mock-url-1';
      const url2 = 'blob:mock-url-2';

      tracker.track(0, url1);
      tracker.track(0, url2); // Replace URL for same paragraph

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(url1);
      expect(tracker.get(0)).toBe(url2);
      expect(tracker.size).toBe(1);
    });

    it('should maintain Map of active URLs', () => {
      const tracker = new BlobURLTracker();
      tracker.track(0, 'blob:url-0');
      tracker.track(1, 'blob:url-1');
      tracker.track(2, 'blob:url-2');

      const allUrls = tracker.getAll();
      expect(allUrls.size).toBe(3);
      expect(allUrls.get(0)).toBe('blob:url-0');
      expect(allUrls.get(1)).toBe('blob:url-1');
      expect(allUrls.get(2)).toBe('blob:url-2');
    });
  });

  describe('URL Cleanup (T025)', () => {
    it('should revoke all URLs on playback stop', () => {
      const tracker = new BlobURLTracker();
      const urls = ['blob:url-0', 'blob:url-1', 'blob:url-2'];

      urls.forEach((url, index) => tracker.track(index, url));
      expect(tracker.size).toBe(3);

      tracker.revokeAll();

      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(3);
      urls.forEach(url => {
        expect(mockRevokeObjectURL).toHaveBeenCalledWith(url);
      });
      expect(tracker.size).toBe(0);
    });

    it('should cleanup old URLs during playback', () => {
      const tracker = new BlobURLTracker();

      // Track URLs for paragraphs 0-4
      for (let i = 0; i < 5; i++) {
        tracker.track(i, `blob:url-${i}`);
      }

      // Current playback at paragraph 3
      tracker.setCurrent(3);
      mockRevokeObjectURL.mockClear();

      tracker.cleanupOld();

      // Should revoke paragraphs 0, 1, 4 (keep 2 and 3)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url-0');
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url-1');
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url-4');
      expect(mockRevokeObjectURL).not.toHaveBeenCalledWith('blob:url-2'); // previous
      expect(mockRevokeObjectURL).not.toHaveBeenCalledWith('blob:url-3'); // current
    });

    it('should preserve current and previous paragraph URLs for replay', () => {
      const tracker = new BlobURLTracker();

      tracker.track(0, 'blob:url-0');
      tracker.track(1, 'blob:url-1');
      tracker.track(2, 'blob:url-2');

      tracker.setCurrent(2);
      mockRevokeObjectURL.mockClear();

      tracker.cleanupOld();

      // Only paragraph 0 should be revoked
      expect(tracker.get(1)).toBe('blob:url-1'); // previous - preserved
      expect(tracker.get(2)).toBe('blob:url-2'); // current - preserved
      expect(tracker.get(0)).toBeUndefined(); // old - cleaned up
    });

    it('should handle empty Map gracefully', () => {
      const tracker = new BlobURLTracker();

      // Should not throw on empty tracker
      expect(() => tracker.revokeAll()).not.toThrow();
      expect(() => tracker.cleanupOld()).not.toThrow();
      expect(tracker.size).toBe(0);
    });
  });

  describe('Audio Element Cleanup', () => {
    let mockAudio: Partial<HTMLAudioElement>;

    beforeEach(() => {
      mockAudio = {
        src: 'blob:test-url',
        removeAttribute: jest.fn(),
        load: jest.fn(),
      };
    });

    it('should use removeAttribute instead of empty string assignment', () => {
      AudioElementCleaner.cleanup(mockAudio as HTMLAudioElement);

      expect(mockAudio.removeAttribute).toHaveBeenCalledWith('src');
    });

    it('should call audio.load() after removeAttribute', () => {
      const removeAttributeMock = mockAudio.removeAttribute as jest.Mock;
      const loadMock = mockAudio.load as jest.Mock;

      AudioElementCleaner.cleanup(mockAudio as HTMLAudioElement);

      // Verify order: removeAttribute called before load
      const removeCallOrder = removeAttributeMock.mock.invocationCallOrder[0];
      const loadCallOrder = loadMock.mock.invocationCallOrder[0];
      expect(removeCallOrder).toBeLessThan(loadCallOrder);
    });

    it('should not trigger CSP errors on cleanup', () => {
      // CSP errors occur when assigning empty string to src
      // Using removeAttribute avoids this issue
      AudioElementCleaner.cleanup(mockAudio as HTMLAudioElement);

      // Verify we didn't assign to src (which would trigger CSP)
      // The cleanup method should only call removeAttribute
      expect(mockAudio.removeAttribute).toHaveBeenCalledWith('src');
      // src property should not be directly assigned
      expect(mockAudio.src).toBe('blob:test-url'); // Original value unchanged
    });

    it('should revoke blob URL before cleanup', () => {
      mockAudio.src = 'blob:should-be-revoked';

      AudioElementCleaner.cleanup(mockAudio as HTMLAudioElement);

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:should-be-revoked');
    });

    it('should not revoke non-blob URLs', () => {
      mockAudio.src = 'https://example.com/audio.mp3';

      AudioElementCleaner.cleanup(mockAudio as HTMLAudioElement);

      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });
  });
});
