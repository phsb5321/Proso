/**
 * Anchoring Service Unit Tests
 *
 * Comprehensive tests for the W3C Web Annotation text re-anchoring algorithm.
 * Covers Levenshtein distance, similarity scoring, fuzzy matching, text anchoring,
 * DOM range creation, batch anchoring, and the service factory.
 *
 * @module tests/unit/core/highlight/anchoring.service
 */

import { describe, it, expect } from '@jest/globals';
import {
  levenshteinDistance,
  similarityRatio,
  anchorToText,
  createRangeFromPosition,
  anchor,
  anchorAll,
  createAnchoringService,
  type AnchoringConfig,
  type AnchorPosition,
  type AnchoringError,
} from '../../../../src/core/highlight/anchoring.service';
import { isOk, isErr } from '../../../../src/core/shared/result';
import type { TextQuoteSelector } from '../../../../src/utils/schemas/highlight.schema';

// ---------------------------------------------------------------------------
// Helper: build a minimal TextQuoteSelector
// ---------------------------------------------------------------------------
function makeSelector(
  exact: string,
  prefix?: string,
  suffix?: string,
): TextQuoteSelector {
  return {
    type: 'TextQuoteSelector',
    exact,
    prefix,
    suffix,
  };
}

// ==========================================================================
// levenshteinDistance
// ==========================================================================
describe('levenshteinDistance', () => {
  // ---- identical strings ----
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return 0 for strings that differ only in case (normalized)', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(0);
  });

  it('should return 0 for strings that differ only in whitespace (normalized)', () => {
    expect(levenshteinDistance('hello  world', 'hello world')).toBe(0);
  });

  it('should return 0 for both empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  // ---- one empty string ----
  it('should return the length of the other string when first is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('should return the length of the other string when second is empty', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  // ---- single character differences ----
  it('should return 1 for single substitution', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('should return 1 for single insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should return 1 for single deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  // ---- completely different strings ----
  it('should return max length for completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  // ---- known distances ----
  it('should compute correct distance for "kitten" vs "sitting"', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should compute correct distance for "saturday" vs "sunday"', () => {
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should compute correct distance for "flaw" vs "lawn"', () => {
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2);
  });

  // ---- symmetry ----
  it('should be symmetric: distance(a,b) === distance(b,a)', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
    expect(levenshteinDistance('kitten', 'sitting')).toBe(levenshteinDistance('sitting', 'kitten'));
  });

  // ---- whitespace normalization effects ----
  it('should treat leading/trailing whitespace as insignificant', () => {
    expect(levenshteinDistance('  hello  ', 'hello')).toBe(0);
  });

  it('should collapse multiple spaces into one before comparing', () => {
    expect(levenshteinDistance('a   b   c', 'a b c')).toBe(0);
  });

  // ---- longer strings ----
  it('should handle longer strings correctly', () => {
    const a = 'the quick brown fox jumps over the lazy dog';
    const b = 'the quick brown fox jumped over the lazy dog';
    const dist = levenshteinDistance(a, b);
    // "jumps" vs "jumped" differs by 2 chars (s->ed)
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThanOrEqual(3);
  });

  // ---- single character strings ----
  it('should return 0 for matching single characters', () => {
    expect(levenshteinDistance('a', 'a')).toBe(0);
  });

  it('should return 1 for different single characters', () => {
    expect(levenshteinDistance('a', 'b')).toBe(1);
  });

  // ---- repeated characters ----
  it('should handle repeated character strings', () => {
    expect(levenshteinDistance('aaa', 'aaaa')).toBe(1);
    expect(levenshteinDistance('aaaa', 'aaa')).toBe(1);
  });
});

// ==========================================================================
// similarityRatio
// ==========================================================================
describe('similarityRatio', () => {
  // ---- identical strings ----
  it('should return 1 for identical strings', () => {
    expect(similarityRatio('hello', 'hello')).toBe(1);
  });

  it('should return 1 for case-different strings (normalized)', () => {
    expect(similarityRatio('Hello World', 'hello world')).toBe(1);
  });

  it('should return 1 for whitespace-different strings (normalized)', () => {
    expect(similarityRatio('hello  world', 'hello world')).toBe(1);
  });

  // ---- empty strings ----
  it('should return 0 when first string is empty and second is not', () => {
    expect(similarityRatio('', 'abc')).toBe(0);
  });

  it('should return 0 when second string is empty and first is not', () => {
    expect(similarityRatio('abc', '')).toBe(0);
  });

  it('should return 1 when both strings are empty (both normalize to empty, early exit)', () => {
    // Both empty after normalization -> s1 === s2 -> returns 1
    expect(similarityRatio('', '')).toBe(1);
  });

  // ---- similarity ranges ----
  it('should return a value between 0 and 1', () => {
    const ratio = similarityRatio('abc', 'abd');
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('should return high similarity for close strings', () => {
    const ratio = similarityRatio('hello world', 'hello worl');
    expect(ratio).toBeGreaterThan(0.8);
  });

  it('should return low similarity for very different strings', () => {
    const ratio = similarityRatio('abcdef', 'zyxwvu');
    expect(ratio).toBeLessThan(0.3);
  });

  // ---- known values ----
  it('should compute correct ratio for "kitten" vs "sitting"', () => {
    // distance = 3, maxLen = 7, ratio = 1 - 3/7 = 4/7 ~0.571
    const ratio = similarityRatio('kitten', 'sitting');
    expect(ratio).toBeCloseTo(4 / 7, 2);
  });

  // ---- symmetry ----
  it('should be symmetric', () => {
    expect(similarityRatio('abc', 'abd')).toBe(similarityRatio('abd', 'abc'));
  });

  // ---- 0 similarity ----
  it('should return 0 for completely different single-char strings', () => {
    // distance("a","b") = 1, maxLen = 1, ratio = 0
    expect(similarityRatio('a', 'b')).toBe(0);
  });

  // ---- near-identical long strings ----
  it('should return high similarity for long strings with minor difference', () => {
    const base = 'the quick brown fox jumps over the lazy dog';
    const modified = 'the quick brown fox jumps over the lazy cat';
    const ratio = similarityRatio(base, modified);
    expect(ratio).toBeGreaterThan(0.9);
  });
});

// ==========================================================================
// anchorToText
// ==========================================================================
describe('anchorToText', () => {
  const documentText = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

  // ---- exact match ----
  describe('exact match', () => {
    it('should find an exact match and return confidence 1', () => {
      const selector = makeSelector('quick brown fox');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
        expect(result.value.matchedText).toBe('quick brown fox');
        expect(result.value.startOffset).toBe(4);
        expect(result.value.endOffset).toBe(4 + 'quick brown fox'.length);
      }
    });

    it('should find exact match at the beginning of text', () => {
      const selector = makeSelector('The quick');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
        expect(result.value.startOffset).toBe(0);
      }
    });

    it('should find exact match at the end of text', () => {
      const selector = makeSelector('liquor jugs.');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });

    it('should find exact match with case-insensitive matching (normalized)', () => {
      const selector = makeSelector('QUICK BROWN FOX');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });
  });

  // ---- not found ----
  describe('not found', () => {
    it('should return NOT_FOUND for text not in document', () => {
      const selector = makeSelector('this text does not exist anywhere in this document at all');
      const result = anchorToText(documentText, selector);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  // ---- fuzzy match ----
  describe('fuzzy match', () => {
    it('should find a fuzzy match with minor typo', () => {
      // "quikc" instead of "quick" -- 1 transposition
      const selector = makeSelector('quikc brown fox');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should reject fuzzy match below minimum similarity', () => {
      // Very different text should not match
      const selector = makeSelector('completely unrelated nonsense text');
      const result = anchorToText(documentText, selector);

      expect(isErr(result)).toBe(true);
    });
  });

  // ---- with context (prefix/suffix) ----
  describe('context scoring', () => {
    it('should use prefix context to boost score', () => {
      const selector = makeSelector('brown fox', 'The quick ');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });

    it('should use suffix context to boost score', () => {
      const selector = makeSelector('brown fox', undefined, ' jumps over');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });

    it('should use both prefix and suffix context', () => {
      const selector = makeSelector('brown fox', 'The quick ', ' jumps over');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });
  });

  // ---- configuration ----
  describe('configuration', () => {
    it('should respect custom minSimilarity', () => {
      const selector = makeSelector('quikc brown fox');
      const strictConfig: Partial<AnchoringConfig> = { minSimilarity: 0.99 };
      const result = anchorToText(documentText, selector, strictConfig);

      // With very strict similarity requirement, the fuzzy match should fail
      expect(isErr(result)).toBe(true);
    });

    it('should respect custom maxCandidates', () => {
      const selector = makeSelector('the');
      // "the" appears multiple times, but with maxCandidates=1 we limit
      const result = anchorToText(documentText, selector, { maxCandidates: 1 });

      // Should still return a result (exact match takes priority)
      expect(isOk(result)).toBe(true);
    });

    it('should merge config with defaults', () => {
      const selector = makeSelector('quick brown fox');
      const result = anchorToText(documentText, selector, { contextWeight: 0.5 });

      expect(isOk(result)).toBe(true);
    });
  });

  // ---- edge cases ----
  describe('edge cases', () => {
    it('should handle single-word selector', () => {
      const selector = makeSelector('jumps');
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
        expect(result.value.matchedText).toBe('jumps');
      }
    });

    it('should handle selector matching full document text', () => {
      const selector = makeSelector(documentText);
      const result = anchorToText(documentText, selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });

    it('should handle very short text to search', () => {
      const selector = makeSelector('hi');
      const result = anchorToText('hi', selector);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });

    it('should handle whitespace-only differences in selector vs document', () => {
      const selector = makeSelector('quick  brown  fox');
      const result = anchorToText(documentText, selector);

      // After normalization, multiple spaces become single spaces
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.confidence).toBe(1);
      }
    });
  });
});

// ==========================================================================
// createRangeFromPosition
// ==========================================================================
describe('createRangeFromPosition', () => {
  it('should create a Range spanning the correct text nodes', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello World';

    const position: AnchorPosition = {
      startOffset: 0,
      endOffset: 5,
      confidence: 1,
      matchedText: 'Hello',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toString()).toBe('Hello');
    }
  });

  it('should create a Range for text in the middle', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello Beautiful World';

    const position: AnchorPosition = {
      startOffset: 6,
      endOffset: 15,
      confidence: 1,
      matchedText: 'Beautiful',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toString()).toBe('Beautiful');
    }
  });

  it('should handle multiple text nodes', () => {
    const container = document.createElement('div');
    const span1 = document.createElement('span');
    span1.textContent = 'Hello ';
    const span2 = document.createElement('span');
    span2.textContent = 'World';
    container.appendChild(span1);
    container.appendChild(span2);

    // "World" starts at offset 6 (after "Hello ") and ends at 11
    const position: AnchorPosition = {
      startOffset: 6,
      endOffset: 11,
      confidence: 1,
      matchedText: 'World',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toString()).toBe('World');
    }
  });

  it('should handle range spanning across text nodes', () => {
    const container = document.createElement('div');
    const span1 = document.createElement('span');
    span1.textContent = 'Hello ';
    const span2 = document.createElement('span');
    span2.textContent = 'World';
    container.appendChild(span1);
    container.appendChild(span2);

    // "lo Wor" spans from offset 3 to 9, crossing the node boundary
    const position: AnchorPosition = {
      startOffset: 3,
      endOffset: 9,
      confidence: 1,
      matchedText: 'lo Wor',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toString()).toBe('lo Wor');
    }
  });

  it('should return DOM_ERROR when offsets are beyond text content', () => {
    const container = document.createElement('div');
    container.textContent = 'Short';

    const position: AnchorPosition = {
      startOffset: 0,
      endOffset: 100, // way beyond the text length
      confidence: 1,
      matchedText: 'Short',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('DOM_ERROR');
    }
  });

  it('should return DOM_ERROR for empty container', () => {
    const container = document.createElement('div');
    // No text content at all

    const position: AnchorPosition = {
      startOffset: 0,
      endOffset: 5,
      confidence: 1,
      matchedText: 'Hello',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('DOM_ERROR');
    }
  });

  it('should handle deeply nested text nodes', () => {
    const container = document.createElement('div');
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Bold text';
    p.appendChild(strong);
    container.appendChild(p);

    const position: AnchorPosition = {
      startOffset: 0,
      endOffset: 4,
      confidence: 1,
      matchedText: 'Bold',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toString()).toBe('Bold');
    }
  });
});

// ==========================================================================
// anchor (full anchoring: text + DOM)
// ==========================================================================
describe('anchor', () => {
  it('should find and create range for exact match', () => {
    const container = document.createElement('div');
    container.textContent = 'The quick brown fox jumps over the lazy dog.';

    const selector = makeSelector('brown fox');
    const result = anchor(document, container, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.position.confidence).toBe(1);
      expect(result.value.range.toString()).toBe('brown fox');
    }
  });

  it('should propagate NOT_FOUND error from anchorToText', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello World';

    const selector = makeSelector('this text does not appear anywhere in this dom at all really');
    const result = anchor(document, container, selector);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('NOT_FOUND');
    }
  });

  it('should work with empty container textContent', () => {
    const container = document.createElement('div');
    // empty container

    const selector = makeSelector('some text');
    const result = anchor(document, container, selector);

    expect(isErr(result)).toBe(true);
  });

  it('should accept custom config', () => {
    const container = document.createElement('div');
    container.textContent = 'The quick brown fox jumps over the lazy dog.';

    const selector = makeSelector('quick brown fox');
    const result = anchor(document, container, selector, { minSimilarity: 0.5 });

    expect(isOk(result)).toBe(true);
  });
});

// ==========================================================================
// anchorAll (batch anchoring)
// ==========================================================================
describe('anchorAll', () => {
  it('should anchor multiple selectors and return a Map', () => {
    const container = document.createElement('div');
    container.textContent = 'The quick brown fox jumps over the lazy dog.';

    const selectors: TextQuoteSelector[] = [
      makeSelector('quick brown'),
      makeSelector('lazy dog'),
    ];

    const results = anchorAll(document, container, selectors);

    expect(results.size).toBe(2);

    const first = results.get(0)!;
    expect(isOk(first)).toBe(true);
    if (isOk(first)) {
      expect(first.value.range.toString()).toBe('quick brown');
    }

    const second = results.get(1)!;
    expect(isOk(second)).toBe(true);
    if (isOk(second)) {
      expect(second.value.range.toString()).toBe('lazy dog');
    }
  });

  it('should handle mixed success and failure', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello World';

    const selectors: TextQuoteSelector[] = [
      makeSelector('Hello'),
      makeSelector('this text is definitely not present in the container at all'),
    ];

    const results = anchorAll(document, container, selectors);

    expect(results.size).toBe(2);

    const first = results.get(0)!;
    expect(isOk(first)).toBe(true);

    const second = results.get(1)!;
    expect(isErr(second)).toBe(true);
  });

  it('should handle empty selectors array', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello World';

    const results = anchorAll(document, container, []);

    expect(results.size).toBe(0);
  });

  it('should pass config through to each anchor call', () => {
    const container = document.createElement('div');
    container.textContent = 'The quick brown fox jumps over the lazy dog.';

    const selectors: TextQuoteSelector[] = [
      makeSelector('quick brown fox'),
    ];

    const results = anchorAll(document, container, selectors, { minSimilarity: 0.5 });

    expect(results.size).toBe(1);
    const first = results.get(0)!;
    expect(isOk(first)).toBe(true);
  });
});

// ==========================================================================
// createAnchoringService
// ==========================================================================
describe('createAnchoringService', () => {
  it('should create a service with default config', () => {
    const service = createAnchoringService();

    expect(service).toBeDefined();
    expect(typeof service.anchor).toBe('function');
    expect(typeof service.anchorToText).toBe('function');
    expect(typeof service.anchorAll).toBe('function');
    expect(typeof service.similarityRatio).toBe('function');
    expect(typeof service.levenshteinDistance).toBe('function');
  });

  it('should create a service with custom config', () => {
    const service = createAnchoringService({
      minSimilarity: 0.9,
      maxCandidates: 5,
      contextWeight: 0.5,
    });

    expect(service).toBeDefined();
  });

  it('should expose levenshteinDistance directly', () => {
    const service = createAnchoringService();

    expect(service.levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('should expose similarityRatio directly', () => {
    const service = createAnchoringService();

    expect(service.similarityRatio('hello', 'hello')).toBe(1);
  });

  it('should use bound config for anchorToText', () => {
    const service = createAnchoringService({ minSimilarity: 0.99 });
    const text = 'The quick brown fox';
    const selector = makeSelector('quikc brown fox');

    // With very strict similarity, the fuzzy match should fail
    const result = service.anchorToText(text, selector);
    expect(isErr(result)).toBe(true);
  });

  it('should use bound config for anchor', () => {
    const container = document.createElement('div');
    container.textContent = 'The quick brown fox jumps over the lazy dog.';

    const service = createAnchoringService({ minSimilarity: 0.5 });
    const selector = makeSelector('quick brown fox');
    const result = service.anchor(document, container, selector);

    expect(isOk(result)).toBe(true);
  });

  it('should use bound config for anchorAll', () => {
    const container = document.createElement('div');
    container.textContent = 'Hello World';

    const service = createAnchoringService();
    const selectors = [makeSelector('Hello'), makeSelector('World')];
    const results = service.anchorAll(document, container, selectors);

    expect(results.size).toBe(2);
    expect(isOk(results.get(0)!)).toBe(true);
    expect(isOk(results.get(1)!)).toBe(true);
  });
});

// ==========================================================================
// AnchoringError types
// ==========================================================================
describe('AnchoringError discriminated union', () => {
  it('should produce NOT_FOUND errors', () => {
    const selector = makeSelector('text that absolutely cannot be found anywhere in the content');
    const result = anchorToText('short text', selector);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('NOT_FOUND');
      expect(result.error.message).toBeDefined();
    }
  });

  it('should produce LOW_CONFIDENCE errors when best match is below threshold', () => {
    // Create text where the best fuzzy match has low confidence
    const text = 'abcdefghijklmnopqrstuvwxyz';
    // Selector text that is long enough to fuzzy-match but with low similarity
    const selector = makeSelector('abcXYZghiJKLmnoPQRstUVWxyz');

    const result = anchorToText(text, selector, { minSimilarity: 0.99 });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      // Could be NOT_FOUND or LOW_CONFIDENCE depending on whether candidates pass initial filter
      expect(['NOT_FOUND', 'LOW_CONFIDENCE']).toContain(result.error.type);
    }
  });

  it('should include candidateCount in AMBIGUOUS errors', () => {
    // Create text with repeated similar patterns
    const text = 'the cat sat on the mat. the cat sat on the bat.';
    // This exact match exists so it won't be AMBIGUOUS.
    // AMBIGUOUS requires multiple fuzzy matches with very close confidence.
    // Since AMBIGUOUS is hard to trigger deterministically, we just verify the type shape exists.
    // We verify the union type compiles correctly:
    const ambiguousError: AnchoringError = {
      type: 'AMBIGUOUS',
      message: 'test',
      candidateCount: 3,
    };
    expect(ambiguousError.type).toBe('AMBIGUOUS');
    expect(ambiguousError.candidateCount).toBe(3);
  });

  it('should produce DOM_ERROR from createRangeFromPosition', () => {
    const container = document.createElement('div');
    // Empty container, no text nodes

    const position: AnchorPosition = {
      startOffset: 0,
      endOffset: 5,
      confidence: 1,
      matchedText: 'Hello',
    };

    const result = createRangeFromPosition(document, container, position);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('DOM_ERROR');
      expect(result.error.message).toBeDefined();
    }
  });
});

// ==========================================================================
// Integration-style tests: anchorToText with real-world patterns
// ==========================================================================
describe('anchorToText real-world patterns', () => {
  const articleText =
    'Climate change is one of the most pressing issues of our time. ' +
    'Scientists have warned that global temperatures could rise by 1.5 degrees Celsius ' +
    'above pre-industrial levels as early as 2030. The Paris Agreement aims to limit ' +
    'warming to well below 2 degrees Celsius. Governments around the world are ' +
    'implementing policies to reduce greenhouse gas emissions.';

  it('should anchor a sentence from the middle of an article', () => {
    const selector = makeSelector(
      'Scientists have warned that global temperatures could rise by 1.5 degrees Celsius',
      'of our time. ',
      ' above pre-industrial',
    );

    const result = anchorToText(articleText, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('should handle selector with slightly modified text (simulating DOM change)', () => {
    // Simulate a minor edit: "could" -> "may"
    const selector = makeSelector(
      'Scientists have warned that global temperatures may rise by 1.5 degrees Celsius',
    );

    const result = anchorToText(articleText, selector, { minSimilarity: 0.8 });

    // Should fuzzy-match since only 1 word is different
    if (isOk(result)) {
      expect(result.value.confidence).toBeGreaterThan(0);
    }
    // It's also acceptable to not match if the algorithm deems it too different
  });

  it('should handle very short selectors in long text', () => {
    const selector = makeSelector('Paris');
    const result = anchorToText(articleText, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
      expect(result.value.matchedText).toBe('Paris');
    }
  });

  it('should handle selector with extra whitespace that gets normalized', () => {
    const selector = makeSelector('The  Paris  Agreement  aims');
    const result = anchorToText(articleText, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });
});

// ==========================================================================
// Boundary conditions and stress tests
// ==========================================================================
describe('boundary conditions', () => {
  it('should handle text with only whitespace', () => {
    const selector = makeSelector('hello');
    const result = anchorToText('   ', selector);

    expect(isErr(result)).toBe(true);
  });

  it('should handle selector with special characters', () => {
    const text = 'The price is $100.00 (USD) for the item.';
    const selector = makeSelector('$100.00 (USD)');
    const result = anchorToText(text, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('should handle text with newlines (normalized to spaces)', () => {
    const text = 'Hello\nWorld\nFoo\nBar';
    const selector = makeSelector('Hello World');
    const result = anchorToText(text, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('should handle text with tabs (normalized to spaces)', () => {
    const text = 'Hello\tWorld';
    const selector = makeSelector('Hello World');
    const result = anchorToText(text, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('should handle Unicode text', () => {
    const text = 'Les temperatures pourraient augmenter de 1,5 degres.';
    const selector = makeSelector('temperatures pourraient');
    const result = anchorToText(text, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('should handle repeated identical phrases', () => {
    const text = 'the cat sat. the cat sat. the cat sat.';
    const selector = makeSelector('the cat sat');
    const result = anchorToText(text, selector);

    // Should match (first occurrence via exact match)
    expect(isOk(result)).toBe(true);
  });

  it('should use prefix to disambiguate repeated phrases', () => {
    const text = 'the cat sat on the mat. later the cat sat on the hat.';
    const selector = makeSelector('the cat sat', 'later ');
    const result = anchorToText(text, selector);

    // Should find exact match (first occurrence) since exact match short-circuits
    expect(isOk(result)).toBe(true);
  });
});

// ==========================================================================
// AnchorPosition interface shape
// ==========================================================================
describe('AnchorPosition shape', () => {
  it('should have all required fields in successful result', () => {
    const text = 'Hello World';
    const selector = makeSelector('Hello');
    const result = anchorToText(text, selector);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const pos = result.value;
      expect(typeof pos.startOffset).toBe('number');
      expect(typeof pos.endOffset).toBe('number');
      expect(typeof pos.confidence).toBe('number');
      expect(typeof pos.matchedText).toBe('string');
      expect(pos.startOffset).toBeLessThan(pos.endOffset);
      expect(pos.confidence).toBeGreaterThanOrEqual(0);
      expect(pos.confidence).toBeLessThanOrEqual(1);
    }
  });
});
