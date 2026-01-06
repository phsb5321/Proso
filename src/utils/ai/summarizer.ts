// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Article Summarizer for VoxPage
 * Provides AI-powered article summarization using OpenAI or Anthropic
 *
 * @module utils/ai/summarizer
 */

import type { AIProvider } from '../config/schema';
import {
  type SummarizationRequest,
  type SummarizationRequestInput,
  type SummaryResult,
  type SummaryBullet,
  type SummaryCacheEntry,
  AI_PROVIDER_CONFIGS,
  summarizationRequestSchema,
  openAIResponseSchema,
  anthropicResponseSchema,
} from './types';

/**
 * Article Summarizer class
 * Handles AI-powered summarization of article text
 */
export class ArticleSummarizer {
  private cache: Map<string, SummaryCacheEntry> = new Map();
  private maxCacheSize = 100;
  private cacheTTLMs = 86400000; // 24 hours

  /**
   * Summarize article text using the specified AI provider
   * @param request - Summarization request parameters
   * @returns Promise resolving to summary result
   */
  async summarize(request: SummarizationRequestInput): Promise<SummaryResult> {
    const startTime = Date.now();

    // Validate request
    const validatedRequest = summarizationRequestSchema.parse(request);

    // Check cache first
    if (validatedRequest.url) {
      const cached = this.getCachedSummary(validatedRequest.url);
      if (cached) {
        return {
          success: true,
          bullets: cached.bullets,
          provider: cached.provider,
          model: AI_PROVIDER_CONFIGS[cached.provider].model,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Get provider config
    const providerConfig = AI_PROVIDER_CONFIGS[validatedRequest.provider];
    if (!providerConfig) {
      return {
        success: false,
        bullets: [],
        provider: validatedRequest.provider,
        model: '',
        processingTimeMs: Date.now() - startTime,
        error: `Unknown provider: ${validatedRequest.provider}`,
      };
    }

    try {
      // Get API key
      const apiKey = await this.getApiKey(validatedRequest.provider);
      if (!apiKey) {
        return {
          success: false,
          bullets: [],
          provider: validatedRequest.provider,
          model: providerConfig.model,
          processingTimeMs: Date.now() - startTime,
          error: `No API key configured for ${providerConfig.name}`,
        };
      }

      // Call appropriate provider
      const result =
        validatedRequest.provider === 'openai'
          ? await this.callOpenAI(validatedRequest, apiKey)
          : await this.callAnthropic(validatedRequest, apiKey);

      // Cache successful results
      if (result.success && validatedRequest.url) {
        this.cacheSummary(validatedRequest.url, result.bullets, validatedRequest.provider);
      }

      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        bullets: [],
        provider: validatedRequest.provider,
        model: providerConfig.model,
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Call OpenAI API for summarization
   */
  private async callOpenAI(
    request: SummarizationRequest,
    apiKey: string
  ): Promise<Omit<SummaryResult, 'processingTimeMs'>> {
    const config = AI_PROVIDER_CONFIGS.openai;

    const systemPrompt = this.buildSystemPrompt(request.bulletCount);
    const userPrompt = this.buildUserPrompt(request.text, request.title);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = openAIResponseSchema.parse(data);

    const bullets = this.parseBullets(parsed.choices[0]?.message?.content || '');

    return {
      success: true,
      bullets,
      provider: 'openai',
      model: config.model,
      tokensUsed: parsed.usage
        ? {
            input: parsed.usage.prompt_tokens,
            output: parsed.usage.completion_tokens,
          }
        : undefined,
    };
  }

  /**
   * Call Anthropic API for summarization
   */
  private async callAnthropic(
    request: SummarizationRequest,
    apiKey: string
  ): Promise<Omit<SummaryResult, 'processingTimeMs'>> {
    const config = AI_PROVIDER_CONFIGS.anthropic;

    const userPrompt = `${this.buildSystemPrompt(request.bulletCount)}\n\n${this.buildUserPrompt(request.text, request.title)}`;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = anthropicResponseSchema.parse(data);

    const content = parsed.content.find((c) => c.type === 'text')?.text || '';
    const bullets = this.parseBullets(content);

    return {
      success: true,
      bullets,
      provider: 'anthropic',
      model: config.model,
      tokensUsed: parsed.usage
        ? {
            input: parsed.usage.input_tokens,
            output: parsed.usage.output_tokens,
          }
        : undefined,
    };
  }

  /**
   * Build system prompt for summarization
   */
  private buildSystemPrompt(bulletCount: number): string {
    return `You are a helpful assistant that summarizes articles.
Provide exactly ${bulletCount} bullet points.
Each bullet should be under 50 words.
Focus on main arguments, key facts, and conclusions.
Format each bullet on its own line starting with "- "`;
  }

  /**
   * Build user prompt with article content
   */
  private buildUserPrompt(text: string, title?: string): string {
    return `Summarize this article:
${title ? `Title: ${title}\n\n` : ''}${text}`;
  }

  /**
   * Parse bullet points from AI response
   */
  private parseBullets(content: string): SummaryBullet[] {
    const lines = content.split('\n').filter((line) => line.trim());
    const bullets: SummaryBullet[] = [];

    for (const line of lines) {
      // Match lines starting with -, *, or numbered lists
      const match = line.match(/^[\-\*\d\.]+\s*(.+)$/);
      if (match) {
        bullets.push({
          text: match[1].trim(),
        });
      }
    }

    return bullets;
  }

  /**
   * Get API key for provider from storage
   */
  private async getApiKey(provider: AIProvider): Promise<string | null> {
    const config = AI_PROVIDER_CONFIGS[provider];
    const result = await browser.storage.local.get(config.apiKeyStorageKey);
    return (result[config.apiKeyStorageKey] as string) || null;
  }

  /**
   * Get cached summary for URL
   */
  private getCachedSummary(url: string): SummaryCacheEntry | null {
    const hash = this.hashUrl(url);
    const entry = this.cache.get(hash);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      return null;
    }

    return entry;
  }

  /**
   * Cache a summary result
   */
  private cacheSummary(
    url: string,
    bullets: SummaryBullet[],
    provider: AIProvider
  ): void {
    const hash = this.hashUrl(url);
    const now = Date.now();

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      urlHash: hash,
      bullets,
      provider,
      cachedAt: now,
      expiresAt: now + this.cacheTTLMs,
    });
  }

  /**
   * Simple URL hash function
   */
  private hashUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clear the summary cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if provider is available (has API key)
   */
  async isProviderAvailable(provider: AIProvider): Promise<boolean> {
    const apiKey = await this.getApiKey(provider);
    return !!apiKey;
  }
}

/**
 * Create a new ArticleSummarizer instance
 */
export function createSummarizer(): ArticleSummarizer {
  return new ArticleSummarizer();
}
