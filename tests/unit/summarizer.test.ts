/**
 * Unit tests for ArticleSummarizer
 * Tests for AI-powered article summarization
 *
 * @module tests/unit/summarizer.test.ts
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Type for the module
type SummarizerModule = typeof import('../../utils/ai/summarizer');
type TypesModule = typeof import('../../utils/ai/types');

// Types for testing
interface SummaryResult {
  success: boolean;
  bullets: Array<{ text: string; sourceOffset?: number; confidence?: number }>;
  provider: 'openai' | 'anthropic';
  model: string;
  tokensUsed?: { input: number; output: number };
  processingTimeMs: number;
  error?: string;
}

// Mock browser API
const mockBrowserStorage = {
  local: {
    get: jest.fn<() => Promise<Record<string, unknown>>>(),
    set: jest.fn<() => Promise<void>>(),
  },
};

// @ts-expect-error - browser global mock
globalThis.browser = {
  storage: mockBrowserStorage,
};

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
globalThis.fetch = mockFetch;

describe('ArticleSummarizer', () => {
  let ArticleSummarizer: SummarizerModule['ArticleSummarizer'];
  let createSummarizer: SummarizerModule['createSummarizer'];
  let AI_PROVIDER_CONFIGS: TypesModule['AI_PROVIDER_CONFIGS'];

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockBrowserStorage.local.get.mockReset();
    mockBrowserStorage.local.set.mockReset();

    // Import modules
    const summarizerModule = await import('../../utils/ai/summarizer');
    const typesModule = await import('../../utils/ai/types');

    ArticleSummarizer = summarizerModule.ArticleSummarizer;
    createSummarizer = summarizerModule.createSummarizer;
    AI_PROVIDER_CONFIGS = typesModule.AI_PROVIDER_CONFIGS;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create instance with ArticleSummarizer class', () => {
      const summarizer = new ArticleSummarizer();
      expect(summarizer).toBeInstanceOf(ArticleSummarizer);
    });

    it('should create instance with createSummarizer factory', () => {
      const summarizer = createSummarizer();
      expect(summarizer).toBeInstanceOf(ArticleSummarizer);
    });
  });

  describe('summarize with OpenAI', () => {
    const mockOpenAIResponse = {
      choices: [
        {
          message: {
            content: `- First bullet point about the article
- Second bullet point with key information
- Third bullet point summarizing conclusions
- Fourth bullet point about important facts
- Fifth bullet point wrapping up the summary`,
          },
        },
      ],
      usage: {
        prompt_tokens: 500,
        completion_tokens: 150,
      },
    };

    beforeEach(() => {
      // Mock API key retrieval
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-api-key',
      });

      // Mock successful fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAIResponse),
      } as Response);
    });

    it('should successfully summarize article with OpenAI', async () => {
      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200), // At least 100 chars
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('openai');
      expect(result.bullets.length).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should call OpenAI API with correct parameters', async () => {
      const summarizer = createSummarizer();
      await summarizer.summarize({
        text: 'A'.repeat(200),
        title: 'Test Article',
        provider: 'openai',
        bulletCount: 5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        AI_PROVIDER_CONFIGS.openai.endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should parse bullet points from OpenAI response', async () => {
      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.bullets).toHaveLength(5);
      expect(result.bullets[0].text).toContain('First bullet point');
    });

    it('should include token usage in result', async () => {
      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.tokensUsed).toEqual({
        input: 500,
        output: 150,
      });
    });

    it('should return error when API key is missing', async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No API key');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI API error');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('summarize with Anthropic', () => {
    const mockAnthropicResponse = {
      content: [
        {
          type: 'text' as const,
          text: `- First bullet about the article content
- Second bullet with important details
- Third bullet summarizing findings`,
        },
      ],
      usage: {
        input_tokens: 400,
        output_tokens: 100,
      },
    };

    beforeEach(() => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'anthropic:apiKey': 'test-anthropic-key',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAnthropicResponse),
      } as Response);
    });

    it('should successfully summarize article with Anthropic', async () => {
      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'anthropic',
        bulletCount: 3,
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('anthropic');
      expect(result.bullets.length).toBeGreaterThan(0);
    });

    it('should call Anthropic API with correct headers', async () => {
      const summarizer = createSummarizer();
      await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'anthropic',
        bulletCount: 3,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        AI_PROVIDER_CONFIGS.anthropic.endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('should include token usage from Anthropic response', async () => {
      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'anthropic',
        bulletCount: 3,
      });

      expect(result.tokensUsed).toEqual({
        input: 400,
        output: 100,
      });
    });
  });

  describe('caching', () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: '- Cached bullet point content',
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };

    beforeEach(() => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-key',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);
    });

    it('should cache successful results by URL', async () => {
      const summarizer = createSummarizer();

      // First call
      await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article',
        provider: 'openai',
        bulletCount: 5,
      });

      // Second call with same URL
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article',
        provider: 'openai',
        bulletCount: 5,
      });

      // Should only fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('should not use cache for different URLs', async () => {
      const summarizer = createSummarizer();

      await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article1',
        provider: 'openai',
        bulletCount: 5,
      });

      await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article2',
        provider: 'openai',
        bulletCount: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not use cache when URL is not provided', async () => {
      const summarizer = createSummarizer();

      await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear cache with clearCache()', async () => {
      const summarizer = createSummarizer();

      await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article',
        provider: 'openai',
        bulletCount: 5,
      });

      summarizer.clearCache();

      await summarizer.summarize({
        text: 'A'.repeat(200),
        url: 'https://example.com/article',
        provider: 'openai',
        bulletCount: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true when API key is set', async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-key',
      });

      const summarizer = createSummarizer();
      const available = await summarizer.isProviderAvailable('openai');

      expect(available).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      const summarizer = createSummarizer();
      const available = await summarizer.isProviderAvailable('openai');

      expect(available).toBe(false);
    });

    it('should check correct storage key for each provider', async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      const summarizer = createSummarizer();

      await summarizer.isProviderAvailable('openai');
      expect(mockBrowserStorage.local.get).toHaveBeenCalledWith('openai:apiKey');

      await summarizer.isProviderAvailable('anthropic');
      expect(mockBrowserStorage.local.get).toHaveBeenCalledWith('anthropic:apiKey');
    });
  });

  describe('input validation', () => {
    beforeEach(() => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-key',
      });
    });

    it('should reject text shorter than 100 characters', async () => {
      const summarizer = createSummarizer();

      await expect(
        summarizer.summarize({
          text: 'Too short',
          provider: 'openai',
          bulletCount: 5,
        })
      ).rejects.toThrow();
    });

    it('should accept text with minimum length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '- Bullet' } }],
          }),
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(100), // Exactly 100 chars
        provider: 'openai',
        bulletCount: 5,
      });

      expect(result).toBeDefined();
    });

    it('should use default bullet count when not specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '- Bullet' } }],
          }),
      } as Response);

      const summarizer = createSummarizer();
      await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      // Default is 5 bullets
      expect(body.messages[0].content).toContain('exactly 5 bullet points');
    });

    it('should reject bullet count less than 3', async () => {
      const summarizer = createSummarizer();

      await expect(
        summarizer.summarize({
          text: 'A'.repeat(200),
          provider: 'openai',
          bulletCount: 2,
        })
      ).rejects.toThrow();
    });

    it('should reject bullet count greater than 7', async () => {
      const summarizer = createSummarizer();

      await expect(
        summarizer.summarize({
          text: 'A'.repeat(200),
          provider: 'openai',
          bulletCount: 8,
        })
      ).rejects.toThrow();
    });
  });

  describe('bullet parsing', () => {
    beforeEach(() => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-key',
      });
    });

    it('should parse bullets with dash prefix', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: `- First bullet
- Second bullet
- Third bullet`,
                },
              },
            ],
          }),
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 3,
      });

      expect(result.bullets).toHaveLength(3);
      expect(result.bullets[0].text).toBe('First bullet');
    });

    it('should parse bullets with asterisk prefix', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: `* First item
* Second item`,
                },
              },
            ],
          }),
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 3,
      });

      expect(result.bullets.length).toBeGreaterThanOrEqual(2);
      expect(result.bullets[0].text).toBe('First item');
    });

    it('should parse numbered list items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: `1. First point
2. Second point
3. Third point`,
                },
              },
            ],
          }),
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 3,
      });

      expect(result.bullets.length).toBeGreaterThanOrEqual(3);
      expect(result.bullets[0].text).toBe('First point');
    });

    it('should handle empty response content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '' } }],
          }),
      } as Response);

      const summarizer = createSummarizer();
      const result = await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 3,
      });

      expect(result.bullets).toHaveLength(0);
    });
  });

  describe('unknown provider handling', () => {
    it('should throw validation error for unknown provider', async () => {
      const summarizer = createSummarizer();

      // Force an invalid provider through type casting - Zod will throw
      await expect(
        summarizer.summarize({
          text: 'A'.repeat(200),
          provider: 'unknown' as 'openai',
          bulletCount: 5,
        })
      ).rejects.toThrow();
    });
  });

  describe('title inclusion', () => {
    beforeEach(() => {
      mockBrowserStorage.local.get.mockResolvedValue({
        'openai:apiKey': 'test-key',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '- Bullet' } }],
          }),
      } as Response);
    });

    it('should include title in prompt when provided', async () => {
      const summarizer = createSummarizer();
      await summarizer.summarize({
        text: 'A'.repeat(200),
        title: 'My Test Article',
        provider: 'openai',
        bulletCount: 5,
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.messages[1].content).toContain('My Test Article');
    });

    it('should not include title prefix when not provided', async () => {
      const summarizer = createSummarizer();
      await summarizer.summarize({
        text: 'A'.repeat(200),
        provider: 'openai',
        bulletCount: 5,
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.messages[1].content).not.toContain('Title:');
    });
  });
});
