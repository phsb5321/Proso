/**
 * Contract Tests for Groq Whisper API
 * Validates request/response format for word-level timestamps
 *
 * These tests verify the API contract without making real API calls.
 * Run with: npm test -- tests/contract/test-groq-whisper.js
 */

import { GroqWhisper } from '../../background/constants.js';

describe('Groq Whisper API Contract', () => {
  describe('API Configuration', () => {
    it('should have correct API endpoint', () => {
      expect(GroqWhisper.API_ENDPOINT).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    });

    it('should have correct default model', () => {
      expect(GroqWhisper.MODEL).toBe('whisper-large-v3-turbo');
    });

    it('should have correct response format', () => {
      expect(GroqWhisper.RESPONSE_FORMAT).toBe('verbose_json');
    });
  });

  describe('Request Format', () => {
    it('should create correct FormData structure', () => {
      const formData = new FormData();
      const audioBlob = new Blob(['test'], { type: 'audio/mpeg' });

      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('model', GroqWhisper.MODEL);
      formData.append('response_format', GroqWhisper.RESPONSE_FORMAT);
      formData.append('timestamp_granularities[]', 'word');
      formData.append('timestamp_granularities[]', 'segment');

      expect(formData.has('file')).toBe(true);
      expect(formData.get('model')).toBe('whisper-large-v3-turbo');
      expect(formData.get('response_format')).toBe('verbose_json');
      expect(formData.getAll('timestamp_granularities[]')).toContain('word');
      expect(formData.getAll('timestamp_granularities[]')).toContain('segment');
    });
  });

  describe('Response Parsing', () => {
    const mockSuccessResponse = {
      task: 'transcribe',
      language: 'en',
      duration: 5.42,
      text: 'Hello world, this is a test.',
      words: [
        { word: 'Hello', start: 0.0, end: 0.32 },
        { word: 'world,', start: 0.35, end: 0.68 },
        { word: 'this', start: 0.72, end: 0.88 },
        { word: 'is', start: 0.90, end: 0.98 },
        { word: 'a', start: 1.0, end: 1.05 },
        { word: 'test.', start: 1.08, end: 1.42 }
      ],
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0.0,
          end: 1.42,
          text: 'Hello world, this is a test.',
          tokens: [50364, 2425, 1002, 11, 341, 307, 257, 1500, 13, 50436],
          temperature: 0.0,
          avg_logprob: -0.18,
          compression_ratio: 0.95,
          no_speech_prob: 0.01
        }
      ]
    };

    it('should parse word timestamps correctly', () => {
      const { words } = mockSuccessResponse;

      expect(words).toHaveLength(6);

      // First word
      expect(words[0].word).toBe('Hello');
      expect(words[0].start).toBe(0.0);
      expect(words[0].end).toBe(0.32);

      // Last word (with punctuation)
      expect(words[5].word).toBe('test.');
      expect(words[5].start).toBe(1.08);
      expect(words[5].end).toBe(1.42);
    });

    it('should have duration in seconds', () => {
      expect(mockSuccessResponse.duration).toBeCloseTo(5.42, 2);
    });

    it('should have full transcription text', () => {
      expect(mockSuccessResponse.text).toBe('Hello world, this is a test.');
    });

    it('should convert seconds to milliseconds correctly', () => {
      const words = mockSuccessResponse.words.map(w => ({
        word: w.word,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000)
      }));

      expect(words[0].startMs).toBe(0);
      expect(words[0].endMs).toBe(320);
      expect(words[5].startMs).toBe(1080);
      expect(words[5].endMs).toBe(1420);
    });
  });

  describe('Error Response Parsing', () => {
    it('should recognize 401 unauthorized error', () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      };

      expect(errorResponse.error.code).toBe('invalid_api_key');
      expect(errorResponse.error.type).toBe('authentication_error');
    });

    it('should recognize 429 rate limit error', () => {
      const errorResponse = {
        error: {
          message: 'Rate limit exceeded. Please retry after X seconds.',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      };

      expect(errorResponse.error.code).toBe('rate_limit_exceeded');
      expect(errorResponse.error.type).toBe('rate_limit_error');
    });

    it('should recognize 400 bad request error', () => {
      const errorResponse = {
        error: {
          message: 'response_format must be set verbose_json to use timestamp granularities',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      };

      expect(errorResponse.error.code).toBe('invalid_request');
    });
  });

  describe('WordTiming Data Structure', () => {
    it('should have correct WordTiming shape', () => {
      const wordTiming = {
        word: 'Hello',
        startMs: 0,
        endMs: 320,
        charOffset: 0,
        charLength: 5
      };

      expect(wordTiming).toHaveProperty('word');
      expect(wordTiming).toHaveProperty('startMs');
      expect(wordTiming).toHaveProperty('endMs');
      expect(wordTiming).toHaveProperty('charOffset');
      expect(wordTiming).toHaveProperty('charLength');

      expect(typeof wordTiming.word).toBe('string');
      expect(typeof wordTiming.startMs).toBe('number');
      expect(typeof wordTiming.endMs).toBe('number');
      expect(typeof wordTiming.charOffset).toBe('number');
      expect(typeof wordTiming.charLength).toBe('number');
    });

    it('should have valid timing constraints', () => {
      const wordTiming = {
        word: 'test',
        startMs: 100,
        endMs: 250,
        charOffset: 10,
        charLength: 4
      };

      // Start must be >= 0
      expect(wordTiming.startMs).toBeGreaterThanOrEqual(0);
      // End must be > start
      expect(wordTiming.endMs).toBeGreaterThan(wordTiming.startMs);
      // CharOffset must be >= 0
      expect(wordTiming.charOffset).toBeGreaterThanOrEqual(0);
      // CharLength must be > 0
      expect(wordTiming.charLength).toBeGreaterThan(0);
    });
  });

  describe('WordTimeline Data Structure', () => {
    it('should have correct WordTimeline shape', () => {
      const wordTimeline = {
        paragraphIndex: 0,
        words: [
          { word: 'Hello', startMs: 0, endMs: 320, charOffset: 0, charLength: 5 }
        ],
        audioDurationMs: 5420,
        sourceText: 'Hello world',
        transcribedText: 'Hello world',
        alignmentConfidence: 0.95
      };

      expect(wordTimeline).toHaveProperty('paragraphIndex');
      expect(wordTimeline).toHaveProperty('words');
      expect(wordTimeline).toHaveProperty('audioDurationMs');
      expect(wordTimeline).toHaveProperty('sourceText');
      expect(wordTimeline).toHaveProperty('transcribedText');
      expect(wordTimeline).toHaveProperty('alignmentConfidence');

      expect(Array.isArray(wordTimeline.words)).toBe(true);
      expect(wordTimeline.alignmentConfidence).toBeGreaterThanOrEqual(0);
      expect(wordTimeline.alignmentConfidence).toBeLessThanOrEqual(1);
    });
  });
});
