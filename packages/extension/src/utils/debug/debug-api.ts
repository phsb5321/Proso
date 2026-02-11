// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Debug API
 *
 * Development-only diagnostic API that exposes internal state for debugging.
 * Wrapped in a process.env.NODE_ENV !== 'production' guard so Vite/esbuild
 * tree-shakes the entire module in production builds.
 *
 * Exposed state:
 * - extractedText: current article paragraphs
 * - playbackState: playback status, position, provider
 * - cacheStats: cache hit/miss ratio, size, entry count
 * - logBuffer: recent log entries (last 100)
 * - handlerRegistry: registered handler names and dispatch stats
 * - providerConfig: active provider, voice, speed (NOT API keys)
 *
 * @module utils/debug/debug-api
 */

import type { LogEntry } from '../logging/entry';

/**
 * Shape of the debug snapshot returned by getDebugSnapshot().
 */
export interface DebugSnapshot {
  extractedText: {
    paragraphCount: number;
    paragraphs: string[];
  };
  playbackState: {
    status: string;
    currentParagraph: number;
    totalParagraphs: number;
    progress: number;
    speed: number;
    provider: string;
    voice: string;
  };
  cacheStats: {
    entries: number;
    totalSizeBytes: number;
    maxSizeBytes: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  };
  logBuffer: LogEntry[];
  handlerRegistry: {
    handlerCount: number;
    handlerNames: string[];
    dispatchStats: {
      hexTotal: number;
      legacyTotal: number;
      unknownTotal: number;
      hexPercentage: number;
    };
  };
  providerConfig: {
    provider: string;
    voice: string;
    speed: number;
  };
}

/**
 * State provider callbacks that the debug API uses to collect state.
 * These are injected at initialization to avoid hard coupling to
 * background.ts module-level variables.
 */
export interface DebugStateProviders {
  getExtractedParagraphs: () => string[];
  getPlaybackState: () => {
    status: string;
    currentParagraph: number;
    totalParagraphs: number;
    progress: number;
    speed: number;
    provider: string;
    voice: string;
  };
  getCacheStats: () => {
    entries: number;
    totalSize: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  };
  getLogBuffer: () => LogEntry[];
  getHandlerNames: () => string[];
  getHandlerCount: () => number;
  getDispatchStats: () => {
    hexTotal: number;
    legacyTotal: number;
    unknownTotal: number;
    hexPercentage: number;
  };
  getProviderConfig: () => {
    provider: string;
    voice: string;
    speed: number;
  };
}

// Store registered providers (module-level, dev-only)
let registeredProviders: DebugStateProviders | null = null;

/**
 * Register state providers for the debug API.
 * Called once during background.ts initialization.
 *
 * @param providers - Callback functions that return current state
 */
export function registerDebugProviders(providers: DebugStateProviders): void {
  registeredProviders = providers;
}

/**
 * Unregister state providers (for testing).
 */
export function unregisterDebugProviders(): void {
  registeredProviders = null;
}

/**
 * Get a complete debug snapshot of extension state.
 * Returns JSON-serializable data with NO API keys.
 *
 * @returns Debug snapshot or null if providers not registered
 */
export function getDebugSnapshot(): DebugSnapshot | null {
  if (!registeredProviders) {
    return null;
  }

  const providers = registeredProviders;
  const paragraphs = providers.getExtractedParagraphs();
  const playback = providers.getPlaybackState();
  const cache = providers.getCacheStats();
  const logEntries = providers.getLogBuffer();
  const handlerNames = providers.getHandlerNames();
  const handlerCount = providers.getHandlerCount();
  const dispatch = providers.getDispatchStats();
  const providerConfig = providers.getProviderConfig();

  return {
    extractedText: {
      paragraphCount: paragraphs.length,
      paragraphs,
    },
    playbackState: {
      status: playback.status,
      currentParagraph: playback.currentParagraph,
      totalParagraphs: playback.totalParagraphs,
      progress: playback.progress,
      speed: playback.speed,
      provider: playback.provider,
      voice: playback.voice,
    },
    cacheStats: {
      entries: cache.entries,
      totalSizeBytes: cache.totalSize,
      maxSizeBytes: cache.maxSize,
      hitCount: cache.hitCount,
      missCount: cache.missCount,
      hitRate: cache.hitRate,
    },
    logBuffer: logEntries.slice(-100),
    handlerRegistry: {
      handlerCount,
      handlerNames,
      dispatchStats: {
        hexTotal: dispatch.hexTotal,
        legacyTotal: dispatch.legacyTotal,
        unknownTotal: dispatch.unknownTotal,
        hexPercentage: dispatch.hexPercentage,
      },
    },
    providerConfig: {
      provider: providerConfig.provider,
      voice: providerConfig.voice,
      speed: providerConfig.speed,
    },
  };
}

/**
 * Check whether the debug API is available.
 * Always true in dev builds, always false in production (tree-shaken).
 */
export function isDebugApiAvailable(): boolean {
  return true;
}
