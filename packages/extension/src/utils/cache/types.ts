// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Cache Types Module
 * Type definitions for the audio cache system
 *
 * Feature: 028-smart-audio-cache
 *
 * @module utils/cache/types
 */

import { z } from 'zod';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Cache configuration schema
 */
export const cacheConfigSchema = z.object({
  /** Maximum cache size in bytes */
  maxSizeBytes: z
    .number()
    .positive()
    .default(500 * 1024 * 1024), // 500MB default
  /** Maximum number of entries */
  maxEntries: z.number().int().positive().default(1000),
  /** Maximum age for entries in milliseconds */
  maxAgeMs: z
    .number()
    .positive()
    .default(7 * 24 * 60 * 60 * 1000), // 7 days
  /** Eviction threshold percentage (0-100) */
  evictionThresholdPercent: z.number().min(0).max(100).default(90),
  /** Target percentage after eviction (0-100) */
  evictionTargetPercent: z.number().min(0).max(100).default(70),
  /** Whether to persist to IndexedDB */
  persistToIndexedDB: z.boolean().default(true),
  /** IndexedDB database name */
  dbName: z.string().default('proso-audio-cache'),
  /** IndexedDB store name */
  storeName: z.string().default('audio-entries'),
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

// ============================================================================
// Word Timeline Types
// ============================================================================

/**
 * Word timeline item for audio-text synchronization
 */
export const wordTimelineItemSchema = z.object({
  word: z.string(),
  charOffset: z.number().int().nonnegative(),
  charLength: z.number().int().positive(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

export type WordTimelineItem = z.infer<typeof wordTimelineItemSchema>;

// ============================================================================
// Cache Entry Types
// ============================================================================

/**
 * Cached audio entry stored in IndexedDB
 */
export const cachedAudioEntrySchema = z.object({
  /** Unique cache key */
  cacheKey: z.string(),
  /** Source URL */
  url: z.string(),
  /** Paragraph index in the document */
  paragraphIndex: z.number().int().nonnegative(),
  /** Hash of the text content */
  contentHash: z.string(),
  /** TTS provider ID */
  provider: z.string(),
  /** Voice ID used */
  voice: z.string(),
  /** Audio data as ArrayBuffer (stored as Blob in IndexedDB) */
  audioData: z.instanceof(ArrayBuffer),
  /** Word timing data for synchronization */
  wordTimeline: z.array(wordTimelineItemSchema),
  /** Compressed size in bytes */
  compressedSize: z.number().nonnegative(),
  /** Audio duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** When the entry was created */
  createdAt: z.number(),
  /** When the entry was last accessed */
  lastAccessedAt: z.number(),
  /** Number of times the entry was accessed */
  accessCount: z.number().int().nonnegative(),
});

export type CachedAudioEntry = z.infer<typeof cachedAudioEntrySchema>;

// ============================================================================
// Cache Statistics Types
// ============================================================================

/**
 * Cache statistics for monitoring
 */
export const cacheStatsSchema = z.object({
  /** Number of entries in the cache */
  entries: z.number().int().nonnegative(),
  /** Total size of all entries in bytes */
  totalSize: z.number().nonnegative(),
  /** Maximum allowed size in bytes */
  maxSize: z.number().positive(),
  /** Cache hit count */
  hitCount: z.number().int().nonnegative(),
  /** Cache miss count */
  missCount: z.number().int().nonnegative(),
  /** Hit rate as a decimal (0-1) */
  hitRate: z.number().min(0).max(1),
  /** Oldest entry age in milliseconds */
  oldestEntryAgeMs: z.number().nullable(),
});

export type CacheStats = z.infer<typeof cacheStatsSchema>;

// ============================================================================
// Cleanup Result Types
// ============================================================================

/**
 * Result of cache cleanup operation
 */
export const cleanupResultSchema = z.object({
  /** Number of entries removed */
  entriesRemoved: z.number().int().nonnegative(),
  /** Number of stale entries removed */
  staleEntriesRemoved: z.number().int().nonnegative(),
  /** Number of corrupt entries removed */
  corruptEntriesRemoved: z.number().int().nonnegative(),
  /** Bytes freed */
  bytesFreed: z.number().nonnegative(),
  /** Duration of cleanup in milliseconds */
  durationMs: z.number().nonnegative(),
});

export type CleanupResult = z.infer<typeof cleanupResultSchema>;

/**
 * Result of cache eviction operation
 */
export const evictionResultSchema = z.object({
  /** Whether eviction was triggered */
  triggered: z.boolean(),
  /** Number of entries evicted */
  entriesEvicted: z.number().int().nonnegative(),
  /** Bytes freed */
  bytesFreed: z.number().nonnegative(),
  /** Reason for eviction */
  reason: z.string().optional(),
  /** Duration of eviction in milliseconds */
  durationMs: z.number().nonnegative().optional(),
});

export type EvictionResult = z.infer<typeof evictionResultSchema>;

// ============================================================================
// Cost Estimation Types
// ============================================================================

/**
 * Cost estimation result
 */
/**
 * Per-paragraph cost breakdown
 */
const paragraphCostSchema = z.object({
  index: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  isCached: z.boolean(),
  cost: z.number().nonnegative(),
});

export type ParagraphCost = z.infer<typeof paragraphCostSchema>;

export const costEstimateSchema = z.object({
  /** Provider ID */
  provider: z.string(),
  /** Total characters to process */
  totalCharacters: z.number().int().nonnegative(),
  /** Characters already cached */
  cachedCharacters: z.number().int().nonnegative(),
  /** Characters not cached */
  uncachedCharacters: z.number().int().nonnegative(),
  /** Price per 1000 characters */
  pricePerKiloChar: z.number().nonnegative(),
  /** Estimated cost without cache */
  estimatedCost: z.number().nonnegative(),
  /** Actual cost with cache */
  actualCost: z.number().nonnegative(),
  /** Savings from cache */
  savingsFromCache: z.number().nonnegative(),
  /** Savings percentage */
  savingsPercentage: z.number().min(0).max(100),
  /** Per-paragraph cost breakdown */
  paragraphCosts: z.array(paragraphCostSchema),
});

export type CostEstimate = z.infer<typeof costEstimateSchema>;

// ============================================================================
// Cache Index Types (for in-memory index)
// ============================================================================

/**
 * Entry in the cache index (lightweight, for fast lookups)
 */
export interface CacheIndexEntry {
  /** Unique cache key */
  cacheKey: string;
  /** Paragraph index */
  paragraphIndex: number;
  /** Provider used */
  provider: string;
  /** Voice used */
  voice: string;
  /** Content hash for invalidation */
  contentHash: string;
  /** Size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
}

/**
 * Cache index structure (persisted to browser.storage.local)
 */
export interface CacheIndex {
  /** URL-indexed entries: url -> entries[] */
  urlIndex: Record<string, CacheIndexEntry[]>;
  /** Total size of all cached audio */
  totalSize: number;
  /** Number of entries */
  entryCount: number;
  /** Cache hit count */
  hitCount: number;
  /** Cache miss count */
  missCount: number;
  /** Maximum cache size */
  maxSize: number;
  /** Maximum entries */
  maxEntries: number;
  /** Last update timestamp */
  lastUpdated: number;
  /** Index version for migrations */
  version: number;
}
