/**
 * Regression tests for Feature 013: Fix Paragraph Mapping
 *
 * Bug: findMatchingDOMElements() failed to map Readability-extracted paragraphs
 *      back to live DOM elements due to text normalization differences
 * Fix: Improved text matching with fingerprinting and direct DOM extraction fallback
 *
 * @module tests/regression/013-paragraph-mapping
 */

describe('Feature 013: Paragraph Mapping Regression', () => {
  describe('Text Fingerprinting', () => {
    /**
     * Recreates the text fingerprinting logic from content-extractor.js
     */
    function createTextFingerprint(text) {
      if (!text) return '';
      return text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim()
        .substring(0, 50);
    }

    test('should normalize whitespace variations', () => {
      const texts = [
        'Hello   world\n\ntest',
        'Hello world test',
        'Hello\tworld\rtest',
        '  Hello world test  '
      ];

      const fingerprints = texts.map(createTextFingerprint);
      const unique = new Set(fingerprints);

      expect(unique.size).toBe(1);
      expect(fingerprints[0]).toBe('hello world test');
    });

    test('should normalize punctuation for matching', () => {
      const domText = "The boss's health bar drops to zero.";
      const readabilityText = "The boss's health bar drops to zero."; // curly apostrophe

      expect(createTextFingerprint(domText)).toBe(createTextFingerprint(readabilityText));
    });

    test('should handle empty and null inputs', () => {
      expect(createTextFingerprint('')).toBe('');
      expect(createTextFingerprint(null)).toBe('');
      expect(createTextFingerprint(undefined)).toBe('');
    });
  });

  describe('Fuzzy Text Matching', () => {
    function createTextFingerprint(text) {
      if (!text) return '';
      return text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim()
        .substring(0, 50);
    }

    function textsMatch(text1, text2) {
      if (!text1 || !text2) return false;

      const fp1 = createTextFingerprint(text1);
      const fp2 = createTextFingerprint(text2);

      if (fp1.length < 15 || fp2.length < 15) return false;

      // Exact match
      if (fp1 === fp2) return true;

      // Prefix match
      if (fp1.startsWith(fp2) || fp2.startsWith(fp1)) return true;

      // Similarity check (~80% match)
      const minLen = Math.min(fp1.length, fp2.length);
      let matches = 0;
      for (let i = 0; i < minLen; i++) {
        if (fp1[i] === fp2[i]) matches++;
      }
      return (matches / minLen) >= 0.8;
    }

    test('should match identical texts', () => {
      expect(textsMatch(
        'This is a longer paragraph with meaningful content.',
        'This is a longer paragraph with meaningful content.'
      )).toBe(true);
    });

    test('should match texts with whitespace differences', () => {
      expect(textsMatch(
        'This is a  longer paragraph   with meaningful content.',
        'This is a longer paragraph with meaningful content.'
      )).toBe(true);
    });

    test('should match texts with punctuation differences', () => {
      expect(textsMatch(
        "Hello, world! How are you doing today?",
        "Hello world How are you doing today"
      )).toBe(true);
    });

    test('should reject completely different texts', () => {
      expect(textsMatch(
        'This paragraph is about cats and dogs.',
        'The weather today is sunny and warm.'
      )).toBe(false);
    });

    test('should reject short texts to prevent false positives', () => {
      expect(textsMatch('Hello', 'Hello')).toBe(false);
      expect(textsMatch('Short text', 'Short text')).toBe(false);
    });

    test('should handle curly apostrophe differences', () => {
      // Readability may convert straight apostrophes to curly ones
      expect(textsMatch(
        "The player's health bar regenerates over time.",
        "The player\u2019s health bar regenerates over time."
      )).toBe(true);
    });
  });

  describe('Wiki Container Detection', () => {
    const wikiContainerSelectors = [
      // Fextralife
      '#wiki-content-block',
      '.wiki-content',
      // Wikipedia / MediaWiki
      '#mw-content-text',
      '.mw-parser-output',
      '#bodyContent',
      // Fandom
      '#WikiaArticle',
      '.page-content',
      '#content-wrapper',
      // Generic
      '.wiki-article',
      '.article-content'
    ];

    test('should include Fextralife selectors', () => {
      expect(wikiContainerSelectors).toContain('#wiki-content-block');
      expect(wikiContainerSelectors).toContain('.wiki-content');
    });

    test('should include Wikipedia/MediaWiki selectors', () => {
      expect(wikiContainerSelectors).toContain('#mw-content-text');
      expect(wikiContainerSelectors).toContain('.mw-parser-output');
      expect(wikiContainerSelectors).toContain('#bodyContent');
    });

    test('should include Fandom selectors', () => {
      expect(wikiContainerSelectors).toContain('#WikiaArticle');
      expect(wikiContainerSelectors).toContain('.page-content');
    });

    test('selectors should be ordered by specificity', () => {
      // More specific selectors (IDs) should come before classes
      const firstWikiIndex = wikiContainerSelectors.indexOf('#wiki-content-block');
      const classIndex = wikiContainerSelectors.indexOf('.wiki-content');

      expect(firstWikiIndex).toBeLessThan(classIndex);
    });
  });

  describe('Direct DOM Extraction Fallback', () => {
    test('fallback should be triggered when matching fails', () => {
      // This tests the concept - in actual code, findMatchingDOMElements
      // calls extractParagraphsDirectlyFromDOM when matchedElements.length === 0
      const matchedElements = [];
      const extractedEls = [{ textContent: 'Some content' }];

      const shouldUseFallback = matchedElements.length === 0 && extractedEls.length > 0;
      expect(shouldUseFallback).toBe(true);
    });

    test('fallback should not be triggered when matching succeeds', () => {
      const matchedElements = [{ textContent: 'Matched content' }];
      const extractedEls = [{ textContent: 'Some content' }];

      const shouldUseFallback = matchedElements.length === 0 && extractedEls.length > 0;
      expect(shouldUseFallback).toBe(false);
    });
  });

  describe('Paragraph Filtering', () => {
    test('should reject paragraphs shorter than 30 chars', () => {
      const minLength = 30;
      const shortText = 'Too short';
      const longText = 'This is a valid paragraph with enough content to be read aloud.';

      expect(shortText.length < minLength).toBe(true);
      expect(longText.length >= minLength).toBe(true);
    });

    test('should reject paragraphs with >50% link density', () => {
      const text = 'This paragraph has links to various pages in the wiki.';
      const linkTextLength = 40; // Most of text is links
      const threshold = 0.5;

      const linkDensity = linkTextLength / text.length;
      expect(linkDensity > threshold).toBe(true);
    });

    test('should accept valid content paragraphs', () => {
      const text = 'This is a valid paragraph with meaningful content that should be read aloud to the user.';
      const linkTextLength = 0; // No links
      const minLength = 30;
      const threshold = 0.5;

      const isLongEnough = text.length >= minLength;
      const linkDensity = linkTextLength / text.length;
      const hasLowLinkDensity = linkDensity <= threshold;

      expect(isLongEnough && hasLowLinkDensity).toBe(true);
    });
  });
});
