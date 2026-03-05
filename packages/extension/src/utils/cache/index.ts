// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Cache Module Index
 * Re-exports all cache utilities for convenient imports
 *
 * Feature: 028-smart-audio-cache
 *
 * @module utils/cache
 */

// Types
export type {
  CacheConfig,
  CachedAudioEntry,
  CacheStats,
  CleanupResult,
  EvictionResult,
  WordTimelineItem,
  CostEstimate,
} from './types';

export {
  cacheConfigSchema,
  cachedAudioEntrySchema,
  cacheStatsSchema,
  cleanupResultSchema,
  evictionResultSchema,
  wordTimelineItemSchema,
  costEstimateSchema,
} from './types';

// Audio Cache Store
export {
  AudioCacheStore,
  getCacheStore,
  resetCacheStore,
  createAudioCacheStore,
  generateContentHash,
  generateCacheKey,
  estimateCost,
} from './audio-cache-store';
