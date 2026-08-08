// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Cost Estimator Service - Smart Audio Cache
 *
 * Calculates estimated TTS costs with cache-aware pricing.
 * Shows savings from cached audio and estimated API costs.
 *
 * @module utils/cache/cost-estimator
 */

import { getCacheStore } from './audio-cache-store';
import { generateCacheKey, generateContentHash } from './cache-key';
import type { CostEstimate, ParagraphCost } from './types';

/**
 * Provider pricing configuration (per 1000 characters)
 * Prices in USD as of 2025
 */
export const PROVIDER_PRICING: Record<string, { pricePerKiloChar: number; name: string }> = {
  elevenlabs: {
    pricePerKiloChar: 0.18,
    name: 'ElevenLabs',
  },
  openai: {
    pricePerKiloChar: 0.015,
    name: 'OpenAI',
  },
  groq: {
    pricePerKiloChar: 0,
    name: 'Groq',
  },
  cartesia: {
    pricePerKiloChar: 0.05,
    name: 'Cartesia',
  },
  browser: {
    pricePerKiloChar: 0,
    name: 'Browser TTS',
  },
};

/**
 * Get pricing for a provider
 */
export function getProviderPricing(provider: string): { pricePerKiloChar: number; name: string } {
  return PROVIDER_PRICING[provider] || { pricePerKiloChar: 0, name: provider };
}

/**
 * Calculate cost for text based on character count
 */
export function calculateTextCost(text: string, provider: string): number {
  const pricing = getProviderPricing(provider);
  const charCount = text.length;
  return (charCount / 1000) * pricing.pricePerKiloChar;
}

/**
 * Cost estimation options
 */
export interface CostEstimateOptions {
  url: string;
  paragraphs: string[];
  provider: string;
  voice: string;
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
  const { url, paragraphs, provider, voice, startParagraph = 0, endParagraph } = options;

  const end = endParagraph ?? paragraphs.length;
  const selectedParagraphs = paragraphs.slice(startParagraph, end);
  const pricing = getProviderPricing(provider);
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
 */
async function getParagraphCacheStatus(
  url: string,
  paragraphs: string[],
  provider: string,
  voice: string,
): Promise<{
  paragraphs: Array<{ index: number; isCached: boolean; estimatedCost: number }>;
  totalCachedCount: number;
  totalEstimatedCost: number;
  totalSavings: number;
}> {
  const store = getCacheStore();
  const pricing = getProviderPricing(provider);

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
 */
export function recordCacheHit(
  savings: CumulativeSavings,
  provider: string,
  characters: number,
): CumulativeSavings {
  const pricing = getProviderPricing(provider);
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
