// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * LRU Eviction Module - Smart Audio Cache
 *
 * Implements multi-factor scoring algorithm for cache eviction decisions.
 * Based on research.md recommendations: age, size, access frequency.
 *
 * @module utils/cache/eviction
 */

import { cacheDefaults } from '../config/defaults';
import type { CacheConfig, CacheIndexEntry, CleanupResult, EvictionResult } from './types';

/**
 * Eviction candidate with computed score
 */
export interface EvictionCandidate extends CacheIndexEntry {
  url: string;
  score: number;
}

/**
 * Configuration for eviction scoring weights
 */
export interface EvictionWeights {
  /** Weight for age factor (default: 2.0) */
  ageFactor: number;
  /** Weight for size factor (default: 10.0) */
  sizeFactor: number;
  /** Weight for access frequency (default: logarithmic) */
  accessFactor: number;
}

const DEFAULT_WEIGHTS: EvictionWeights = {
  ageFactor: 2.0,
  sizeFactor: 10.0,
  accessFactor: 1.0,
};

/**
 * Calculate eviction score for a cache entry
 * Higher score = more likely to evict
 *
 * Formula: (ageMinutes * ageFactor) + (sizePercentage * sizeFactor) - log(accessCount + 1)
 *
 * @param entry - Cache index entry
 * @param maxCacheSize - Maximum cache size in bytes
 * @param now - Current timestamp
 * @param weights - Scoring weights configuration
 * @returns Eviction priority score
 */
export function calculateEvictionScore(
  entry: CacheIndexEntry,
  maxCacheSize: number,
  now: number = Date.now(),
  weights: EvictionWeights = DEFAULT_WEIGHTS,
): number {
  // Age in minutes since last access
  const ageMinutes = (now - entry.lastAccessedAt) / (60 * 1000);

  // Size as percentage of max cache
  const sizePercentage = (entry.size / maxCacheSize) * 100;

  // Access frequency (use 1 if not tracked to avoid log(0))
  // Note: accessCount is not in CacheIndexEntry, so we'll use a default of 1
  // In the future, we could track this in the index
  const accessCount = 1;

  // Higher score = more likely to evict
  // Older entries get higher scores
  // Larger entries get higher scores
  // More frequently accessed entries get lower scores
  const score =
    ageMinutes * weights.ageFactor +
    sizePercentage * weights.sizeFactor -
    Math.log(accessCount + 1) * weights.accessFactor;

  return score;
}

/**
 * Score and sort entries for eviction
 * Returns entries sorted by eviction priority (highest score first)
 *
 * @param entries - Array of cache index entries with URL
 * @param maxCacheSize - Maximum cache size in bytes
 * @param now - Current timestamp
 * @returns Sorted array of eviction candidates
 */
export function scoreEntriesForEviction(
  entries: Array<CacheIndexEntry & { url: string }>,
  maxCacheSize: number,
  now: number = Date.now(),
): EvictionCandidate[] {
  const scored = entries.map((entry) => ({
    ...entry,
    score: calculateEvictionScore(entry, maxCacheSize, now),
  }));

  // Sort by score descending (highest score = first to evict)
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Determine how many entries need to be evicted to reach target
 *
 * @param currentSize - Current cache size in bytes
 * @param currentEntries - Current number of entries
 * @param config - Cache configuration
 * @returns Object with target size and entry count to free
 */
export function calculateEvictionTargets(
  currentSize: number,
  currentEntries: number,
  config: CacheConfig,
): { targetSize: number; targetEntries: number; bytesToFree: number; entriesToFree: number } {
  const targetSize = (config.evictionTargetPercent / 100) * config.maxSizeBytes;
  const targetEntries = Math.floor((config.evictionTargetPercent / 100) * config.maxEntries);

  return {
    targetSize,
    targetEntries,
    bytesToFree: Math.max(0, currentSize - targetSize),
    entriesToFree: Math.max(0, currentEntries - targetEntries),
  };
}

/**
 * Select entries for batch eviction
 * Uses multi-factor scoring to select optimal entries for removal
 *
 * @param entries - All cache entries with URL and metadata
 * @param currentSize - Current total cache size in bytes
 * @param currentEntries - Current entry count
 * @param config - Cache configuration
 * @returns Array of entries to evict
 */
export function selectEntriesForEviction(
  entries: Array<CacheIndexEntry & { url: string }>,
  currentSize: number,
  currentEntries: number,
  config: CacheConfig = cacheDefaults,
): EvictionCandidate[] {
  // Calculate targets
  const targets = calculateEvictionTargets(currentSize, currentEntries, config);

  // If nothing needs to be evicted, return empty
  if (targets.bytesToFree <= 0 && targets.entriesToFree <= 0) {
    return [];
  }

  // Score and sort all entries
  const scoredEntries = scoreEntriesForEviction(entries, config.maxSizeBytes);

  // Select entries until we meet both targets
  const toEvict: EvictionCandidate[] = [];
  let freedBytes = 0;
  let freedEntries = 0;

  for (const entry of scoredEntries) {
    // Stop when both targets are met
    if (freedBytes >= targets.bytesToFree && freedEntries >= targets.entriesToFree) {
      break;
    }

    toEvict.push(entry);
    freedBytes += entry.size;
    freedEntries++;
  }

  return toEvict;
}

/**
 * Check if eviction is needed based on thresholds
 *
 * @param currentSize - Current cache size in bytes
 * @param currentEntries - Current entry count
 * @param config - Cache configuration
 * @returns true if eviction threshold is exceeded
 */
export function needsEviction(
  currentSize: number,
  currentEntries: number,
  config: CacheConfig = cacheDefaults,
): boolean {
  const sizePercent = (currentSize / config.maxSizeBytes) * 100;
  const entryPercent = (currentEntries / config.maxEntries) * 100;

  return (
    sizePercent >= config.evictionThresholdPercent ||
    entryPercent >= config.evictionThresholdPercent
  );
}

/**
 * Get stale entries older than max age
 *
 * @param entries - All cache entries with URL
 * @param maxAgeMs - Maximum age in milliseconds
 * @param now - Current timestamp
 * @returns Array of stale entries
 */
export function getStaleEntries(
  entries: Array<CacheIndexEntry & { url: string }>,
  maxAgeMs: number,
  now: number = Date.now(),
): Array<CacheIndexEntry & { url: string }> {
  const cutoffTime = now - maxAgeMs;

  return entries.filter((entry) => entry.lastAccessedAt < cutoffTime);
}

/**
 * Create an eviction result object
 */
export function createEvictionResult(
  triggered: boolean,
  entriesEvicted: number,
  bytesFreed: number,
  reason: EvictionResult['reason'],
  startTime: number,
): EvictionResult {
  return {
    triggered,
    entriesEvicted,
    bytesFreed,
    reason,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Create a cleanup result object
 */
export function createCleanupResult(
  staleEntriesRemoved: number,
  corruptEntriesRemoved: number,
  bytesFreed: number,
  startTime: number,
): CleanupResult {
  return {
    entriesRemoved: staleEntriesRemoved + corruptEntriesRemoved,
    bytesFreed,
    staleEntriesRemoved,
    corruptEntriesRemoved,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Eviction statistics for monitoring
 */
export interface EvictionStats {
  /** Total number of evictions performed */
  totalEvictions: number;
  /** Total bytes freed by eviction */
  totalBytesFreed: number;
  /** Total entries evicted */
  totalEntriesEvicted: number;
  /** Average eviction batch size */
  averageBatchSize: number;
  /** Last eviction timestamp */
  lastEvictionTime: number | null;
}

/**
 * Create initial eviction stats
 */
export function createEvictionStats(): EvictionStats {
  return {
    totalEvictions: 0,
    totalBytesFreed: 0,
    totalEntriesEvicted: 0,
    averageBatchSize: 0,
    lastEvictionTime: null,
  };
}

/**
 * Update eviction stats after an eviction
 */
export function updateEvictionStats(stats: EvictionStats, result: EvictionResult): EvictionStats {
  if (!result.triggered || result.entriesEvicted === 0) {
    return stats;
  }

  const newTotalEvictions = stats.totalEvictions + 1;
  const newTotalEntriesEvicted = stats.totalEntriesEvicted + result.entriesEvicted;

  return {
    totalEvictions: newTotalEvictions,
    totalBytesFreed: stats.totalBytesFreed + result.bytesFreed,
    totalEntriesEvicted: newTotalEntriesEvicted,
    averageBatchSize: newTotalEntriesEvicted / newTotalEvictions,
    lastEvictionTime: Date.now(),
  };
}
