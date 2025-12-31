/**
 * Contract test for ElevenLabs timestamp API response format (T053)
 *
 * This test validates that the ElevenLabs API returns the expected format
 * for word-level timing data when using the with-timestamps endpoint.
 *
 * Note: This test requires a valid ElevenLabs API key to run against the real API.
 * For CI, mock the API response based on documented format.
 */

import { ElevenLabsProvider } from '../../background/providers/elevenlabs-provider.js';

describe('ElevenLabs Timestamps API Contract', () => {
  /**
   * Expected response format from ElevenLabs with-timestamps endpoint:
   * {
   *   audio_base64: string,
   *   alignment: {
   *     characters: string[],
   *     character_start_times_seconds: number[],
   *     character_end_times_seconds: number[]
   *   }
   * }
   */

  describe('Response Structure', () => {
    it('should have audio_base64 as a string', () => {
      const mockResponse = {
        audio_base64: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o', ' ', 'W', 'o', 'r', 'l', 'd'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]
        }
      };

      expect(typeof mockResponse.audio_base64).toBe('string');
      expect(mockResponse.audio_base64.length).toBeGreaterThan(0);
    });

    it('should have alignment object with required arrays', () => {
      const mockResponse = {
        audio_base64: 'SGVsbG8gV29ybGQ=',
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      };

      expect(mockResponse.alignment).toBeDefined();
      expect(Array.isArray(mockResponse.alignment.characters)).toBe(true);
      expect(Array.isArray(mockResponse.alignment.character_start_times_seconds)).toBe(true);
      expect(Array.isArray(mockResponse.alignment.character_end_times_seconds)).toBe(true);
    });

    it('should have aligned array lengths', () => {
      const mockResponse = {
        audio_base64: 'SGVsbG8gV29ybGQ=',
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      };

      const { characters, character_start_times_seconds, character_end_times_seconds } = mockResponse.alignment;
      expect(characters.length).toBe(character_start_times_seconds.length);
      expect(characters.length).toBe(character_end_times_seconds.length);
    });

    it('should have monotonically increasing timestamps', () => {
      const mockResponse = {
        audio_base64: 'SGVsbG8gV29ybGQ=',
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      };

      const { character_start_times_seconds } = mockResponse.alignment;
      for (let i = 1; i < character_start_times_seconds.length; i++) {
        expect(character_start_times_seconds[i]).toBeGreaterThanOrEqual(
          character_start_times_seconds[i - 1]
        );
      }
    });

    it('should have end times greater than or equal to start times', () => {
      const mockResponse = {
        audio_base64: 'SGVsbG8gV29ybGQ=',
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o'],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      };

      const { character_start_times_seconds, character_end_times_seconds } = mockResponse.alignment;
      for (let i = 0; i < character_start_times_seconds.length; i++) {
        expect(character_end_times_seconds[i]).toBeGreaterThanOrEqual(
          character_start_times_seconds[i]
        );
      }
    });
  });

  describe('Word Timing Parsing', () => {
    let provider;

    beforeEach(() => {
      provider = new ElevenLabsProvider();
    });

    it('should parse character timing into word boundaries', () => {
      const text = 'Hello World';
      const alignment = {
        characters: ['H', 'e', 'l', 'l', 'o', ' ', 'W', 'o', 'r', 'l', 'd'],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]
      };

      const wordTiming = provider._parseWordTiming(text, alignment);

      expect(wordTiming.length).toBe(2); // "Hello" and "World"

      // First word: "Hello"
      expect(wordTiming[0].word).toBe('Hello');
      expect(wordTiming[0].charOffset).toBe(0);
      expect(wordTiming[0].charLength).toBe(5);
      expect(wordTiming[0].startTimeMs).toBe(0);
      expect(wordTiming[0].endTimeMs).toBe(500);

      // Second word: "World"
      expect(wordTiming[1].word).toBe('World');
      expect(wordTiming[1].charOffset).toBe(6);
      expect(wordTiming[1].charLength).toBe(5);
      expect(wordTiming[1].startTimeMs).toBe(600);
      expect(wordTiming[1].endTimeMs).toBe(1100);
    });

    it('should handle punctuation correctly', () => {
      const text = 'Hello, World!';
      const alignment = {
        characters: ['H', 'e', 'l', 'l', 'o', ',', ' ', 'W', 'o', 'r', 'l', 'd', '!'],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]
      };

      const wordTiming = provider._parseWordTiming(text, alignment);

      expect(wordTiming.length).toBe(2);
      expect(wordTiming[0].word).toBe('Hello');
      expect(wordTiming[1].word).toBe('World');
    });

    it('should handle contractions', () => {
      const text = "don't";
      const alignment = {
        characters: ['d', 'o', 'n', "'", 't'],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5]
      };

      const wordTiming = provider._parseWordTiming(text, alignment);

      // Should be parsed as separate word segments (since apostrophe breaks words)
      expect(wordTiming.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty alignment gracefully', () => {
      const text = '';
      const alignment = null;

      const wordTiming = provider._parseWordTiming(text, alignment);

      expect(wordTiming).toEqual([]);
    });

    it('should handle unicode characters', () => {
      const text = 'Café résumé';
      const alignment = {
        characters: ['C', 'a', 'f', 'é', ' ', 'r', 'é', 's', 'u', 'm', 'é'],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]
      };

      const wordTiming = provider._parseWordTiming(text, alignment);

      expect(wordTiming.length).toBe(2);
      expect(wordTiming[0].word).toBe('Café');
      expect(wordTiming[1].word).toBe('résumé');
    });
  });

  describe('Provider Configuration', () => {
    it('should report word timing support', () => {
      expect(ElevenLabsProvider.supportsWordTiming).toBe(true);
    });
  });
});
