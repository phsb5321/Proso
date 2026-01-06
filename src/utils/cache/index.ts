// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Cache Module - Central Export
 *
 * Smart Audio Cache & Cost Optimization (028-smart-audio-cache)
 * Provides IndexedDB-based persistent audio caching with LRU eviction.
 *
 * @module utils/cache
 */

// Types
export type {
  CachedAudioEntry,
  CacheIndex,
  CacheIndexEntry,
  CacheConfig,
  CacheStats,
  EvictionResult,
  CleanupResult,
  CacheEvent,
  CacheEventListener,
  WordTimelineItem,
  PlaybackQueue,
  PlaybackQueueItem,
  CostEstimate,
  ParagraphCost,
} from './types';

// Schemas (for runtime validation)
export {
  cachedAudioEntrySchema,
  cacheIndexSchema,
  cacheIndexEntrySchema,
  cacheConfigSchema,
  cacheStatsSchema,
  evictionResultSchema,
  cleanupResultSchema,
  wordTimelineItemSchema,
  playbackQueueSchema,
  playbackQueueItemSchema,
  costEstimateSchema,
  paragraphCostSchema,
} from './types';

// Cache Key utilities
export {
  generateCacheKey,
  generateCacheKeyFromText,
  generateContentHash,
  generateContentHashSync,
  parseCacheKey,
  isValidCacheKey,
  isSameContent,
  normalizeUrl,
  getUrlPattern,
} from './cache-key';

// Cache Index
export { CacheIndexManager, createCacheIndex } from './cache-index';

// Database
export {
  VoxPageCacheDB,
  getDatabase,
  closeDatabase,
  deleteDatabase,
  isIndexedDBAvailable,
  cacheDB,
  AUDIO_CACHE_SCHEMA,
} from './db';

// Audio Cache Store
export {
  AudioCacheStore,
  createAudioCacheStore,
  getCacheStore,
  resetCacheStore,
} from './audio-cache-store';

// Eviction Module
export {
  calculateEvictionScore,
  scoreEntriesForEviction,
  calculateEvictionTargets,
  selectEntriesForEviction,
  needsEviction,
  getStaleEntries,
  createEvictionResult,
  createCleanupResult,
  createEvictionStats,
  updateEvictionStats,
  type EvictionCandidate,
  type EvictionWeights,
  type EvictionStats,
} from './eviction';

// Cost Estimator
export {
  PROVIDER_PRICING,
  getProviderPricing,
  calculateTextCost,
  estimateCost,
  formatCost,
  formatSavings,
  getParagraphCacheStatus,
  createCumulativeSavings,
  recordCacheHit,
  type CostEstimateOptions,
  type CumulativeSavings,
} from './cost-estimator';
