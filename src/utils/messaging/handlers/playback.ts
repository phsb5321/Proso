// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Playback Message Handlers
 * Handles playback control messages using @webext-core/messaging
 *
 * @module utils/messaging/handlers/playback
 */

import type { VoxPageProtocol } from '../protocol';
import type {
  PlaybackStartParams,
  PlaybackSeekParams,
  PlaybackSetSpeedParams,
  PlaybackStateResponse,
} from '../types';
import {
  playbackStartParamsSchema,
  playbackSeekParamsSchema,
  playbackSetSpeedParamsSchema,
} from '../schemas';

/**
 * TODO Phase 4: These handlers are stubs that will be implemented when
 * entrypoints/background.ts is migrated to use PlaybackController.
 *
 * For now, these provide the type-safe interface definitions.
 * The actual implementation will delegate to the PlaybackController instance
 * once background.ts is converted.
 */

/**
 * Start playback handler
 */
export async function handlePlaybackStart(
  params: PlaybackStartParams
): Promise<VoxPageProtocol['playback.start']['response']> {
  // Validate params
  const validated = playbackStartParamsSchema.parse(params);

  // TODO Phase 4: Delegate to PlaybackController.start()
  // const controller = getPlaybackController();
  // await controller.start(validated.mode, validated.provider, validated.voice, validated.speed);

  return {
    success: true,
    status: 'loading',
    currentIndex: 0,
    totalParagraphs: 0,
  };
}

/**
 * Pause playback handler
 */
export async function handlePlaybackPause(): Promise<VoxPageProtocol['playback.pause']['response']> {
  // TODO Phase 4: Delegate to PlaybackController.pause()

  return {
    success: true,
    status: 'paused',
    currentIndex: 0,
  };
}

/**
 * Stop playback handler
 */
export async function handlePlaybackStop(): Promise<VoxPageProtocol['playback.stop']['response']> {
  // TODO Phase 4: Delegate to PlaybackController.stop()

  return {
    success: true,
    status: 'stopped',
  };
}

/**
 * Next paragraph handler
 */
export async function handlePlaybackNext(): Promise<VoxPageProtocol['playback.next']['response']> {
  // TODO Phase 4: Delegate to PlaybackController.next()

  return {
    success: true,
    currentIndex: 1,
    totalParagraphs: 10,
  };
}

/**
 * Previous paragraph handler
 */
export async function handlePlaybackPrev(): Promise<VoxPageProtocol['playback.prev']['response']> {
  // TODO Phase 4: Delegate to PlaybackController.prev()

  return {
    success: true,
    currentIndex: 0,
    totalParagraphs: 10,
  };
}

/**
 * Seek to paragraph handler
 */
export async function handlePlaybackSeek(
  params: PlaybackSeekParams
): Promise<VoxPageProtocol['playback.seek']['response']> {
  // Validate params
  const validated = playbackSeekParamsSchema.parse(params);

  // TODO Phase 4: Delegate to PlaybackController.seekToParagraph()

  return {
    success: true,
    currentIndex: validated.index,
  };
}

/**
 * Get playback state handler
 */
export async function handlePlaybackGetState(): Promise<VoxPageProtocol['playback.getState']['response']> {
  // TODO Phase 4: Delegate to PlaybackController.getState()

  return {
    status: 'idle',
    currentIndex: 0,
    totalParagraphs: 0,
    progress: 0,
    currentText: '',
    provider: 'browser',
    voice: null,
    speed: 1.0,
    mode: 'article',
  };
}

/**
 * Set playback speed handler
 */
export async function handlePlaybackSetSpeed(
  params: PlaybackSetSpeedParams
): Promise<VoxPageProtocol['playback.setSpeed']['response']> {
  // Validate params
  const validated = playbackSetSpeedParamsSchema.parse(params);

  // TODO Phase 4: Delegate to PlaybackController.setSpeed()

  return {
    success: true,
    speed: validated.speed,
  };
}
