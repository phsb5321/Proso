/**
 * Extracted Content Entity Unit Tests
 *
 * Tests for the pure factory functions that create content data structures.
 * No mocks needed - these are pure functions with no side effects.
 *
 * @module tests/unit/core/content-extraction/extracted-content
 */

import { describe, it, expect } from '@jest/globals';
import {
  createEmptyContent,
  createParagraph,
  createExtractedContent,
  getTextArray,
  getParagraphAt,
  estimateReadingTime,
  estimateTTSDuration,
  type Paragraph,
  type ParagraphType,
  type ExtractedContent,
  type ContentScore,
} from '../../../../src/core/content-extraction/extracted-content';

describe('createParagraph', () => {
  it('should create a paragraph with correct fields', () => {
    const p = createParagraph('Hello world', 0);

    expect(p.text).toBe('Hello world');
    expect(p.index).toBe(0);
    expect(p.type).toBe('paragraph');
    expect(p.characterCount).toBe(11);
  });

  it('should default type to "paragraph"', () => {
    const p = createParagraph('Some text', 5);
    expect(p.type).toBe('paragraph');
  });

  it('should accept "heading" type', () => {
    const p = createParagraph('Chapter 1', 0, 'heading');
    expect(p.type).toBe('heading');
  });

  it('should accept "list" type', () => {
    const p = createParagraph('- item one', 2, 'list');
    expect(p.type).toBe('list');
  });

  it('should calculate characterCount from text length', () => {
    const text = 'abcdef';
    const p = createParagraph(text, 0);
    expect(p.characterCount).toBe(6);
  });

  it('should handle empty text', () => {
    const p = createParagraph('', 0);

    expect(p.text).toBe('');
    expect(p.characterCount).toBe(0);
  });

  it('should handle unicode text', () => {
    const text = 'Ol\u00e1 mundo';
    const p = createParagraph(text, 0);
    expect(p.characterCount).toBe(text.length);
  });

  it('should preserve the index as provided', () => {
    const p = createParagraph('text', 42);
    expect(p.index).toBe(42);
  });
});

describe('createEmptyContent', () => {
  it('should create content with empty paragraphs', () => {
    const content = createEmptyContent('https://example.com');

    expect(content.paragraphs).toEqual([]);
    expect(content.totalCharacters).toBe(0);
    expect(content.extractionTimeMs).toBe(0);
    expect(content.sourceUrl).toBe('https://example.com');
    expect(content.title).toBeNull();
  });

  it('should preserve the sourceUrl', () => {
    const url = 'https://example.com/article?id=123';
    const content = createEmptyContent(url);
    expect(content.sourceUrl).toBe(url);
  });

  it('should handle empty string URL', () => {
    const content = createEmptyContent('');
    expect(content.sourceUrl).toBe('');
  });

  it('should return readonly paragraphs array', () => {
    const content = createEmptyContent('https://example.com');
    expect(Array.isArray(content.paragraphs)).toBe(true);
    expect(content.paragraphs.length).toBe(0);
  });
});

describe('createExtractedContent', () => {
  const sampleParagraphs: Paragraph[] = [
    createParagraph('First paragraph with some text.', 0),
    createParagraph('Second paragraph.', 1),
    createParagraph('Third paragraph is the longest one here.', 2, 'heading'),
  ];

  it('should create content from paragraphs', () => {
    const content = createExtractedContent(
      sampleParagraphs,
      'https://example.com',
      'Test Title',
      150,
    );

    expect(content.paragraphs).toBe(sampleParagraphs);
    expect(content.sourceUrl).toBe('https://example.com');
    expect(content.title).toBe('Test Title');
    expect(content.extractionTimeMs).toBe(150);
  });

  it('should compute totalCharacters as sum of all paragraph characterCounts', () => {
    const content = createExtractedContent(
      sampleParagraphs,
      'https://example.com',
      null,
      0,
    );

    const expectedTotal = sampleParagraphs.reduce((sum, p) => sum + p.characterCount, 0);
    expect(content.totalCharacters).toBe(expectedTotal);
  });

  it('should handle empty paragraphs array', () => {
    const content = createExtractedContent([], 'https://example.com', null, 0);

    expect(content.paragraphs).toEqual([]);
    expect(content.totalCharacters).toBe(0);
  });

  it('should accept null title', () => {
    const content = createExtractedContent(sampleParagraphs, 'https://example.com', null, 0);
    expect(content.title).toBeNull();
  });

  it('should accept non-null title', () => {
    const content = createExtractedContent(
      sampleParagraphs,
      'https://example.com',
      'My Article',
      0,
    );
    expect(content.title).toBe('My Article');
  });

  it('should preserve extractionTimeMs', () => {
    const content = createExtractedContent(sampleParagraphs, 'https://example.com', null, 999);
    expect(content.extractionTimeMs).toBe(999);
  });

  it('should handle single paragraph', () => {
    const single = [createParagraph('Only paragraph', 0)];
    const content = createExtractedContent(single, 'https://example.com', null, 10);

    expect(content.totalCharacters).toBe(14);
    expect(content.paragraphs.length).toBe(1);
  });
});

describe('getTextArray', () => {
  it('should return array of paragraph texts', () => {
    const paragraphs = [
      createParagraph('First', 0),
      createParagraph('Second', 1),
      createParagraph('Third', 2),
    ];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const texts = getTextArray(content);

    expect(texts).toEqual(['First', 'Second', 'Third']);
  });

  it('should return empty array for empty content', () => {
    const content = createEmptyContent('https://example.com');

    const texts = getTextArray(content);

    expect(texts).toEqual([]);
  });

  it('should return readonly array', () => {
    const paragraphs = [createParagraph('text', 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const texts = getTextArray(content);
    expect(Array.isArray(texts)).toBe(true);
    expect(texts.length).toBe(1);
  });
});

describe('getParagraphAt', () => {
  const paragraphs = [
    createParagraph('First', 0),
    createParagraph('Second', 1),
    createParagraph('Third', 2),
  ];
  const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

  it('should return paragraph at valid index', () => {
    const p = getParagraphAt(content, 0);
    expect(p).not.toBeNull();
    expect(p!.text).toBe('First');
  });

  it('should return correct paragraph for each valid index', () => {
    expect(getParagraphAt(content, 0)!.text).toBe('First');
    expect(getParagraphAt(content, 1)!.text).toBe('Second');
    expect(getParagraphAt(content, 2)!.text).toBe('Third');
  });

  it('should return null for negative index', () => {
    expect(getParagraphAt(content, -1)).toBeNull();
  });

  it('should return null for index equal to length', () => {
    expect(getParagraphAt(content, 3)).toBeNull();
  });

  it('should return null for index beyond length', () => {
    expect(getParagraphAt(content, 100)).toBeNull();
  });

  it('should return null for empty content', () => {
    const empty = createEmptyContent('https://example.com');
    expect(getParagraphAt(empty, 0)).toBeNull();
  });
});

describe('estimateReadingTime', () => {
  it('should estimate reading time based on characters', () => {
    // 500 characters / 5 = 100 words, at 150 wpm = 40 seconds
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const time = estimateReadingTime(content);

    expect(time).toBe(40);
  });

  it('should return 0 for empty content', () => {
    const content = createEmptyContent('https://example.com');
    const time = estimateReadingTime(content);
    expect(time).toBe(0);
  });

  it('should accept custom wordsPerMinute', () => {
    // 500 characters / 5 = 100 words, at 200 wpm = 30 seconds
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const time = estimateReadingTime(content, 200);

    expect(time).toBe(30);
  });

  it('should use default 150 wpm', () => {
    // 750 characters / 5 = 150 words, at 150 wpm = 60 seconds
    const paragraphs = [createParagraph('x'.repeat(750), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const time = estimateReadingTime(content);

    expect(time).toBe(60);
  });

  it('should sum characters across multiple paragraphs', () => {
    // 250 + 250 = 500 characters / 5 = 100 words, at 150 wpm = 40s
    const paragraphs = [
      createParagraph('a'.repeat(250), 0),
      createParagraph('b'.repeat(250), 1),
    ];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const time = estimateReadingTime(content);

    expect(time).toBe(40);
  });
});

describe('estimateTTSDuration', () => {
  it('should divide reading time by speed', () => {
    // 500 chars / 5 = 100 words, at 150 wpm = 40s, at 2x speed = 20s
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const duration = estimateTTSDuration(content, 150, 2.0);

    expect(duration).toBe(20);
  });

  it('should default speed to 1.0', () => {
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const withDefault = estimateTTSDuration(content);
    const withExplicit = estimateTTSDuration(content, 150, 1.0);

    expect(withDefault).toBe(withExplicit);
  });

  it('should return 0 for empty content', () => {
    const content = createEmptyContent('https://example.com');
    const duration = estimateTTSDuration(content);
    expect(duration).toBe(0);
  });

  it('should handle slow speed (0.5x)', () => {
    // 500 chars / 5 = 100 words, at 150 wpm = 40s, at 0.5x speed = 80s
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const duration = estimateTTSDuration(content, 150, 0.5);

    expect(duration).toBe(80);
  });

  it('should accept custom wordsPerMinute', () => {
    // 500 chars / 5 = 100 words, at 200 wpm = 30s, at 1.5x speed = 20s
    const paragraphs = [createParagraph('x'.repeat(500), 0)];
    const content = createExtractedContent(paragraphs, 'https://example.com', null, 0);

    const duration = estimateTTSDuration(content, 200, 1.5);

    expect(duration).toBe(20);
  });
});

describe('type exports', () => {
  it('should enforce ParagraphType union', () => {
    const types: ParagraphType[] = ['paragraph', 'heading', 'list'];
    expect(types).toHaveLength(3);
  });

  it('should have readonly Paragraph fields', () => {
    const p = createParagraph('test', 0);
    // Verify the shape of the Paragraph interface
    expect(p).toHaveProperty('text');
    expect(p).toHaveProperty('index');
    expect(p).toHaveProperty('type');
    expect(p).toHaveProperty('characterCount');
  });

  it('should have readonly ExtractedContent fields', () => {
    const content = createEmptyContent('https://example.com');
    expect(content).toHaveProperty('paragraphs');
    expect(content).toHaveProperty('totalCharacters');
    expect(content).toHaveProperty('extractionTimeMs');
    expect(content).toHaveProperty('sourceUrl');
    expect(content).toHaveProperty('title');
  });

  it('should satisfy ContentScore interface shape', () => {
    const score: ContentScore = {
      score: 0.85,
      paragraphCount: 10,
      linkDensity: 0.05,
      headingCount: 3,
    };
    expect(score.score).toBe(0.85);
    expect(score.paragraphCount).toBe(10);
    expect(score.linkDensity).toBe(0.05);
    expect(score.headingCount).toBe(3);
  });
});
