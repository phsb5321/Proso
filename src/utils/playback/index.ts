// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Playback Module
 * Central export for playback-related utilities including queue management
 * and prefetch services.
 *
 * Feature: 028-smart-audio-cache (User Story 3)
 *
 * @module utils/playback
 */

// ============================================================================
// Exports from playback-queue.ts
// ============================================================================

export {
  PlaybackQueue,
  playbackQueue,
  queueItemStatusSchema,
  type QueueItem,
  type QueueItemStatus,
  type QueueState,
  type QueueOptions,
} from './playback-queue';

// ============================================================================
// Exports from prefetch.ts
// ============================================================================

export {
  PrefetchService,
  prefetchService,
  prefetchPrioritySchema,
  type PrefetchPriority,
  type PrefetchTask,
  type PrefetchedAudio,
  type WordTiming,
  type PrefetchStatus,
  type AudioGenerator,
  type CacheChecker,
  type PrefetchServiceOptions,
} from './prefetch';

console.log('VoxPage: utils/playback/index.ts loaded');
