// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Playback Module — public barrel
 *
 * Only the two singletons consumed via this barrel path
 * (`handlers/prefetch.handlers.ts`) are re-exported here. Tests and
 * internal modules import directly from `./playback-queue` and
 * `./prefetch` source files; those exports stay available via direct
 * path imports.
 *
 * Feature: 028-smart-audio-cache (User Story 3)
 *
 * @module utils/playback
 */

export { playbackQueue } from './playback-queue';
export { prefetchService } from './prefetch';
