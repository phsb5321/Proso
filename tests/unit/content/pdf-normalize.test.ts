// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for PDF text normalization
 * Tests Unicode normalization, character substitution, and OCR error handling
 *
 * Feature: 041-firefox-first-pivot (T2.2)
 * @module tests/unit/content/pdf-normalize
 */

import { describe, it, expect } from '@jest/globals';
import {
  normalizeText,
  createOCRTolerantPattern,
  getCharacterNormalizationMap,
  getOCRConfusableChars,
} from '../../../src/utils/content/pdf-highlight';

describe('PDF Text Normalization', () => {
  describe('normalizeText', () => {
    describe('basic normalization', () => {
      it('should lowercase text', () => {
        expect(normalizeText('Hello World')).toBe('hello world');
        expect(normalizeText('UPPERCASE')).toBe('uppercase');
        expect(normalizeText('MiXeD CaSe')).toBe('mixed case');
      });

      it('should collapse multiple spaces', () => {
        expect(normalizeText('hello   world')).toBe('hello world');
        expect(normalizeText('too    many     spaces')).toBe('too many spaces');
      });

      it('should trim leading and trailing whitespace', () => {
        expect(normalizeText('  hello  ')).toBe('hello');
        expect(normalizeText('\t\nhello\t\n')).toBe('hello');
      });

      it('should handle empty string', () => {
        expect(normalizeText('')).toBe('');
      });

      it('should handle whitespace-only string', () => {
        expect(normalizeText('   ')).toBe('');
        expect(normalizeText('\t\n\r')).toBe('');
      });
    });

    describe('Unicode NFKC normalization', () => {
      it('should expand ligatures', () => {
        // fi ligature
        expect(normalizeText('\uFB01le')).toBe('file');
        // fl ligature
        expect(normalizeText('\uFB02ower')).toBe('flower');
        // ff ligature
        expect(normalizeText('o\uFB00ice')).toBe('office');
        // ffi ligature
        expect(normalizeText('o\uFB03ce')).toBe('office');
        // ffl ligature
        expect(normalizeText('ba\uFB04e')).toBe('baffle');
      });

      it('should normalize fullwidth characters', () => {
        // Fullwidth Latin letters
        expect(normalizeText('\uFF28\uFF45\uFF4C\uFF4C\uFF4F')).toBe('hello');
      });

      it('should normalize compatibility characters', () => {
        // Superscript 2
        expect(normalizeText('x\u00B2')).toBe('x2');
        // Subscript 2
        expect(normalizeText('H\u2082O')).toBe('h2o');
      });
    });

    describe('quotation mark normalization', () => {
      it('should normalize smart quotes to straight quotes', () => {
        // Left/right single quotes
        expect(normalizeText('\u2018hello\u2019')).toBe("'hello'");
        // Left/right double quotes
        expect(normalizeText('\u201CHello\u201D')).toBe('"hello"');
      });

      it('should normalize various quote styles', () => {
        // Low-9 quotation marks
        expect(normalizeText('\u201Ahello\u201B')).toBe("'hello'");
        expect(normalizeText('\u201Ehello\u201F')).toBe('"hello"');
      });

      it('should normalize angle quotation marks', () => {
        expect(normalizeText('\u00ABhello\u00BB')).toBe('"hello"');
      });

      it('should normalize prime characters', () => {
        // Single prime → single quote
        expect(normalizeText('5\u2032')).toBe("5'");
        // Double prime (U+2033) → NFKC converts to two single primes → two single quotes
        // This is correct behavior - a double prime IS two primes
        expect(normalizeText('10\u2033')).toBe("10''");
      });
    });

    describe('dash and hyphen normalization', () => {
      it('should normalize various dash types to hyphen', () => {
        // Hyphen
        expect(normalizeText('well\u2010known')).toBe('well-known');
        // Non-breaking hyphen
        expect(normalizeText('well\u2011known')).toBe('well-known');
        // Figure dash
        expect(normalizeText('2010\u20122020')).toBe('2010-2020');
        // En dash
        expect(normalizeText('2010\u20132020')).toBe('2010-2020');
        // Em dash
        expect(normalizeText('hello\u2014world')).toBe('hello-world');
      });

      it('should normalize minus sign', () => {
        expect(normalizeText('5 \u2212 3 = 2')).toBe('5 - 3 = 2');
      });
    });

    describe('space normalization', () => {
      it('should normalize non-breaking space', () => {
        expect(normalizeText('hello\u00A0world')).toBe('hello world');
      });

      it('should normalize various Unicode spaces', () => {
        // En space
        expect(normalizeText('hello\u2002world')).toBe('hello world');
        // Em space
        expect(normalizeText('hello\u2003world')).toBe('hello world');
        // Thin space
        expect(normalizeText('hello\u2009world')).toBe('hello world');
        // Hair space
        expect(normalizeText('hello\u200Aworld')).toBe('hello world');
        // Ideographic space
        expect(normalizeText('hello\u3000world')).toBe('hello world');
      });

      it('should collapse multiple special spaces', () => {
        expect(normalizeText('hello\u00A0\u2002\u2003world')).toBe('hello world');
      });
    });

    describe('ellipsis normalization', () => {
      it('should expand horizontal ellipsis', () => {
        expect(normalizeText('hello\u2026world')).toBe('hello...world');
      });
    });

    describe('fraction normalization', () => {
      it('should expand vulgar fractions', () => {
        expect(normalizeText('\u00BC cup')).toBe('1/4 cup');
        expect(normalizeText('\u00BD cup')).toBe('1/2 cup');
        expect(normalizeText('\u00BE cup')).toBe('3/4 cup');
      });

      it('should expand third fractions', () => {
        expect(normalizeText('\u2153 portion')).toBe('1/3 portion');
        expect(normalizeText('\u2154 portion')).toBe('2/3 portion');
      });
    });

    describe('bullet normalization', () => {
      it('should normalize bullets to dashes', () => {
        expect(normalizeText('\u2022 item one')).toBe('- item one');
        expect(normalizeText('\u2023 item two')).toBe('- item two');
      });
    });

    describe('math symbol normalization', () => {
      it('should normalize multiplication sign', () => {
        expect(normalizeText('3 \u00D7 4')).toBe('3 x 4');
      });

      it('should normalize division sign', () => {
        expect(normalizeText('12 \u00F7 3')).toBe('12 / 3');
      });
    });

    describe('real-world PDF text scenarios', () => {
      it('should normalize typical PDF paragraph', () => {
        const pdfText = 'The \u201Cquick\u201D brown fox\u2014jumps over the lazy dog\u2026';
        expect(normalizeText(pdfText)).toBe('the "quick" brown fox-jumps over the lazy dog...');
      });

      it('should normalize text with ligatures', () => {
        const pdfText = 'The o\uFB03ce is on the \uFB01fth \uFB02oor';
        expect(normalizeText(pdfText)).toBe('the office is on the fifth floor');
      });

      it('should normalize measurement text', () => {
        // Note: Double prime (″) is NFKC-normalized to two single primes (′′) → ''
        const pdfText = '5\u2032 10\u2033 \u00D7 3\u2032 \u00BD\u2033';
        // 5′ 10″ × 3′ ½″ → 5' 10'' x 3' 1/2''
        expect(normalizeText(pdfText)).toBe("5' 10'' x 3' 1/2''");
      });

      it('should normalize list items', () => {
        const pdfText = '\u2022\u00A0First item\n\u2022\u00A0Second item';
        expect(normalizeText(pdfText)).toBe('- first item - second item');
      });
    });

    describe('performance characteristics', () => {
      it('should handle long strings efficiently', () => {
        // Generate a 10KB string with various special characters
        const specialChars = '\u201C\u201D\u2018\u2019\u2013\u2014\u00A0\uFB01\uFB02';
        const baseText = 'The quick brown fox jumps over the lazy dog. ';
        let longText = '';
        for (let i = 0; i < 200; i++) {
          longText += baseText + specialChars;
        }

        const start = performance.now();
        const result = normalizeText(longText);
        const elapsed = performance.now() - start;

        // Should complete in under 50ms for ~10KB text
        expect(elapsed).toBeLessThan(50);
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle text with no special characters efficiently', () => {
        const plainText = 'The quick brown fox jumps over the lazy dog. '.repeat(200);

        const start = performance.now();
        const result = normalizeText(plainText);
        const elapsed = performance.now() - start;

        // Should complete in under 20ms when no substitutions needed
        expect(elapsed).toBeLessThan(20);
        expect(result).toBe(plainText.toLowerCase().trim());
      });
    });
  });

  describe('createOCRTolerantPattern', () => {
    describe('basic pattern creation', () => {
      it('should create pattern that matches exact text', () => {
        const pattern = createOCRTolerantPattern('hello');
        expect(pattern.test('hello')).toBe(true);
        expect(pattern.test('HELLO')).toBe(true); // Case insensitive
      });

      it('should create case-insensitive patterns', () => {
        const pattern = createOCRTolerantPattern('test');
        expect(pattern.test('TEST')).toBe(true);
        expect(pattern.test('TeSt')).toBe(true);
      });
    });

    describe('number-letter confusion', () => {
      it('should match 0/O confusion', () => {
        const pattern = createOCRTolerantPattern('o');
        expect(pattern.test('O')).toBe(true);
        expect(pattern.test('0')).toBe(true);

        const patternNum = createOCRTolerantPattern('0');
        expect(patternNum.test('O')).toBe(true);
        expect(patternNum.test('o')).toBe(true);
      });

      it('should match 1/l/I confusion', () => {
        const pattern = createOCRTolerantPattern('l');
        expect(pattern.test('1')).toBe(true);
        expect(pattern.test('I')).toBe(true);
        expect(pattern.test('l')).toBe(true);
        expect(pattern.test('|')).toBe(true);
      });

      it('should match 5/S confusion', () => {
        const pattern = createOCRTolerantPattern('s');
        expect(pattern.test('5')).toBe(true);
        expect(pattern.test('S')).toBe(true);
      });

      it('should match 8/B confusion', () => {
        const pattern = createOCRTolerantPattern('8');
        expect(pattern.test('B')).toBe(true);

        const patternB = createOCRTolerantPattern('b');
        expect(patternB.test('6')).toBe(true);
      });
    });

    describe('multi-character confusion', () => {
      it('should match rn/m confusion', () => {
        const pattern = createOCRTolerantPattern('rn');
        expect(pattern.test('m')).toBe(true);
        expect(pattern.test('rn')).toBe(true);
      });

      it('should handle "modern" with rn/m confusion', () => {
        // "modern" might be OCR'd as "modem" (rn → m)
        const pattern = createOCRTolerantPattern('modern');
        expect(pattern.test('modern')).toBe(true);
        expect(pattern.test('modem')).toBe(true);
      });

      it('should match cl/d confusion', () => {
        const pattern = createOCRTolerantPattern('cl');
        expect(pattern.test('d')).toBe(true);
        expect(pattern.test('cl')).toBe(true);
      });

      it('should match vv/w confusion', () => {
        const pattern = createOCRTolerantPattern('vv');
        expect(pattern.test('w')).toBe(true);
        expect(pattern.test('vv')).toBe(true);
      });
    });

    describe('whitespace handling', () => {
      it('should match flexible whitespace', () => {
        const pattern = createOCRTolerantPattern('hello world');
        expect(pattern.test('hello world')).toBe(true);
        expect(pattern.test('hello  world')).toBe(true);
        expect(pattern.test('hello\tworld')).toBe(true);
        expect(pattern.test('hello\nworld')).toBe(true);
      });
    });

    describe('special regex characters', () => {
      it('should escape special regex characters', () => {
        const pattern = createOCRTolerantPattern('hello.world');
        expect(pattern.test('hello.world')).toBe(true);
        expect(pattern.test('helloXworld')).toBe(false); // . should not match any char
      });

      it('should handle brackets', () => {
        const pattern = createOCRTolerantPattern('[test]');
        expect(pattern.test('[test]')).toBe(true);
      });

      it('should handle parentheses', () => {
        const pattern = createOCRTolerantPattern('(test)');
        expect(pattern.test('(test)')).toBe(true);
      });

      it('should handle asterisks and plus', () => {
        const pattern = createOCRTolerantPattern('a*b+c');
        expect(pattern.test('a*b+c')).toBe(true);
      });
    });

    describe('real-world OCR scenarios', () => {
      it('should match ISBN with 0/O confusion', () => {
        const pattern = createOCRTolerantPattern('isbn 0-123-45678-0');
        expect(pattern.test('ISBN O-123-45678-O')).toBe(true);
        expect(pattern.test('isbn 0-123-45678-0')).toBe(true);
      });

      it('should match "File" with 1/l confusion', () => {
        const pattern = createOCRTolerantPattern('file');
        expect(pattern.test('fi1e')).toBe(true); // l→1
        expect(pattern.test('fIle')).toBe(true); // case insensitive
        expect(pattern.test('fi|e')).toBe(true); // l→| (pipe looks like l)
        expect(pattern.test('f1le')).toBe(true); // i→1
      });

      it('should match "Illinois" with 1/l/I confusion', () => {
        const pattern = createOCRTolerantPattern('illinois');
        expect(pattern.test('Illinois')).toBe(true); // Case insensitive
        expect(pattern.test('i1linois')).toBe(true); // l→1 confusion
        expect(pattern.test('Il1inois')).toBe(true); // second l→1 confusion
      });

      it('should match words with m/rn confusion', () => {
        // Pattern for "modern" should match "modem" (rn → m)
        const pattern = createOCRTolerantPattern('modern');
        expect(pattern.test('modern')).toBe(true);
        expect(pattern.test('modem')).toBe(true);
      });
    });
  });

  describe('getCharacterNormalizationMap', () => {
    it('should return the normalization map', () => {
      const map = getCharacterNormalizationMap();
      expect(map).toBeDefined();
      expect(typeof map).toBe('object');
    });

    it('should contain expected characters', () => {
      const map = getCharacterNormalizationMap();
      expect(map['\u201C']).toBe('"'); // Left double quote
      expect(map['\u2013']).toBe('-'); // En dash
      expect(map['\u00A0']).toBe(' '); // Non-breaking space
    });

    it('should return a copy that does not affect normalization', () => {
      const map = getCharacterNormalizationMap();
      // Modify the returned copy
      (map as Record<string, string>)['\u201C'] = 'test';

      // The internal map should still work correctly
      // (modifying the copy should not affect the original)
      expect(normalizeText('\u201C')).toBe('"');
    });
  });

  describe('getOCRConfusableChars', () => {
    it('should return the OCR confusable characters map', () => {
      const map = getOCRConfusableChars();
      expect(map).toBeDefined();
      expect(typeof map).toBe('object');
    });

    it('should contain expected confusions', () => {
      const map = getOCRConfusableChars();
      expect(map['0']).toContain('O');
      expect(map['1']).toContain('l');
      expect(map['l']).toContain('1');
    });

    it('should have symmetric confusions for common pairs', () => {
      const map = getOCRConfusableChars();
      // If 0 can be confused with O, O should be confusable with 0
      expect(map['0']).toContain('O');
      expect(map['O']).toContain('0');

      // If 1 can be confused with l, l should be confusable with 1
      expect(map['1']).toContain('l');
      expect(map['l']).toContain('1');
    });
  });
});
