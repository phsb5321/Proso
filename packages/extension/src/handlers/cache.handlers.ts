/**
 * Cache Message Handlers
 *
 * Handlers for cache-related messages in the hexagonal architecture.
 * These handlers provide access to the cache store adapter.
 *
 * @module handlers/cache
 */

import { getContainer, isContainerInitialized } from '../composition';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { CacheKey, CacheStats } from '../ports/cache-store.port';
import { getCacheStore } from '../utils/cache/audio-cache-store';
import { getProviderPricing } from '../utils/cache/cost-estimator';
import type { HandlerRegistry } from './registry';
import {
  cacheClearParamsSchema,
  cacheKeyParamsSchema,
  getCachedParagraphsParamsSchema,
  costEstimateParamsSchema,
} from './schemas/cache.schemas';

/**
 * Cache handler error type.
 */
export type CacheHandlerError =
  | { type: 'adapter_unavailable'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response types for cache handlers.
 */
export interface CacheStatsResponse {
  entries: number;
  totalSizeBytes: number;
  maxSizeBytes: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  oldestEntryAgeMs: number | null;
}

export interface CacheClearResponse {
  success: boolean;
  entriesCleared: number;
}

export interface CacheCheckResponse {
  exists: boolean;
}

export interface CacheEvictionResponse {
  success: boolean;
  entriesEvicted: number;
}

/**
 * Response for getCachedParagraphs handler.
 */
export interface CachedParagraphsResponse {
  cachedIndices: number[];
  totalParagraphs: number;
}

/**
 * Parameters for getCachedParagraphs handler.
 */
export interface GetCachedParagraphsParams {
  url: string;
  provider?: string;
  voice?: string;
  totalParagraphs?: number;
}

/**
 * Parameters for cost.estimate handler.
 */
export interface CostEstimateParams {
  url: string;
  paragraphs: string[];
  provider?: string;
  voice?: string;
  startParagraph?: number;
  endParagraph?: number;
}

/**
 * Response for cost.estimate handler.
 */
export interface CostEstimateResponse {
  totalCharacters: number;
  cachedCharacters: number;
  uncachedCharacters: number;
  provider: string;
  pricePerKiloChar: number;
  estimatedCost: number;
  actualCost: number;
  savingsFromCache: number;
  savingsPercentage: number;
  paragraphCosts: Array<{
    index: number;
    characters: number;
    isCached: boolean;
    cost: number;
  }>;
}

/**
 * Register cache message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerCacheHandlers(registry: HandlerRegistry): void {
  /**
   * Get cache statistics.
   */
  registry.register<void, Result<CacheStatsResponse, CacheHandlerError>>(
    'cache.getStats',
    async () => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'adapter_unavailable',
          message: 'Container not initialized. Cache adapter unavailable.',
        });
      }

      try {
        const container = getContainer();
        const cacheStore = container.adapters.cacheStore;

        if (!cacheStore) {
          return Err({
            type: 'adapter_unavailable',
            message: 'Cache store adapter not available.',
          });
        }

        const stats: CacheStats = await cacheStore.getStats();
        const hitRate =
          stats.hitCount + stats.missCount > 0
            ? stats.hitCount / (stats.hitCount + stats.missCount)
            : 0;

        return Ok({
          entries: stats.entries,
          totalSizeBytes: stats.totalSizeBytes,
          maxSizeBytes: stats.maxSizeBytes,
          hitCount: stats.hitCount,
          missCount: stats.missCount,
          hitRate,
          oldestEntryAgeMs: stats.oldestEntryAgeMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get cache statistics',
  );

  /**
   * Clear all cache entries.
   */
  registry.register<unknown, Result<CacheClearResponse, CacheHandlerError>>(
    'cache.clear',
    async (params) => {
      const parsed = cacheClearParamsSchema.safeParse(params ?? {});
      if (!parsed.success) {
        return Err({ type: 'invalid_params', message: parsed.error.issues.map(i => i.message).join('; ') });
      }

      if (!isContainerInitialized()) {
        return Err({
          type: 'adapter_unavailable',
          message: 'Container not initialized. Cache adapter unavailable.',
        });
      }

      try {
        const container = getContainer();
        const cacheStore = container.adapters.cacheStore;

        if (!cacheStore) {
          return Err({
            type: 'adapter_unavailable',
            message: 'Cache store adapter not available.',
          });
        }

        const result = await cacheStore.clear(parsed.data.urlFilter);

        if (!result.ok) {
          return Ok({ success: false, entriesCleared: 0 });
        }

        return Ok({ success: true, entriesCleared: result.value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Clear cache entries',
  );

  /**
   * Check if a cache entry exists.
   */
  registry.register<unknown, Result<CacheCheckResponse, CacheHandlerError>>(
    'cache.has',
    async (params) => {
      const parsed = cacheKeyParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({ type: 'invalid_params', message: parsed.error.issues.map(i => i.message).join('; ') });
      }

      if (!isContainerInitialized()) {
        return Err({
          type: 'adapter_unavailable',
          message: 'Container not initialized. Cache adapter unavailable.',
        });
      }

      try {
        const container = getContainer();
        const cacheStore = container.adapters.cacheStore;

        if (!cacheStore) {
          return Err({
            type: 'adapter_unavailable',
            message: 'Cache store adapter not available.',
          });
        }

        const exists = await cacheStore.has(parsed.data as CacheKey);
        return Ok({ exists });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Check if cache entry exists',
  );

  /**
   * Delete a cache entry.
   */
  registry.register<unknown, Result<{ success: boolean; deleted: boolean }, CacheHandlerError>>(
    'cache.delete',
    async (params) => {
      const parsed = cacheKeyParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({ type: 'invalid_params', message: parsed.error.issues.map(i => i.message).join('; ') });
      }

      if (!isContainerInitialized()) {
        return Err({
          type: 'adapter_unavailable',
          message: 'Container not initialized. Cache adapter unavailable.',
        });
      }

      try {
        const container = getContainer();
        const cacheStore = container.adapters.cacheStore;

        if (!cacheStore) {
          return Err({
            type: 'adapter_unavailable',
            message: 'Cache store adapter not available.',
          });
        }

        const result = await cacheStore.delete(parsed.data as CacheKey);

        if (!result.ok) {
          return Ok({ success: false, deleted: false });
        }

        return Ok({ success: true, deleted: result.value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Delete a cache entry',
  );

  /**
   * Trigger cache eviction if needed.
   */
  registry.register<void, Result<CacheEvictionResponse, CacheHandlerError>>(
    'cache.evictIfNeeded',
    async () => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'adapter_unavailable',
          message: 'Container not initialized. Cache adapter unavailable.',
        });
      }

      try {
        const container = getContainer();
        const cacheStore = container.adapters.cacheStore;

        if (!cacheStore) {
          return Err({
            type: 'adapter_unavailable',
            message: 'Cache store adapter not available.',
          });
        }

        const result = await cacheStore.evictIfNeeded();

        if (!result.ok) {
          return Ok({ success: false, entriesEvicted: 0 });
        }

        return Ok({ success: true, entriesEvicted: result.value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Trigger cache eviction if needed',
  );

  /**
   * Get cached paragraph indices for a URL.
   * Uses the legacy cache store directly (until port interface is extended).
   */
  registry.register<unknown, Result<CachedParagraphsResponse, CacheHandlerError>>(
    'cache.getCachedParagraphs',
    async (params) => {
      const parsed = getCachedParagraphsParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({ type: 'invalid_params', message: parsed.error.issues.map(i => i.message).join('; ') });
      }

      try {
        const cacheStore = getCacheStore();
        const provider = parsed.data.provider || 'elevenlabs';
        const voice = parsed.data.voice || '';

        if (!cacheStore.isInitialized) {
          return Ok({
            cachedIndices: [],
            totalParagraphs: parsed.data.totalParagraphs ?? 0,
          });
        }

        const cachedIndices = cacheStore.getCachedParagraphs(parsed.data.url, provider, voice);
        return Ok({
          cachedIndices,
          totalParagraphs: parsed.data.totalParagraphs ?? 0,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get cached paragraph indices for URL',
  );

  /**
   * Estimate TTS cost for paragraphs with cache awareness.
   */
  registry.register<unknown, Result<CostEstimateResponse, CacheHandlerError>>(
    'cost.estimate',
    async (params) => {
      const parsed = costEstimateParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({ type: 'invalid_params', message: parsed.error.issues.map(i => i.message).join('; ') });
      }

      const paragraphs = parsed.data.paragraphs ?? [];
      const provider = parsed.data.provider || 'elevenlabs';
      const voice = parsed.data.voice || '';
      const startParagraph = parsed.data.startParagraph ?? 0;
      const endParagraph = parsed.data.endParagraph ?? paragraphs.length;

      // If no paragraphs provided, return empty estimate
      if (paragraphs.length === 0) {
        return Ok({
          totalCharacters: 0,
          cachedCharacters: 0,
          uncachedCharacters: 0,
          provider,
          pricePerKiloChar: 0,
          estimatedCost: 0,
          actualCost: 0,
          savingsFromCache: 0,
          savingsPercentage: 0,
          paragraphCosts: [],
        });
      }

      try {
        const cacheStore = getCacheStore();
        const pricing = getProviderPricing(provider);
        const relevantParagraphs = paragraphs.slice(startParagraph, endParagraph);

        // Get cached paragraph indices
        let cachedIndicesSet = new Set<number>();
        if (cacheStore.isInitialized) {
          const cachedIndices = cacheStore.getCachedParagraphs(parsed.data.url, provider, voice);
          cachedIndicesSet = new Set(cachedIndices);
        }

        // Calculate costs per paragraph
        let totalCharacters = 0;
        let cachedCharacters = 0;
        let uncachedCharacters = 0;
        const paragraphCosts: Array<{
          index: number;
          characters: number;
          isCached: boolean;
          cost: number;
        }> = [];

        for (let i = 0; i < relevantParagraphs.length; i++) {
          const absoluteIndex = startParagraph + i;
          const text = relevantParagraphs[i];
          const charCount = text.length;
          totalCharacters += charCount;

          const isCached = cachedIndicesSet.has(absoluteIndex);
          if (isCached) {
            cachedCharacters += charCount;
            paragraphCosts.push({
              index: absoluteIndex,
              characters: charCount,
              isCached: true,
              cost: 0,
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
        const savingsPercentage =
          totalCharacters > 0 ? (cachedCharacters / totalCharacters) * 100 : 0;

        return Ok({
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
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Estimate TTS cost with cache awareness',
  );
}
