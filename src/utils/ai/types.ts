/**
 * AI Provider Types for VoxPage
 * Type definitions for AI summarization feature
 *
 * @module utils/ai/types
 */

import { z } from 'zod';
import type { AIProvider } from '../config/schema';

/**
 * Summary bullet point schema
 */
export const summaryBulletSchema = z.object({
  /** Bullet point text */
  text: z.string().min(10).max(300),
  /** Character offset in original text (for linking) */
  sourceOffset: z.number().int().min(0).optional(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Summarization request schema
 */
export const summarizationRequestSchema = z.object({
  /** Article text to summarize */
  text: z.string().min(100).max(100000),
  /** Article title (for context) */
  title: z.string().max(200).optional(),
  /** Source URL (for context) */
  url: z.string().url().optional(),
  /** AI provider preference */
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  /** Number of bullet points (3-7) */
  bulletCount: z.number().int().min(3).max(7).default(5),
  /** Language for summary output */
  outputLanguage: z.string().length(2).default('en'),
});

/**
 * Summary result schema
 */
export const summaryResultSchema = z.object({
  success: z.boolean(),
  /** Summary bullet points */
  bullets: z.array(summaryBulletSchema).min(1).max(7),
  /** Provider used */
  provider: z.enum(['openai', 'anthropic']),
  /** Model used */
  model: z.string(),
  /** Tokens used */
  tokensUsed: z
    .object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
    })
    .optional(),
  /** Processing time in ms */
  processingTimeMs: z.number().int().min(0),
  error: z.string().optional(),
});

/**
 * OpenAI API response schema
 */
export const openAIResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
    })
    .optional(),
});

/**
 * Anthropic API response schema
 */
export const anthropicResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    })
  ),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .optional(),
});

// Inferred types
export type SummaryBullet = z.infer<typeof summaryBulletSchema>;
/** Output type (after Zod applies defaults) */
export type SummarizationRequest = z.infer<typeof summarizationRequestSchema>;
/** Input type (before Zod applies defaults) - use this for function parameters */
export type SummarizationRequestInput = z.input<typeof summarizationRequestSchema>;
export type SummaryResult = z.infer<typeof summaryResultSchema>;
export type OpenAIResponse = z.infer<typeof openAIResponseSchema>;
export type AnthropicResponse = z.infer<typeof anthropicResponseSchema>;

/**
 * AI Provider configuration
 */
export interface AIProviderConfig {
  /** Provider ID */
  id: AIProvider;
  /** Display name */
  name: string;
  /** API endpoint */
  endpoint: string;
  /** Model to use */
  model: string;
  /** Storage key for API key */
  apiKeyStorageKey: string;
}

/**
 * AI Provider configurations
 */
export const AI_PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKeyStorageKey: 'openai:apiKey',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    apiKeyStorageKey: 'anthropic:apiKey',
  },
};

/**
 * Summary cache entry
 */
export interface SummaryCacheEntry {
  /** URL hash as key */
  urlHash: string;
  /** Cached summary bullets */
  bullets: SummaryBullet[];
  /** Provider that generated the summary */
  provider: AIProvider;
  /** When the summary was cached */
  cachedAt: number;
  /** Cache entry expiration timestamp */
  expiresAt: number;
}
