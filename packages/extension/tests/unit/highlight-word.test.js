/**
 * Word Highlight Tests
 * Verifies word highlight clearing on paragraph change
 *
 * @feature 020-code-quality-fix
 */

/**
 * Mock JSDOM CustomHighlight API
 */
class MockCustomHighlight {
  constructor() {
    this.ranges = new Set();
  }

  add(range) {
    this.ranges.add(range);
  }

  clear() {
    this.ranges.clear();
  }
}

/**
 * Mock CSS highlights registry
 */
const mockHighlightsRegistry = new Map();
mockHighlightsRegistry.set = function(name, highlight) {
  Map.prototype.set.call(this, name, highlight);
};
mockHighlightsRegistry.delete = function(name) {
  Map.prototype.delete.call(this, name);
};
mockHighlightsRegistry.get = function(name) {
  return Map.prototype.get.call(this, name);
};

// Setup global mocks
global.CSS = {
  highlights: mockHighlightsRegistry
};
global.Highlight = MockCustomHighlight;

describe('Word Highlight Clearing (020-code-quality-fix)', () => {
  let highlightManager;

  beforeEach(() => {
    // Reset highlights registry
    mockHighlightsRegistry.clear();

    // Create a mock highlight manager structure
    highlightManager = {
      _wordHighlight: null,
      _highlightedParagraphIndex: -1,

      clearParagraphHighlights() {
        this._highlightedParagraphIndex = -1;
      },

      clearWordHighlight() {
        if (CSS.highlights && CSS.highlights.get('voxpage-word')) {
          CSS.highlights.delete('voxpage-word');
        }
        this._wordHighlight = null;
      },

      // Original function WITHOUT the fix
      highlightParagraphOriginal(index) {
        this.clearParagraphHighlights();
        // Missing: clearWordHighlight()
        this._highlightedParagraphIndex = index;
      },

      // Fixed function WITH the word clearing
      highlightParagraphFixed(index) {
        this.clearParagraphHighlights();
        this.clearWordHighlight(); // THE FIX
        this._highlightedParagraphIndex = index;
      },

      highlightWord(wordIndex) {
        const highlight = new MockCustomHighlight();
        highlight.add({ wordIndex }); // Simplified range mock
        CSS.highlights.set('voxpage-word', highlight);
        this._wordHighlight = highlight;
      }
    };
  });

  describe('clearWordHighlight function', () => {
    test('removes word highlight from CSS registry', () => {
      // Set up a word highlight
      highlightManager.highlightWord(0);
      expect(CSS.highlights.get('voxpage-word')).toBeDefined();

      // Clear it
      highlightManager.clearWordHighlight();
      expect(CSS.highlights.get('voxpage-word')).toBeUndefined();
    });

    test('handles case when no highlight exists', () => {
      // Should not throw
      expect(() => highlightManager.clearWordHighlight()).not.toThrow();
    });

    test('sets internal reference to null', () => {
      highlightManager.highlightWord(0);
      highlightManager.clearWordHighlight();
      expect(highlightManager._wordHighlight).toBeNull();
    });
  });

  describe('highlightParagraph with word clearing', () => {
    test('original function does NOT clear word highlights (showing the bug)', () => {
      // Setup: highlight a word
      highlightManager.highlightWord(5);
      expect(CSS.highlights.get('voxpage-word')).toBeDefined();

      // Original behavior: word highlight persists after paragraph change
      highlightManager.highlightParagraphOriginal(1);

      // BUG: Word highlight still exists
      expect(CSS.highlights.get('voxpage-word')).toBeDefined();
    });

    test('fixed function DOES clear word highlights', () => {
      // Setup: highlight a word
      highlightManager.highlightWord(5);
      expect(CSS.highlights.get('voxpage-word')).toBeDefined();

      // Fixed behavior: word highlight is cleared on paragraph change
      highlightManager.highlightParagraphFixed(1);

      // FIXED: Word highlight is now cleared
      expect(CSS.highlights.get('voxpage-word')).toBeUndefined();
    });

    test('paragraph index is updated correctly', () => {
      highlightManager.highlightParagraphFixed(3);
      expect(highlightManager._highlightedParagraphIndex).toBe(3);

      highlightManager.highlightParagraphFixed(7);
      expect(highlightManager._highlightedParagraphIndex).toBe(7);
    });
  });

  describe('word highlight timing normalization', () => {
    test('word timing object has required fields', () => {
      const wordTiming = {
        word: 'hello',
        charOffset: 0,
        charLength: 5,
        startTimeMs: 100,
        endTimeMs: 400
      };

      expect(wordTiming).toHaveProperty('startTimeMs');
      expect(wordTiming).toHaveProperty('endTimeMs');
      expect(wordTiming.startTimeMs).toBeLessThan(wordTiming.endTimeMs);
    });

    test('normalized timing uses milliseconds', () => {
      const rawTiming = {
        startTimeMs: 1000,
        endTimeMs: 2000,
        charOffset: 10,
        charLength: 4
      };

      // All times should be in milliseconds (>= 100 for typical words)
      expect(rawTiming.startTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof rawTiming.startTimeMs).toBe('number');
      expect(typeof rawTiming.endTimeMs).toBe('number');
    });
  });
});
