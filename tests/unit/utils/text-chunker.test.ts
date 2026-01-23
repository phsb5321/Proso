/**
 * Text Chunker Unit Tests
 *
 * Tests for the chunkText() and findBestBreakPoint() functions
 * used by the Groq TTS provider for handling character limits.
 *
 * @module tests/unit/utils/text-chunker
 */

import { chunkText, findBestBreakPoint } from '../../../src/utils/providers/groq';

describe('findBestBreakPoint', () => {
  it('returns full text if under limit', () => {
    const text = 'Hello world';
    expect(findBestBreakPoint(text, 50)).toBe(text);
  });

  it('breaks at sentence boundary when available', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = findBestBreakPoint(text, 20);
    expect(result).toBe('First sentence.');
  });

  it('breaks at exclamation point', () => {
    const text = 'Hello! How are you today? I am fine.';
    const result = findBestBreakPoint(text, 10);
    expect(result).toBe('Hello!');
  });

  it('breaks at question mark', () => {
    const text = 'How are you? I am fine.';
    const result = findBestBreakPoint(text, 15);
    expect(result).toBe('How are you?');
  });

  it('falls back to clause boundary when no sentence boundary', () => {
    const text = 'First part, second part, third part.';
    const result = findBestBreakPoint(text, 15);
    expect(result).toBe('First part,');
  });

  it('falls back to word boundary when no clause boundary', () => {
    const text = 'Superlongwordthatisverylongindeed another';
    const result = findBestBreakPoint(text, 30);
    // Should break at the space, not in the middle of a word
    expect(result).not.toContain('another');
    expect(result.endsWith(' ')).toBe(false);
  });

  it('hard splits when no natural boundary exists', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const result = findBestBreakPoint(text, 10);
    expect(result).toBe('abcdefghij');
    expect(result.length).toBe(10);
  });

  it('prefers sentence boundary over clause when both available', () => {
    const text = 'Hello, world. This is a test, indeed.';
    const result = findBestBreakPoint(text, 15);
    expect(result).toBe('Hello, world.');
  });

  it('ignores boundaries too early in text (< 50% for sentences)', () => {
    const text = 'A. Very long text that continues on and on without stopping';
    const result = findBestBreakPoint(text, 30);
    // "A. " is at position 2, which is < 50% of 30 = 15, so it should be ignored
    expect(result.length).toBeGreaterThan(3);
  });
});

describe('chunkText', () => {
  it('returns single chunk for text under limit', () => {
    const text = 'Hello world';
    const chunks = chunkText(text, 50);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      text: 'Hello world',
      index: 0,
      isLast: true,
      originalStart: 0,
      originalEnd: 11,
    });
  });

  it('splits text into multiple chunks when over limit', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].isLast).toBe(false);
    expect(chunks[chunks.length - 1].isLast).toBe(true);
  });

  it('maintains correct indices', () => {
    const text = 'First. Second. Third.';
    const chunks = chunkText(text, 10);

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('sets isLast correctly', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, 20);

    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].isLast).toBe(false);
    }
    expect(chunks[chunks.length - 1].isLast).toBe(true);
  });

  it('handles empty text', () => {
    const chunks = chunkText('', 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('');
  });

  it('handles text exactly at limit', () => {
    const text = 'Hello'; // 5 chars
    const chunks = chunkText(text, 5);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello');
    expect(chunks[0].isLast).toBe(true);
  });

  it('trims leading whitespace from subsequent chunks', () => {
    const text = 'First chunk.    Second chunk with extra spaces.';
    const chunks = chunkText(text, 15);

    // Second chunk should have leading spaces trimmed
    for (const chunk of chunks) {
      expect(chunk.text).toBe(chunk.text.trimStart());
    }
  });

  it('handles very small max chars (Orpheus 200 limit simulation)', () => {
    const longText =
      'This is a longer piece of text that would need to be split into multiple smaller chunks when using the Orpheus model which has a 200 character limit. We need to ensure proper sentence boundary splitting for natural-sounding audio concatenation.';
    const chunks = chunkText(longText, 200);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    });
  });

  it('preserves full text across all chunks', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, 20);

    // Reconstruct (approximation - some whitespace may differ)
    const reconstructed = chunks.map((c) => c.text).join(' ');
    expect(reconstructed.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('handles 200 char limit (Orpheus model)', () => {
    const text = 'A'.repeat(500);
    const chunks = chunkText(text, 200);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].text.length).toBe(200);
    expect(chunks[1].text.length).toBe(200);
    expect(chunks[2].text.length).toBe(100);
  });

  it('handles 10000 char limit (PlayAI model)', () => {
    const text = 'B'.repeat(15000);
    const chunks = chunkText(text, 10000);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.length).toBe(10000);
    expect(chunks[1].text.length).toBe(5000);
  });
});
