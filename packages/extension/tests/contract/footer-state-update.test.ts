/**
 * Footer State Update Contract Tests
 *
 * Tests the FOOTER_STATE_UPDATE message contract between background and content script.
 *
 * @module tests/contract/footer-state-update.test
 * @feature 046-bug-bounty-sprint
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  FooterStateUpdateSchema,
  ParagraphClickedSchema,
  HighlightUpdateSchema,
  formatTime,
  parseTime,
} from './schemas/footer-state';

describe('FOOTER_STATE_UPDATE Contract (US1)', () => {
  describe('FooterStateUpdateSchema validation', () => {
    it('should accept valid footer state update payload', () => {
      const validPayload = {
        isPlaying: true,
        currentTime: '1:30',
        totalTime: '5:00',
        progress: 30,
        currentParagraph: 3,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should accept payload with paused state', () => {
      const payload = {
        isPlaying: false,
        currentTime: '0:00',
        totalTime: '3:45',
        progress: 0,
        currentParagraph: 1,
        totalParagraphs: 5,
      };

      const result = FooterStateUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept payload with 100% progress', () => {
      const payload = {
        isPlaying: false,
        currentTime: '5:00',
        totalTime: '5:00',
        progress: 100,
        currentParagraph: 10,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid time format (no colon)', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '130', // Invalid - missing colon
        totalTime: '5:00',
        progress: 30,
        currentParagraph: 3,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid time format (single digit seconds)', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '1:3', // Invalid - seconds must be 2 digits
        totalTime: '5:00',
        progress: 30,
        currentParagraph: 3,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject progress outside 0-100 range', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '1:30',
        totalTime: '5:00',
        progress: 150, // Invalid - over 100
        currentParagraph: 3,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject negative progress', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '1:30',
        totalTime: '5:00',
        progress: -10, // Invalid - negative
        currentParagraph: 3,
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject currentParagraph less than 1', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '1:30',
        totalTime: '5:00',
        progress: 30,
        currentParagraph: 0, // Invalid - must be >= 1
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer paragraph values', () => {
      const invalidPayload = {
        isPlaying: true,
        currentTime: '1:30',
        totalTime: '5:00',
        progress: 30,
        currentParagraph: 3.5, // Invalid - must be integer
        totalParagraphs: 10,
      };

      const result = FooterStateUpdateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompletePayload = {
        isPlaying: true,
        currentTime: '1:30',
        // Missing totalTime, progress, currentParagraph, totalParagraphs
      };

      const result = FooterStateUpdateSchema.safeParse(incompletePayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Time format validation edge cases', () => {
    it('should accept single-digit minutes', () => {
      const payload = {
        isPlaying: true,
        currentTime: '5:30',
        totalTime: '9:59',
        progress: 50,
        currentParagraph: 1,
        totalParagraphs: 1,
      };

      const result = FooterStateUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept double-digit minutes', () => {
      const payload = {
        isPlaying: true,
        currentTime: '15:30',
        totalTime: '99:59',
        progress: 50,
        currentParagraph: 1,
        totalParagraphs: 1,
      };

      const result = FooterStateUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept zero time', () => {
      const payload = {
        isPlaying: false,
        currentTime: '0:00',
        totalTime: '0:00',
        progress: 0,
        currentParagraph: 1,
        totalParagraphs: 1,
      };

      const result = FooterStateUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('formatTime produces correct M:SS format', () => {
    it('should format 0 seconds correctly', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format 59 seconds correctly', () => {
      expect(formatTime(59)).toBe('0:59');
    });

    it('should format exactly 1 minute correctly', () => {
      expect(formatTime(60)).toBe('1:00');
    });

    it('should format 90 seconds as 1:30', () => {
      expect(formatTime(90)).toBe('1:30');
    });

    it('should format 125 seconds as 2:05 (with leading zero)', () => {
      expect(formatTime(125)).toBe('2:05');
    });

    it('should format large values correctly', () => {
      expect(formatTime(3600)).toBe('60:00'); // 1 hour
      expect(formatTime(7200)).toBe('120:00'); // 2 hours
    });

    it('should handle fractional seconds by truncating', () => {
      expect(formatTime(90.5)).toBe('1:30');
      expect(formatTime(90.9)).toBe('1:30');
    });

    it('should handle NaN gracefully', () => {
      expect(formatTime(NaN)).toBe('0:00');
    });

    it('should handle Infinity gracefully', () => {
      expect(formatTime(Infinity)).toBe('0:00');
    });

    it('should handle negative values gracefully', () => {
      expect(formatTime(-10)).toBe('0:00');
    });
  });

  describe('parseTime is inverse of formatTime', () => {
    it('should parse "0:00" as 0', () => {
      expect(parseTime('0:00')).toBe(0);
    });

    it('should parse "1:30" as 90', () => {
      expect(parseTime('1:30')).toBe(90);
    });

    it('should parse "60:00" as 3600', () => {
      expect(parseTime('60:00')).toBe(3600);
    });

    it('should handle round-trip conversion', () => {
      const testValues = [0, 1, 30, 60, 90, 125, 300, 599, 600, 3600];
      for (const seconds of testValues) {
        const formatted = formatTime(seconds);
        const parsed = parseTime(formatted);
        expect(parsed).toBe(seconds);
      }
    });

    it('should return 0 for invalid input', () => {
      expect(parseTime('')).toBe(0);
      expect(parseTime('invalid')).toBe(0);
      expect(parseTime('1:2:3')).toBe(0);
      expect(parseTime('abc:de')).toBe(0);
    });
  });
});

describe('ParagraphClickedSchema Contract', () => {
  it('should accept valid paragraph click payload', () => {
    const payload = {
      index: 5,
      timestamp: Date.now(),
    };

    const result = ParagraphClickedSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept index 0 (first paragraph)', () => {
    const payload = {
      index: 0,
      timestamp: Date.now(),
    };

    const result = ParagraphClickedSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject negative index', () => {
    const payload = {
      index: -1,
      timestamp: Date.now(),
    };

    const result = ParagraphClickedSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer index', () => {
    const payload = {
      index: 3.5,
      timestamp: Date.now(),
    };

    const result = ParagraphClickedSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject negative timestamp', () => {
    const payload = {
      index: 5,
      timestamp: -1,
    };

    const result = ParagraphClickedSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('HighlightUpdateSchema Contract', () => {
  it('should accept valid highlight update without word timing', () => {
    const payload = {
      activeIndex: 3,
    };

    const result = HighlightUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept highlight update with word timing', () => {
    const payload = {
      activeIndex: 3,
      wordStart: 10,
      wordEnd: 15,
    };

    const result = HighlightUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject negative activeIndex', () => {
    const payload = {
      activeIndex: -1,
    };

    const result = HighlightUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject negative word positions', () => {
    const payload = {
      activeIndex: 3,
      wordStart: -1,
      wordEnd: 5,
    };

    const result = HighlightUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
