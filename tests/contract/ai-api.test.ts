/**
 * AI API Contract Tests for VoxPage
 * Verifies message contracts for AI summarization feature
 *
 * @module tests/contract/ai-api.test.ts
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

// Import schemas and types
import {
  summaryBulletSchema,
  summarizationRequestSchema,
  summaryResultSchema,
  openAIResponseSchema,
  anthropicResponseSchema,
  AI_PROVIDER_CONFIGS,
} from '../../utils/ai/types';

describe('AI API Message Contract', () => {
  describe('summarize.article request', () => {
    it('request must have required text field', () => {
      const validRequest = {
        text: 'A'.repeat(200),
        provider: 'openai',
      };

      const result = summarizationRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('text must be at least 100 characters', () => {
      const invalidRequest = {
        text: 'Too short',
        provider: 'openai',
      };

      const result = summarizationRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('text must be at most 100000 characters', () => {
      const invalidRequest = {
        text: 'A'.repeat(100001),
        provider: 'openai',
      };

      const result = summarizationRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('provider must be openai or anthropic', () => {
      const openaiRequest = {
        text: 'A'.repeat(200),
        provider: 'openai',
      };
      const anthropicRequest = {
        text: 'A'.repeat(200),
        provider: 'anthropic',
      };
      const invalidRequest = {
        text: 'A'.repeat(200),
        provider: 'invalid',
      };

      expect(summarizationRequestSchema.safeParse(openaiRequest).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(anthropicRequest).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(invalidRequest).success).toBe(false);
    });

    it('bulletCount must be between 3 and 7', () => {
      const validRequest = {
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      };
      const tooFew = { ...validRequest, bulletCount: 2 };
      const tooMany = { ...validRequest, bulletCount: 8 };

      expect(summarizationRequestSchema.safeParse(validRequest).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(tooFew).success).toBe(false);
      expect(summarizationRequestSchema.safeParse(tooMany).success).toBe(false);
    });

    it('bulletCount defaults to 5 when not specified', () => {
      const request = {
        text: 'A'.repeat(200),
        provider: 'openai',
      };

      const result = summarizationRequestSchema.parse(request);
      expect(result.bulletCount).toBe(5);
    });

    it('title is optional', () => {
      const withTitle = {
        text: 'A'.repeat(200),
        provider: 'openai',
        title: 'Test Article',
      };
      const withoutTitle = {
        text: 'A'.repeat(200),
        provider: 'openai',
      };

      expect(summarizationRequestSchema.safeParse(withTitle).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(withoutTitle).success).toBe(true);
    });

    it('title must be at most 200 characters', () => {
      const invalidRequest = {
        text: 'A'.repeat(200),
        provider: 'openai',
        title: 'A'.repeat(201),
      };

      const result = summarizationRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('url must be valid URL when provided', () => {
      const validUrl = {
        text: 'A'.repeat(200),
        provider: 'openai',
        url: 'https://example.com/article',
      };
      const invalidUrl = {
        text: 'A'.repeat(200),
        provider: 'openai',
        url: 'not-a-url',
      };

      expect(summarizationRequestSchema.safeParse(validUrl).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(invalidUrl).success).toBe(false);
    });

    it('outputLanguage must be 2 characters', () => {
      const validLang = {
        text: 'A'.repeat(200),
        provider: 'openai',
        outputLanguage: 'es',
      };
      const invalidLang = {
        text: 'A'.repeat(200),
        provider: 'openai',
        outputLanguage: 'spanish',
      };

      expect(summarizationRequestSchema.safeParse(validLang).success).toBe(true);
      expect(summarizationRequestSchema.safeParse(invalidLang).success).toBe(false);
    });

    it('outputLanguage defaults to en', () => {
      const request = {
        text: 'A'.repeat(200),
        provider: 'openai',
      };

      const result = summarizationRequestSchema.parse(request);
      expect(result.outputLanguage).toBe('en');
    });
  });

  describe('summaryBullet schema', () => {
    it('must have text field with at least 10 characters', () => {
      const valid = { text: 'This is a valid bullet point summary' };
      const tooShort = { text: 'Short' };

      expect(summaryBulletSchema.safeParse(valid).success).toBe(true);
      expect(summaryBulletSchema.safeParse(tooShort).success).toBe(false);
    });

    it('text must be at most 300 characters', () => {
      const tooLong = { text: 'A'.repeat(301) };

      expect(summaryBulletSchema.safeParse(tooLong).success).toBe(false);
    });

    it('sourceOffset is optional and must be non-negative integer', () => {
      const withOffset = { text: 'Valid bullet text here', sourceOffset: 150 };
      const withoutOffset = { text: 'Valid bullet text here' };
      const negativeOffset = { text: 'Valid bullet text here', sourceOffset: -1 };

      expect(summaryBulletSchema.safeParse(withOffset).success).toBe(true);
      expect(summaryBulletSchema.safeParse(withoutOffset).success).toBe(true);
      expect(summaryBulletSchema.safeParse(negativeOffset).success).toBe(false);
    });

    it('confidence is optional and must be between 0 and 1', () => {
      const withConfidence = { text: 'Valid bullet text here', confidence: 0.95 };
      const withoutConfidence = { text: 'Valid bullet text here' };
      const tooHigh = { text: 'Valid bullet text here', confidence: 1.5 };
      const tooLow = { text: 'Valid bullet text here', confidence: -0.1 };

      expect(summaryBulletSchema.safeParse(withConfidence).success).toBe(true);
      expect(summaryBulletSchema.safeParse(withoutConfidence).success).toBe(true);
      expect(summaryBulletSchema.safeParse(tooHigh).success).toBe(false);
      expect(summaryBulletSchema.safeParse(tooLow).success).toBe(false);
    });
  });

  describe('summaryResult schema', () => {
    const validBullet = { text: 'This is a valid bullet point summary' };
    const baseResult = {
      success: true,
      bullets: [validBullet],
      provider: 'openai',
      model: 'gpt-4o-mini',
      processingTimeMs: 500,
    };

    it('must have required success field', () => {
      const result = summaryResultSchema.safeParse(baseResult);
      expect(result.success).toBe(true);
    });

    it('must have bullets array with at least 1 item', () => {
      const emptyBullets = { ...baseResult, bullets: [] };

      expect(summaryResultSchema.safeParse(emptyBullets).success).toBe(false);
    });

    it('bullets array must have at most 7 items', () => {
      const tooManyBullets = {
        ...baseResult,
        bullets: Array(8).fill(validBullet),
      };

      expect(summaryResultSchema.safeParse(tooManyBullets).success).toBe(false);
    });

    it('provider must be openai or anthropic', () => {
      const openai = { ...baseResult, provider: 'openai' };
      const anthropic = { ...baseResult, provider: 'anthropic' };
      const invalid = { ...baseResult, provider: 'other' };

      expect(summaryResultSchema.safeParse(openai).success).toBe(true);
      expect(summaryResultSchema.safeParse(anthropic).success).toBe(true);
      expect(summaryResultSchema.safeParse(invalid).success).toBe(false);
    });

    it('processingTimeMs must be non-negative integer', () => {
      const valid = { ...baseResult, processingTimeMs: 0 };
      const negative = { ...baseResult, processingTimeMs: -100 };

      expect(summaryResultSchema.safeParse(valid).success).toBe(true);
      expect(summaryResultSchema.safeParse(negative).success).toBe(false);
    });

    it('tokensUsed is optional with input and output fields', () => {
      const withTokens = {
        ...baseResult,
        tokensUsed: { input: 500, output: 150 },
      };
      const withoutTokens = baseResult;

      expect(summaryResultSchema.safeParse(withTokens).success).toBe(true);
      expect(summaryResultSchema.safeParse(withoutTokens).success).toBe(true);
    });

    it('error field is optional', () => {
      const withError = { ...baseResult, error: 'Something went wrong' };
      const withoutError = baseResult;

      expect(summaryResultSchema.safeParse(withError).success).toBe(true);
      expect(summaryResultSchema.safeParse(withoutError).success).toBe(true);
    });
  });

  describe('OpenAI API response schema', () => {
    it('must have choices array with message content', () => {
      const validResponse = {
        choices: [
          {
            message: {
              content: '- Bullet point 1\n- Bullet point 2',
            },
          },
        ],
      };

      expect(openAIResponseSchema.safeParse(validResponse).success).toBe(true);
    });

    it('usage is optional', () => {
      const withUsage = {
        choices: [{ message: { content: 'test' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };
      const withoutUsage = {
        choices: [{ message: { content: 'test' } }],
      };

      expect(openAIResponseSchema.safeParse(withUsage).success).toBe(true);
      expect(openAIResponseSchema.safeParse(withoutUsage).success).toBe(true);
    });

    it('should handle empty choices array', () => {
      const emptyChoices = { choices: [] };

      expect(openAIResponseSchema.safeParse(emptyChoices).success).toBe(true);
    });
  });

  describe('Anthropic API response schema', () => {
    it('must have content array with text type', () => {
      const validResponse = {
        content: [
          {
            type: 'text' as const,
            text: '- Bullet point 1\n- Bullet point 2',
          },
        ],
      };

      expect(anthropicResponseSchema.safeParse(validResponse).success).toBe(true);
    });

    it('usage is optional', () => {
      const withUsage = {
        content: [{ type: 'text' as const, text: 'test' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };
      const withoutUsage = {
        content: [{ type: 'text' as const, text: 'test' }],
      };

      expect(anthropicResponseSchema.safeParse(withUsage).success).toBe(true);
      expect(anthropicResponseSchema.safeParse(withoutUsage).success).toBe(true);
    });

    it('content type must be text', () => {
      const invalidType = {
        content: [{ type: 'image', text: 'test' }],
      };

      expect(anthropicResponseSchema.safeParse(invalidType).success).toBe(false);
    });
  });

  describe('AI Provider Configs', () => {
    it('openai config should have correct endpoint', () => {
      expect(AI_PROVIDER_CONFIGS.openai.endpoint).toBe(
        'https://api.openai.com/v1/chat/completions'
      );
    });

    it('anthropic config should have correct endpoint', () => {
      expect(AI_PROVIDER_CONFIGS.anthropic.endpoint).toBe(
        'https://api.anthropic.com/v1/messages'
      );
    });

    it('openai config should use gpt-4o-mini model', () => {
      expect(AI_PROVIDER_CONFIGS.openai.model).toBe('gpt-4o-mini');
    });

    it('anthropic config should use claude-3-haiku model', () => {
      expect(AI_PROVIDER_CONFIGS.anthropic.model).toBe('claude-3-haiku-20240307');
    });

    it('each provider should have unique apiKeyStorageKey', () => {
      const keys = Object.values(AI_PROVIDER_CONFIGS).map((c) => c.apiKeyStorageKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('openai storage key should be openai:apiKey', () => {
      expect(AI_PROVIDER_CONFIGS.openai.apiKeyStorageKey).toBe('openai:apiKey');
    });

    it('anthropic storage key should be anthropic:apiKey', () => {
      expect(AI_PROVIDER_CONFIGS.anthropic.apiKeyStorageKey).toBe('anthropic:apiKey');
    });
  });

  describe('summarize.readSummary request', () => {
    const readSummaryRequestSchema = z.object({
      bullets: z.array(z.object({ text: z.string() })).min(1),
      provider: z.enum(['openai', 'elevenlabs', 'groq', 'cartesia', 'browser']),
      voice: z.string().optional(),
      speed: z.number().min(0.5).max(2.0).optional(),
    });

    it('must have bullets array with at least one item', () => {
      const valid = {
        bullets: [{ text: 'First bullet' }],
        provider: 'browser',
      };
      const empty = { bullets: [], provider: 'browser' };

      expect(readSummaryRequestSchema.safeParse(valid).success).toBe(true);
      expect(readSummaryRequestSchema.safeParse(empty).success).toBe(false);
    });

    it('provider must be a valid TTS provider', () => {
      const validProviders = ['openai', 'elevenlabs', 'groq', 'cartesia', 'browser'];

      for (const provider of validProviders) {
        const request = {
          bullets: [{ text: 'Test bullet' }],
          provider,
        };
        expect(readSummaryRequestSchema.safeParse(request).success).toBe(true);
      }

      const invalidRequest = {
        bullets: [{ text: 'Test bullet' }],
        provider: 'anthropic', // Not a TTS provider
      };
      expect(readSummaryRequestSchema.safeParse(invalidRequest).success).toBe(false);
    });

    it('voice is optional', () => {
      const withVoice = {
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
        voice: 'alloy',
      };
      const withoutVoice = {
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
      };

      expect(readSummaryRequestSchema.safeParse(withVoice).success).toBe(true);
      expect(readSummaryRequestSchema.safeParse(withoutVoice).success).toBe(true);
    });

    it('speed must be between 0.5 and 2.0', () => {
      const valid = {
        bullets: [{ text: 'Test bullet' }],
        provider: 'browser',
        speed: 1.5,
      };
      const tooSlow = { ...valid, speed: 0.3 };
      const tooFast = { ...valid, speed: 2.5 };

      expect(readSummaryRequestSchema.safeParse(valid).success).toBe(true);
      expect(readSummaryRequestSchema.safeParse(tooSlow).success).toBe(false);
      expect(readSummaryRequestSchema.safeParse(tooFast).success).toBe(false);
    });
  });

  describe('summarize.getProviderStatus request/response', () => {
    const getProviderStatusRequestSchema = z.object({
      provider: z.enum(['openai', 'anthropic']),
    });

    const getProviderStatusResponseSchema = z.object({
      available: z.boolean(),
      hasApiKey: z.boolean(),
      model: z.string().optional(),
      error: z.string().optional(),
    });

    it('request must have provider field', () => {
      const valid = { provider: 'openai' };
      const missing = {};

      expect(getProviderStatusRequestSchema.safeParse(valid).success).toBe(true);
      expect(getProviderStatusRequestSchema.safeParse(missing).success).toBe(false);
    });

    it('response must have available and hasApiKey fields', () => {
      const valid = {
        available: true,
        hasApiKey: true,
        model: 'gpt-4o-mini',
      };

      expect(getProviderStatusResponseSchema.safeParse(valid).success).toBe(true);
    });

    it('response model and error are optional', () => {
      const minimal = {
        available: false,
        hasApiKey: false,
      };

      expect(getProviderStatusResponseSchema.safeParse(minimal).success).toBe(true);
    });

    it('response can have error message when not available', () => {
      const withError = {
        available: false,
        hasApiKey: false,
        error: 'API key not configured',
      };

      expect(getProviderStatusResponseSchema.safeParse(withError).success).toBe(true);
    });
  });

  describe('Summary cache storage contract', () => {
    const summaryCacheEntrySchema = z.object({
      urlHash: z.string(),
      bullets: z.array(z.object({ text: z.string() })),
      provider: z.enum(['openai', 'anthropic']),
      cachedAt: z.number().int().positive(),
      expiresAt: z.number().int().positive(),
    });

    it('cache entry must have urlHash', () => {
      const valid = {
        urlHash: 'abc123',
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
        cachedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      expect(summaryCacheEntrySchema.safeParse(valid).success).toBe(true);
    });

    it('cache entry must have timestamps', () => {
      const valid = {
        urlHash: 'abc123',
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
        cachedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };
      const missingExpiry = {
        urlHash: 'abc123',
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
        cachedAt: Date.now(),
      };

      expect(summaryCacheEntrySchema.safeParse(valid).success).toBe(true);
      expect(summaryCacheEntrySchema.safeParse(missingExpiry).success).toBe(false);
    });

    it('expiresAt should be greater than cachedAt (24h TTL)', () => {
      const now = Date.now();
      const ttl = 86400000; // 24 hours in ms
      const entry = {
        urlHash: 'abc123',
        bullets: [{ text: 'Test bullet' }],
        provider: 'openai',
        cachedAt: now,
        expiresAt: now + ttl,
      };

      const parsed = summaryCacheEntrySchema.parse(entry);
      expect(parsed.expiresAt - parsed.cachedAt).toBe(ttl);
    });
  });
});
