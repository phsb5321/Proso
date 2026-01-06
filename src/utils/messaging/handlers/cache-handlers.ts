// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Cache Message Handlers - Smart Audio Cache
 *
 * Handles cache-related messages for audio caching, prefetch, and cost estimation.
 * Implements CacheProtocolMap from 028-smart-audio-cache/contracts/messaging-protocol.ts
 *
 * @module utils/messaging/handlers/cache-handlers
 */

import {
  getCacheStore,
  estimateCost,
  getParagraphCacheStatus,
  getProviderPricing,
} from '../../cache';
import type { CacheStats, CostEstimate } from '../../cache/types';

// ============================================================================
// Cache Management Handlers
// ============================================================================

/**
 * Get cache statistics
 */
export async function handleCacheGetStats(): Promise<CacheStats> {
  const store = getCacheStore();
  return store.getStats();
}

/**
 * Clear all cache entries
 */
export async function handleCacheClear(): Promise<{
  success: boolean;
  entriesRemoved: number;
  bytesFreed: number;
}> {
  const store = getCacheStore();
  const stats = store.getStats();
  const bytesFreed = stats.totalSize;
  const entriesRemoved = await store.clear();

  return {
    success: true,
    entriesRemoved,
    bytesFreed,
  };
}

/**
 * Clear cache for specific URL
 */
export async function handleCacheClearUrl(data: {
  url: string;
}): Promise<{
  success: boolean;
  entriesRemoved: number;
}> {
  const store = getCacheStore();
  const entriesRemoved = await store.clearForUrl(data.url);

  return {
    success: true,
    entriesRemoved,
  };
}

/**
 * Check if paragraph is cached
 */
export async function handleCacheCheck(data: {
  url: string;
  paragraphIndex: number;
  provider: string;
  voice: string;
  contentHash: string;
}): Promise<{
  isCached: boolean;
  cacheKey?: string;
  size?: number;
}> {
  const store = getCacheStore();
  const cacheKey = store.generateKey(
    data.url,
    data.paragraphIndex,
    data.provider,
    data.voice,
    data.contentHash,
  );

  const isCached = store.has(cacheKey);
  if (!isCached) {
    return { isCached: false };
  }

  const indexData = store.getIndex();
  const urlEntries = indexData.urlIndex[data.url] ?? [];
  const entry = urlEntries.find((e) => e.cacheKey === cacheKey);

  return {
    isCached: true,
    cacheKey,
    size: entry?.size,
  };
}

/**
 * Get cached audio
 */
export async function handleCacheGet(data: {
  cacheKey: string;
}): Promise<{
  success: boolean;
  audioUrl?: string;
  duration?: number;
  wordTimeline?: Array<{
    word: string;
    startTimeMs: number;
    endTimeMs: number;
  }>;
}> {
  const store = getCacheStore();
  const entry = await store.get(data.cacheKey);

  if (!entry) {
    return { success: false };
  }

  // Create blob URL for audio playback
  const codec = entry.codec ?? 'mp3';
  const blob = new Blob([entry.audioData], { type: `audio/${codec}` });
  const audioUrl = URL.createObjectURL(blob);

  return {
    success: true,
    audioUrl,
    duration: entry.durationMs,
    wordTimeline: entry.wordTimeline?.map((w) => ({
      word: w.word,
      startTimeMs: w.startMs,
      endTimeMs: w.endMs,
    })),
  };
}

/**
 * Store audio in cache
 */
export async function handleCacheSet(data: {
  url: string;
  paragraphIndex: number;
  provider: string;
  voice: string;
  contentHash: string;
  audioData: ArrayBuffer;
  durationMs?: number;
  codec?: 'mp3' | 'opus';
  wordTimeline?: Array<{
    word: string;
    startMs: number;
    endMs: number;
    charOffset: number;
    charLength: number;
  }>;
}): Promise<{
  success: boolean;
  cacheKey: string;
  evictedCount: number;
}> {
  const store = getCacheStore();

  // Check eviction before set
  const evictionResult = await store.evictIfNeeded();

  const cacheKey = await store.set({
    url: data.url,
    paragraphIndex: data.paragraphIndex,
    provider: data.provider,
    voice: data.voice,
    contentHash: data.contentHash,
    audioData: data.audioData,
    compressedSize: data.audioData.byteLength,
    durationMs: data.durationMs,
    wordTimeline: data.wordTimeline,
  });

  return {
    success: true,
    cacheKey,
    evictedCount: evictionResult.entriesEvicted,
  };
}

// ============================================================================
// Prefetch Handlers (Skeleton - full implementation in Phase 5)
// ============================================================================

/**
 * Start prefetching paragraphs
 */
export async function handlePrefetchStart(data: {
  url: string;
  startIndex: number;
  count: number;
  provider: string;
  voice: string;
}): Promise<{
  success: boolean;
  prefetchedIndices: number[];
  errors?: Array<{ paragraphIndex: number; error: string }>;
}> {
  // Skeleton - full implementation in Phase 5 (US3)
  return {
    success: true,
    prefetchedIndices: [],
  };
}

/**
 * Get prefetch status
 */
export async function handlePrefetchGetStatus(data: {
  url: string;
}): Promise<{
  prefetchedIndices: number[];
  pendingIndices: number[];
  bufferAhead: number;
}> {
  // Skeleton - full implementation in Phase 5 (US3)
  return {
    prefetchedIndices: [],
    pendingIndices: [],
    bufferAhead: 0,
  };
}

// ============================================================================
// Cost Estimation Handlers (028-smart-audio-cache Phase 7 - US5)
// ============================================================================

/**
 * Get cost estimate for content
 * Calculates estimated API costs with cache-aware pricing
 */
export async function handleCostEstimate(data: {
  url: string;
  paragraphs: string[]; // Paragraphs passed from background
  startParagraph?: number;
  endParagraph?: number;
  provider: string;
  voice: string;
}): Promise<CostEstimate> {
  // If no paragraphs provided, return empty estimate
  if (!data.paragraphs || data.paragraphs.length === 0) {
    const pricing = getProviderPricing(data.provider);
    return {
      totalCharacters: 0,
      cachedCharacters: 0,
      uncachedCharacters: 0,
      provider: data.provider,
      pricePerKiloChar: pricing.pricePerKiloChar,
      estimatedCost: 0,
      actualCost: 0,
      savingsFromCache: 0,
      savingsPercentage: 0,
      paragraphCosts: [],
    };
  }

  // Use the cost estimator service
  return estimateCost({
    url: data.url,
    paragraphs: data.paragraphs,
    provider: data.provider,
    voice: data.voice,
    startParagraph: data.startParagraph,
    endParagraph: data.endParagraph,
  });
}

/**
 * Get paragraph cache status for UI indicators
 * Shows which paragraphs are cached and their estimated costs
 */
export async function handleParagraphsGetStatus(data: {
  url: string;
  paragraphs: string[]; // Paragraphs passed from background
  provider: string;
  voice: string;
}): Promise<{
  paragraphs: Array<{
    index: number;
    isCached: boolean;
    estimatedCost: number;
  }>;
  totalCachedCount: number;
  totalEstimatedCost: number;
  totalSavings: number;
}> {
  // If no paragraphs provided, return empty status
  if (!data.paragraphs || data.paragraphs.length === 0) {
    return {
      paragraphs: [],
      totalCachedCount: 0,
      totalEstimatedCost: 0,
      totalSavings: 0,
    };
  }

  // Use the cost estimator service
  return getParagraphCacheStatus(data.url, data.paragraphs, data.provider, data.voice);
}
