// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Cache Types - Smart Audio Cache & Cost Optimization
 *
 * Zod schemas and TypeScript types for the audio cache system.
 * Based on data-model.md from 028-smart-audio-cache feature.
 *
 * @module utils/cache/types
 */

import { z } from 'zod';

// ============================================================================
// Word Timeline Schema (shared with audio module)
// ============================================================================

export const wordTimelineItemSchema = z.object({
  word: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  charOffset: z.number().int().nonnegative(),
  charLength: z.number().int().positive(),
});

export type WordTimelineItem = z.infer<typeof wordTimelineItemSchema>;

// ============================================================================
// CachedAudioEntry - Single cached audio segment in IndexedDB
// ============================================================================

export const cachedAudioEntrySchema = z.object({
  // Primary key - composite of URL, paragraph, provider, voice, content hash
  cacheKey: z.string().min(1),

  // Audio data
  audioData: z.instanceof(ArrayBuffer),
  compressedSize: z.number().nonnegative(),
  originalSize: z.number().nonnegative().optional(), // Optional - same as compressed for TTS
  codec: z.enum(['mp3', 'opus']).optional(), // Defaults to 'mp3' in handler
  durationMs: z.number().nonnegative().optional(), // milliseconds

  // Source identification
  url: z.string().url(),
  paragraphIndex: z.number().int().nonnegative(),
  contentHash: z.string().min(8).max(64), // SHA-256 truncated

  // Provider metadata
  provider: z.string().min(1),
  voice: z.string().min(1),

  // Timing data (optional - only if provider supports word timing)
  wordTimeline: z.array(wordTimelineItemSchema).optional(),

  // LRU tracking
  createdAt: z.number(), // Unix timestamp ms
  lastAccessedAt: z.number(), // Unix timestamp ms
  accessCount: z.number().int().nonnegative().default(0),
});

export type CachedAudioEntry = z.infer<typeof cachedAudioEntrySchema>;

// ============================================================================
// CacheIndexEntry - Lightweight reference for in-memory index
// ============================================================================

export const cacheIndexEntrySchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  cacheKey: z.string(),
  size: z.number().nonnegative(),
  lastAccessedAt: z.number(),
});

export type CacheIndexEntry = z.infer<typeof cacheIndexEntrySchema>;

// ============================================================================
// CacheIndex - In-memory index for fast lookups
// ============================================================================

export const cacheIndexSchema = z.object({
  // Mapping: URL → paragraph entries
  urlIndex: z.record(z.string(), z.array(cacheIndexEntrySchema)),

  // Cache statistics
  totalSize: z.number().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  hitCount: z.number().int().nonnegative(),
  missCount: z.number().int().nonnegative(),

  // Configuration
  maxSize: z.number().positive(),
  maxEntries: z.number().int().positive(),

  // Metadata
  lastUpdated: z.number(),
  version: z.number().int().positive(),
});

export type CacheIndex = z.infer<typeof cacheIndexSchema>;

// ============================================================================
// CacheConfig - User-configurable cache settings
// ============================================================================

export const cacheConfigSchema = z.object({
  // Size limits
  maxSizeBytes: z
    .number()
    .positive()
    .default(500 * 1024 * 1024), // 500MB
  maxEntries: z.number().int().positive().default(1000),

  // Age limits
  maxAgeMs: z
    .number()
    .positive()
    .default(30 * 24 * 60 * 60 * 1000), // 30 days

  // Eviction thresholds
  evictionThresholdPercent: z.number().min(50).max(100).default(90),
  evictionTargetPercent: z.number().min(30).max(90).default(70),

  // Feature toggles
  enabled: z.boolean().default(true),
  persistToIndexedDB: z.boolean().default(true),

  // Prefetch settings
  prefetchAhead: z.number().int().min(1).max(10).default(3),
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

// ============================================================================
// PlaybackQueueItem - Single paragraph in playback queue
// ============================================================================

export const playbackQueueItemSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  cacheStatus: z.enum(['cached', 'pending', 'loading', 'error']),
  cacheKey: z.string().optional(), // Only if cached
  estimatedCost: z.number().nonnegative(), // $0.00 if cached
  characterCount: z.number().int().positive(),
});

export type PlaybackQueueItem = z.infer<typeof playbackQueueItemSchema>;

// ============================================================================
// PlaybackQueue - Ordered list of paragraphs for current session
// ============================================================================

export const playbackQueueSchema = z.object({
  items: z.array(playbackQueueItemSchema),
  startIndex: z.number().int().nonnegative(), // User-selected start
  currentIndex: z.number().int().nonnegative(),
  prefetchedIndices: z.array(z.number()), // Indices with audio ready (Set not serializable)

  // Queue metadata
  url: z.string().url(),
  provider: z.string(),
  voice: z.string(),

  // Totals
  totalParagraphs: z.number().int().nonnegative(),
  cachedCount: z.number().int().nonnegative(),
  estimatedTotalCost: z.number().nonnegative(),
});

export type PlaybackQueue = z.infer<typeof playbackQueueSchema>;

// ============================================================================
// CostEstimate - Calculated cost for playback content
// ============================================================================

export const paragraphCostSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  isCached: z.boolean(),
  cost: z.number().nonnegative(),
});

export type ParagraphCost = z.infer<typeof paragraphCostSchema>;

export const costEstimateSchema = z.object({
  // Character counts
  totalCharacters: z.number().int().nonnegative(),
  cachedCharacters: z.number().int().nonnegative(),
  uncachedCharacters: z.number().int().nonnegative(),

  // Provider pricing
  provider: z.string(),
  pricePerKiloChar: z.number().nonnegative(), // $/1000 chars

  // Cost calculations
  estimatedCost: z.number().nonnegative(), // Total if not cached
  actualCost: z.number().nonnegative(), // After cache savings
  savingsFromCache: z.number().nonnegative(),
  savingsPercentage: z.number().min(0).max(100),

  // Breakdown by paragraph
  paragraphCosts: z.array(paragraphCostSchema),
});

export type CostEstimate = z.infer<typeof costEstimateSchema>;

// ============================================================================
// Cache Statistics
// ============================================================================

export const cacheStatsSchema = z.object({
  entries: z.number().int().nonnegative(),
  totalSize: z.number().nonnegative(),
  maxSize: z.number().positive(),
  sizePercentage: z.number().min(0).max(100),
  hitCount: z.number().int().nonnegative(),
  missCount: z.number().int().nonnegative(),
  hitRate: z.number().min(0).max(100),
  oldestEntryAge: z.number().nonnegative().optional(),
  newestEntryAge: z.number().nonnegative().optional(),
});

export type CacheStats = z.infer<typeof cacheStatsSchema>;

// ============================================================================
// Eviction Result
// ============================================================================

export const evictionResultSchema = z.object({
  triggered: z.boolean(),
  entriesEvicted: z.number().int().nonnegative(),
  bytesFreed: z.number().nonnegative(),
  reason: z.enum(['size_limit', 'entry_limit', 'none']),
  durationMs: z.number().nonnegative(),
});

export type EvictionResult = z.infer<typeof evictionResultSchema>;

// ============================================================================
// Cleanup Result
// ============================================================================

export const cleanupResultSchema = z.object({
  entriesRemoved: z.number().int().nonnegative(),
  bytesFreed: z.number().nonnegative(),
  staleEntriesRemoved: z.number().int().nonnegative(),
  corruptEntriesRemoved: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export type CleanupResult = z.infer<typeof cleanupResultSchema>;

// ============================================================================
// Cache Events for Monitoring
// ============================================================================

export type CacheEvent =
  | { type: 'hit'; cacheKey: string; size: number }
  | { type: 'miss'; cacheKey: string }
  | { type: 'set'; cacheKey: string; size: number }
  | { type: 'delete'; cacheKey: string; size: number }
  | { type: 'eviction'; count: number; bytesFreed: number }
  | { type: 'cleanup'; count: number; bytesFreed: number }
  | { type: 'error'; operation: string; error: string };

export type CacheEventListener = (event: CacheEvent) => void;
