/**
 * Sentence chunker unit tests (spec 100 FR-7).
 *
 * Property guarantees: concatenation reproduces the input (up to whitespace
 * collapsing), no chunk is empty, every chunk is within the host's UTF-8 byte
 * bound, and a single sentence over the bound is refused, never truncated.
 *
 * @module tests/unit/core/audio/sentence-chunker
 */

import { describe, expect, it } from '@jest/globals';
import {
  CHUNK_MAX_TEXT_UTF8_BYTES,
  splitSentences,
  utf8ByteLength,
} from '../../../../src/core/audio/sentence-chunker';
import { isErr, isOk } from '../../../../src/core/shared/result';

describe('splitSentences', () => {
  it('splits at sentence terminators, keeping them with the sentence', () => {
    const result = splitSentences('Hello world. This is second! And third?');
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual(['Hello world.', 'This is second!', 'And third?']);
  });

  it('handles ellipsis and terminal punctuation without space', () => {
    const result = splitSentences('Wait… What?No way.');
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual(['Wait…', 'What?', 'No way.']);
  });

  it('does not split on abbreviations or decimals (v1.2, Mr. X)', () => {
    const result = splitSentences('The v1.2 API and Mr. Smith agree.');
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual(['The v1.2 API and Mr. Smith agree.']);
  });

  it('property: concatenation reproduces the input', () => {
    const input =
      'First sentence of the paragraph. Second one here! A third with numbers 1.5 and 2.5? ' +
      'Final sentence ends the paragraph.';
    const result = splitSentences(input);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.join(' ')).toBe(input.replace(/\s+/g, ' ').trim());
  });

  it('property: no chunk is empty and every chunk is within the byte bound', () => {
    const paragraphs = [
      'Short.',
      'A slightly longer sentence with several words to test the splitter.',
      'Sentence one. Sentence two. Sentence three with a question? Sentence four!',
    ];
    for (const paragraph of paragraphs) {
      const result = splitSentences(paragraph);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.length).toBeGreaterThan(0);
      for (const chunk of result.value) {
        expect(chunk.length).toBeGreaterThan(0);
        expect(utf8ByteLength(chunk)).toBeLessThanOrEqual(CHUNK_MAX_TEXT_UTF8_BYTES);
      }
    }
  });

  it('measures bytes, not characters (multibyte PT-BR text)', () => {
    const accented = 'Ação e concessão de crédito.';
    expect(utf8ByteLength(accented)).toBeGreaterThan(accented.length);
    const result = splitSentences(accented);
    expect(isOk(result)).toBe(true);
  });

  it('refuses a single sentence over the byte bound rather than truncating', () => {
    const huge = 'x'.repeat(CHUNK_MAX_TEXT_UTF8_BYTES + 1);
    const result = splitSentences(huge);
    expect(isErr(result)).toBe(true);
  });

  it('refuses empty input', () => {
    expect(isErr(splitSentences(''))).toBe(true);
    expect(isErr(splitSentences('   '))).toBe(true);
  });
});
