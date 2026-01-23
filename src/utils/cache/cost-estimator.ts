// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Cost Estimator Service - Smart Audio Cache
 *
 * Calculates estimated TTS costs with cache-aware pricing.
 * Shows savings from cached audio and estimated API costs.
 *
 * @module utils/cache/cost-estimator
 */

import type { CostEstimate, ParagraphCost } from './types';
import { getCacheStore } from './audio-cache-store';
import { generateCacheKey, generateContentHash } from './cache-key';

/**
 * Provider pricing configuration (per 1000 characters)
 * Prices in USD as of 2025
 * 050-groq-tts-provider (T045): Added Groq pricing
 */
export const PROVIDER_PRICING: Record<string, { pricePerKiloChar: number; name: string }> = {
  groq: {
    pricePerKiloChar: 0.05, // $0.05 per 1K chars ($50/1M) - PlayAI model default
    name: 'Groq',
  },
  'groq-orpheus': {
    pricePerKiloChar: 0.022, // $0.022 per 1K chars ($22/1M) - Orpheus model
    name: 'Groq Orpheus',
  },
  elevenlabs: {
    pricePerKiloChar: 0.18, // $0.18 per 1K chars (depends on tier)
    name: 'ElevenLabs',
  },
  browser: {
    pricePerKiloChar: 0, // Free - uses system voices
    name: 'Browser TTS',
  },
};

/**
 * Get pricing for a provider
 * 050-groq-tts-provider (T046): Added model parameter for Groq model-specific pricing
 *
 * @param provider - Provider ID (e.g., 'groq', 'elevenlabs', 'browser')
 * @param model - Optional model ID for model-specific pricing (e.g., 'distil-whisper-large-v3-en' for Orpheus)
 */
export function getProviderPricing(
  provider: string,
  model?: string,
): { pricePerKiloChar: number; name: string } {
  // 050-groq-tts-provider (T046): Use model-specific pricing for Groq
  if (provider === 'groq' && model === 'distil-whisper-large-v3-en') {
    return PROVIDER_PRICING['groq-orpheus'];
  }
  return PROVIDER_PRICING[provider] || PROVIDER_PRICING['elevenlabs'];
}

/**
 * Calculate cost for text based on character count
 * 050-groq-tts-provider (T046): Added model parameter for Groq model-specific pricing
 */
export function calculateTextCost(text: string, provider: string, model?: string): number {
  const pricing = getProviderPricing(provider, model);
  const charCount = text.length;
  return (charCount / 1000) * pricing.pricePerKiloChar;
}

/**
 * Cost estimation options
 * 050-groq-tts-provider (T046): Added model for Groq model-specific pricing
 */
export interface CostEstimateOptions {
  url: string;
  paragraphs: string[];
  provider: string;
  voice: string;
  /** Optional model ID for model-specific pricing (e.g., Groq Orpheus) */
  model?: string;
  startParagraph?: number;
  endParagraph?: number;
}

/**
 * Estimate cost for a set of paragraphs with cache awareness
 *
 * @param options - Cost estimation options
 * @returns Cost estimate with per-paragraph breakdown
 */
export async function estimateCost(options: CostEstimateOptions): Promise<CostEstimate> {
  const { url, paragraphs, provider, voice, model, startParagraph = 0, endParagraph } = options;

  const end = endParagraph ?? paragraphs.length;
  const selectedParagraphs = paragraphs.slice(startParagraph, end);
  // 050-groq-tts-provider (T046): Pass model for Groq-specific pricing
  const pricing = getProviderPricing(provider, model);
  const store = getCacheStore();

  const paragraphCosts: ParagraphCost[] = [];
  let totalCharacters = 0;
  let cachedCharacters = 0;
  let uncachedCharacters = 0;

  // Check each paragraph for cache status
  for (let i = 0; i < selectedParagraphs.length; i++) {
    const text = selectedParagraphs[i];
    const absoluteIndex = startParagraph + i;
    const charCount = text.length;
    totalCharacters += charCount;

    // Generate cache key to check if cached
    const contentHash = await generateContentHash(text);
    const cacheKey = generateCacheKey(url, absoluteIndex, provider, voice, contentHash);

    // Check if this paragraph is cached
    const isCached = await store.has(cacheKey);

    if (isCached) {
      cachedCharacters += charCount;
      paragraphCosts.push({
        index: absoluteIndex,
        characters: charCount,
        isCached: true,
        cost: 0, // Cached = no cost
      });
    } else {
      uncachedCharacters += charCount;
      const cost = (charCount / 1000) * pricing.pricePerKiloChar;
      paragraphCosts.push({
        index: absoluteIndex,
        characters: charCount,
        isCached: false,
        cost,
      });
    }
  }

  // Calculate totals
  const estimatedCost = (totalCharacters / 1000) * pricing.pricePerKiloChar;
  const actualCost = (uncachedCharacters / 1000) * pricing.pricePerKiloChar;
  const savingsFromCache = estimatedCost - actualCost;
  const savingsPercentage = totalCharacters > 0 ? (cachedCharacters / totalCharacters) * 100 : 0;

  return {
    totalCharacters,
    cachedCharacters,
    uncachedCharacters,
    provider,
    pricePerKiloChar: pricing.pricePerKiloChar,
    estimatedCost,
    actualCost,
    savingsFromCache,
    savingsPercentage,
    paragraphCosts,
  };
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return 'Free';
  }
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format savings with percentage
 */
export function formatSavings(savings: number, percentage: number): string {
  if (savings === 0) {
    return 'No cached audio';
  }
  return `${formatCost(savings)} saved (${Math.round(percentage)}%)`;
}

/**
 * Get paragraph cache status for a URL
 * 050-groq-tts-provider (T046): Added model parameter for Groq model-specific pricing
 */
export async function getParagraphCacheStatus(
  url: string,
  paragraphs: string[],
  provider: string,
  voice: string,
  model?: string,
): Promise<{
  paragraphs: Array<{ index: number; isCached: boolean; estimatedCost: number }>;
  totalCachedCount: number;
  totalEstimatedCost: number;
  totalSavings: number;
}> {
  const store = getCacheStore();
  const pricing = getProviderPricing(provider, model);

  const paragraphStatus: Array<{ index: number; isCached: boolean; estimatedCost: number }> = [];
  let totalCachedCount = 0;
  let totalEstimatedCost = 0;
  let totalSavings = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    const charCount = text.length;
    const estimatedCost = (charCount / 1000) * pricing.pricePerKiloChar;
    totalEstimatedCost += estimatedCost;

    // Generate cache key to check if cached
    const contentHash = await generateContentHash(text);
    const cacheKey = generateCacheKey(url, i, provider, voice, contentHash);
    const isCached = await store.has(cacheKey);

    if (isCached) {
      totalCachedCount++;
      totalSavings += estimatedCost;
    }

    paragraphStatus.push({
      index: i,
      isCached,
      estimatedCost,
    });
  }

  return {
    paragraphs: paragraphStatus,
    totalCachedCount,
    totalEstimatedCost,
    totalSavings,
  };
}

/**
 * Cumulative savings tracker
 */
export interface CumulativeSavings {
  totalCacheHits: number;
  totalCharactersSaved: number;
  estimatedSavings: number;
  byProvider: Record<string, { hits: number; savings: number }>;
}

/**
 * Create initial cumulative savings
 */
export function createCumulativeSavings(): CumulativeSavings {
  return {
    totalCacheHits: 0,
    totalCharactersSaved: 0,
    estimatedSavings: 0,
    byProvider: {},
  };
}

/**
 * Update cumulative savings after a cache hit
 * 050-groq-tts-provider (T046): Added model parameter for Groq model-specific pricing
 */
export function recordCacheHit(
  savings: CumulativeSavings,
  provider: string,
  characters: number,
  model?: string,
): CumulativeSavings {
  const pricing = getProviderPricing(provider, model);
  const savedAmount = (characters / 1000) * pricing.pricePerKiloChar;

  const providerStats = savings.byProvider[provider] || { hits: 0, savings: 0 };

  return {
    totalCacheHits: savings.totalCacheHits + 1,
    totalCharactersSaved: savings.totalCharactersSaved + characters,
    estimatedSavings: savings.estimatedSavings + savedAmount,
    byProvider: {
      ...savings.byProvider,
      [provider]: {
        hits: providerStats.hits + 1,
        savings: providerStats.savings + savedAmount,
      },
    },
  };
}
