// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Audio Player Port Interface
 *
 * Defines the contract for audio playback in the browser.
 * Adapters:
 * - OffscreenAudioAdapter (Chrome MV3 - offscreen document)
 * - DirectAudioAdapter (Firefox - background script)
 *
 * @module ports/audio-player
 */

import type { Result } from '../core/shared/result';
import type { PlaybackStatus } from '../utils/schemas/playback.schema';

/**
 * Audio player error types
 */
export type AudioPlayerError =
  | { type: 'PLAYBACK_ERROR'; message: string }
  | { type: 'INVALID_AUDIO'; message: string }
  | { type: 'NOT_SUPPORTED'; message: string }
  | { type: 'CONTEXT_LOST'; message: string };

/**
 * Playback event types
 */
export type PlaybackEvent =
  | { type: 'playing'; positionMs: number }
  | { type: 'paused'; positionMs: number }
  | { type: 'ended' }
  | { type: 'timeupdate'; positionMs: number }
  | { type: 'error'; error: AudioPlayerError };

/**
 * Playback event listener
 */
export type PlaybackEventListener = (event: PlaybackEvent) => void;

/**
 * Port interface for audio playback.
 *
 * Implementations:
 * - OffscreenAudioAdapter - Chrome MV3 offscreen document
 * - DirectAudioAdapter - Firefox direct playback
 */
export interface IAudioPlayer {
  /**
   * Load audio blob for playback.
   *
   * @param audioBlob - Audio data (MP3)
   * @returns Result with success or error
   */
  load(audioBlob: Blob): Promise<Result<void, AudioPlayerError>>;

  /**
   * Start or resume playback.
   *
   * @returns Result with success or error
   */
  play(): Promise<Result<void, AudioPlayerError>>;

  /**
   * Pause playback.
   *
   * @returns Result with success or error
   */
  pause(): Promise<Result<void, AudioPlayerError>>;

  /**
   * Stop playback and unload audio.
   *
   * @returns Result with success or error
   */
  stop(): Promise<Result<void, AudioPlayerError>>;

  /**
   * Seek to position.
   *
   * @param positionMs - Position in milliseconds
   * @returns Result with success or error
   */
  seek(positionMs: number): Promise<Result<void, AudioPlayerError>>;

  /**
   * Set playback speed.
   *
   * @param speed - Speed multiplier (0.5 - 2.0)
   * @returns Result with success or error
   */
  setSpeed(speed: number): Promise<Result<void, AudioPlayerError>>;

  /**
   * Get current playback position.
   *
   * @returns Position in milliseconds
   */
  getPosition(): number;

  /**
   * Get audio duration.
   *
   * @returns Duration in milliseconds, or 0 if not loaded
   */
  getDuration(): number;

  /**
   * Get current playback status.
   */
  getStatus(): PlaybackStatus;

  /**
   * Subscribe to playback events.
   *
   * @param listener - Event listener function
   * @returns Unsubscribe function
   */
  addEventListener(listener: PlaybackEventListener): () => void;

  /**
   * Clean up resources.
   */
  dispose(): void;
}
