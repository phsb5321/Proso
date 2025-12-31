/**
 * Unit tests for TextSegment (T071)
 */

import { TextSegment, TextSegmentMap } from '../../content/text-segment.js';

describe('TextSegment', () => {
  describe('Constructor', () => {
    it('should create a segment with required properties', () => {
      const mockElement = { textContent: 'Hello world' };
      const segment = new TextSegment({
        id: 'test-1',
        text: 'Hello world',
        element: mockElement,
        charStart: 0,
        charEnd: 11
      });

      expect(segment.id).toBe('test-1');
      expect(segment.text).toBe('Hello world');
      expect(segment.element).toBe(mockElement);
      expect(segment.charRange.start).toBe(0);
      expect(segment.charRange.end).toBe(11);
      expect(segment.type).toBe('paragraph');
    });

    it('should accept custom type', () => {
      const segment = new TextSegment({
        id: 'heading-1',
        text: 'Title',
        element: {},
        charStart: 0,
        charEnd: 5,
        type: 'heading'
      });

      expect(segment.type).toBe('heading');
    });
  });

  describe('findWordBoundaries', () => {
    it('should find word boundaries in text', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'Hello world',
        element: {},
        charStart: 0,
        charEnd: 11
      });

      expect(segment.words.length).toBe(2);
      expect(segment.words[0].word).toBe('Hello');
      expect(segment.words[0].charOffset).toBe(0);
      expect(segment.words[0].charLength).toBe(5);
      expect(segment.words[1].word).toBe('world');
      expect(segment.words[1].charOffset).toBe(6);
      expect(segment.words[1].charLength).toBe(5);
    });

    it('should handle punctuation', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'Hello, world!',
        element: {},
        charStart: 0,
        charEnd: 13
      });

      expect(segment.words.length).toBe(2);
      expect(segment.words[0].word).toBe('Hello');
      expect(segment.words[1].word).toBe('world');
    });

    it('should handle contractions', () => {
      const segment = new TextSegment({
        id: 'test',
        text: "don't stop",
        element: {},
        charStart: 0,
        charEnd: 10
      });

      // Contractions should be handled (may be 2 or 3 words depending on regex)
      expect(segment.words.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle numbers', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'Version 2.0',
        element: {},
        charStart: 0,
        charEnd: 11
      });

      expect(segment.words.some(w => w.word === 'Version')).toBe(true);
      expect(segment.words.some(w => w.word === '2')).toBe(true);
    });

    it('should handle unicode characters', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'Café résumé',
        element: {},
        charStart: 0,
        charEnd: 11
      });

      expect(segment.words.length).toBe(2);
      expect(segment.words[0].word).toBe('Café');
      expect(segment.words[1].word).toBe('résumé');
    });

    it('should handle empty text', () => {
      const segment = new TextSegment({
        id: 'test',
        text: '',
        element: {},
        charStart: 0,
        charEnd: 0
      });

      expect(segment.words.length).toBe(0);
    });
  });

  describe('getWord', () => {
    let segment;

    beforeEach(() => {
      segment = new TextSegment({
        id: 'test',
        text: 'One two three',
        element: {},
        charStart: 0,
        charEnd: 13
      });
    });

    it('should return word at valid index', () => {
      const word = segment.getWord(1);
      expect(word.word).toBe('two');
    });

    it('should return null for invalid index', () => {
      expect(segment.getWord(-1)).toBeNull();
      expect(segment.getWord(100)).toBeNull();
    });
  });

  describe('wordCount', () => {
    it('should return correct word count', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'One two three four',
        element: {},
        charStart: 0,
        charEnd: 18
      });

      expect(segment.wordCount).toBe(4);
    });
  });

  describe('findWordAtOffset', () => {
    let segment;

    beforeEach(() => {
      segment = new TextSegment({
        id: 'test',
        text: 'Hello world',
        element: {},
        charStart: 0,
        charEnd: 11
      });
    });

    it('should find word at character offset', () => {
      expect(segment.findWordAtOffset(0)).toBe(0);  // Start of "Hello"
      expect(segment.findWordAtOffset(3)).toBe(0);  // Inside "Hello"
      expect(segment.findWordAtOffset(6)).toBe(1);  // Start of "world"
      expect(segment.findWordAtOffset(9)).toBe(1);  // Inside "world"
    });

    it('should return -1 for offset in whitespace', () => {
      expect(segment.findWordAtOffset(5)).toBe(-1); // Space between words
    });

    it('should return -1 for out of range offset', () => {
      expect(segment.findWordAtOffset(100)).toBe(-1);
    });
  });

  describe('containsOffset', () => {
    it('should correctly identify if offset is in range', () => {
      const segment = new TextSegment({
        id: 'test',
        text: 'Hello',
        element: {},
        charStart: 10,
        charEnd: 15
      });

      expect(segment.containsOffset(10)).toBe(true);
      expect(segment.containsOffset(12)).toBe(true);
      expect(segment.containsOffset(14)).toBe(true);
      expect(segment.containsOffset(15)).toBe(false); // End is exclusive
      expect(segment.containsOffset(9)).toBe(false);
    });
  });

  describe('toLocalOffset / toGlobalOffset', () => {
    let segment;

    beforeEach(() => {
      segment = new TextSegment({
        id: 'test',
        text: 'Hello',
        element: {},
        charStart: 100,
        charEnd: 105
      });
    });

    it('should convert global to local offset', () => {
      expect(segment.toLocalOffset(102)).toBe(2);
    });

    it('should return -1 for offset not in segment', () => {
      expect(segment.toLocalOffset(50)).toBe(-1);
    });

    it('should convert local to global offset', () => {
      expect(segment.toGlobalOffset(2)).toBe(102);
    });
  });
});

describe('TextSegmentMap', () => {
  describe('buildFromElements', () => {
    it('should build map from paragraph elements', () => {
      const mockElements = [
        { textContent: 'First paragraph', tagName: 'P' },
        { textContent: 'Second paragraph', tagName: 'P' }
      ];

      const map = new TextSegmentMap();
      map.buildFromElements(mockElements);

      expect(map.count).toBe(2);
    });

    it('should assign correct character ranges', () => {
      const mockElements = [
        { textContent: 'Hello', tagName: 'P' },
        { textContent: 'World', tagName: 'P' }
      ];

      const map = new TextSegmentMap();
      map.buildFromElements(mockElements);

      const first = map.getByIndex(0);
      const second = map.getByIndex(1);

      expect(first.charRange.start).toBe(0);
      expect(first.charRange.end).toBe(5);
      expect(second.charRange.start).toBe(7); // 5 + 2 for paragraph separator
      expect(second.charRange.end).toBe(12);
    });
  });

  describe('getByIndex', () => {
    let map;

    beforeEach(() => {
      map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'First', tagName: 'P' },
        { textContent: 'Second', tagName: 'P' }
      ]);
    });

    it('should return segment at valid index', () => {
      const segment = map.getByIndex(0);
      expect(segment.text).toBe('First');
    });

    it('should return null for invalid index', () => {
      expect(map.getByIndex(-1)).toBeNull();
      expect(map.getByIndex(100)).toBeNull();
    });
  });

  describe('getById', () => {
    let map;

    beforeEach(() => {
      map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Test', tagName: 'P' }
      ]);
    });

    it('should return segment by ID', () => {
      const segment = map.getById('segment-0');
      expect(segment).toBeDefined();
      expect(segment.text).toBe('Test');
    });

    it('should return undefined for invalid ID', () => {
      expect(map.getById('invalid')).toBeUndefined();
    });
  });

  describe('findByOffset', () => {
    let map;

    beforeEach(() => {
      map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Hello', tagName: 'P' },
        { textContent: 'World', tagName: 'P' }
      ]);
    });

    it('should find segment containing offset', () => {
      const segment = map.findByOffset(2);
      expect(segment.text).toBe('Hello');
    });

    it('should return null for offset not in any segment', () => {
      expect(map.findByOffset(6)).toBeNull(); // In separator
      expect(map.findByOffset(100)).toBeNull();
    });
  });

  describe('detectSegmentType', () => {
    it('should detect heading type', () => {
      const map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Title', tagName: 'H1' }
      ]);

      expect(map.getByIndex(0).type).toBe('heading');
    });

    it('should detect list item type', () => {
      const map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Item', tagName: 'LI' }
      ]);

      expect(map.getByIndex(0).type).toBe('listItem');
    });

    it('should default to paragraph type', () => {
      const map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Text', tagName: 'DIV' }
      ]);

      expect(map.getByIndex(0).type).toBe('paragraph');
    });
  });

  describe('clear', () => {
    it('should clear all segments', () => {
      const map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'Test', tagName: 'P' }
      ]);

      map.clear();

      expect(map.count).toBe(0);
    });
  });

  describe('forEach', () => {
    it('should iterate over segments', () => {
      const map = new TextSegmentMap();
      map.buildFromElements([
        { textContent: 'A', tagName: 'P' },
        { textContent: 'B', tagName: 'P' }
      ]);

      const texts = [];
      map.forEach((segment) => {
        texts.push(segment.text);
      });

      expect(texts).toEqual(['A', 'B']);
    });
  });
});
