// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Direct Audio Adapter
 *
 * Implements IAudioPlayer port for Firefox using Web Audio API directly.
 * Firefox MV2/MV3 background scripts can play audio directly.
 *
 * @module adapters/audio/direct.adapter
 */

import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type {
  AudioPlayerError,
  IAudioPlayer,
  PlaybackEvent,
  PlaybackEventListener,
} from '../../ports/audio-player.port';
import type { PlaybackStatus } from '../../utils/schemas/playback.schema';

/**
 * DirectAudioAdapter
 *
 * Direct audio playback using HTML5 Audio element.
 * Used in Firefox where background scripts can play audio.
 */
export class DirectAudioAdapter implements IAudioPlayer {
  private audioElement: HTMLAudioElement | null = null;
  private listeners: Set<PlaybackEventListener> = new Set();
  private status: PlaybackStatus = 'idle';
  private currentObjectUrl: string | null = null;
  private speed = 1.0;

  /**
   * Create and set up audio element
   */
  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.setupEventListeners();
    }
    return this.audioElement;
  }

  /**
   * Set up event listeners on audio element
   */
  private setupEventListeners(): void {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('play', () => {
      this.status = 'playing';
      this.notifyListeners({
        type: 'playing',
        positionMs: this.getPosition(),
      });
    });

    this.audioElement.addEventListener('pause', () => {
      this.status = 'paused';
      this.notifyListeners({
        type: 'paused',
        positionMs: this.getPosition(),
      });
    });

    this.audioElement.addEventListener('ended', () => {
      this.status = 'idle';
      this.notifyListeners({ type: 'ended' });
    });

    this.audioElement.addEventListener('timeupdate', () => {
      this.notifyListeners({
        type: 'timeupdate',
        positionMs: this.getPosition(),
      });
    });

    this.audioElement.addEventListener('error', () => {
      this.status = 'error';
      const error = this.audioElement?.error;
      this.notifyListeners({
        type: 'error',
        error: {
          type: 'PLAYBACK_ERROR',
          message: error?.message || 'Unknown playback error',
        },
      });
    });
  }

  /**
   * Load audio blob for playback.
   */
  async load(audioBlob: Blob): Promise<Result<void, AudioPlayerError>> {
    try {
      this.status = 'loading';

      const audio = this.ensureAudioElement();

      // Clean up previous object URL
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      // Create object URL from blob
      this.currentObjectUrl = URL.createObjectURL(audioBlob);
      audio.src = this.currentObjectUrl;
      audio.playbackRate = this.speed;

      // Wait for audio to load
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          audio.removeEventListener('loadeddata', onLoaded);
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('loadeddata', onLoaded);
          audio.removeEventListener('error', onError);
          reject(new Error('Failed to load audio'));
        };
        audio.addEventListener('loadeddata', onLoaded);
        audio.addEventListener('error', onError);
      });

      this.status = 'paused';

      return Ok(undefined);
    } catch (error) {
      this.status = 'error';
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'INVALID_AUDIO', message });
    }
  }

  /**
   * Start or resume playback.
   */
  async play(): Promise<Result<void, AudioPlayerError>> {
    try {
      if (!this.audioElement) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: 'No audio loaded',
        });
      }

      await this.audioElement.play();
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Pause playback.
   */
  async pause(): Promise<Result<void, AudioPlayerError>> {
    try {
      if (!this.audioElement) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: 'No audio loaded',
        });
      }

      this.audioElement.pause();
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Stop playback and unload audio.
   */
  async stop(): Promise<Result<void, AudioPlayerError>> {
    try {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }

      // Clean up object URL
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      if (this.audioElement) {
        this.audioElement.src = '';
      }

      this.status = 'idle';

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Seek to position.
   */
  async seek(positionMs: number): Promise<Result<void, AudioPlayerError>> {
    try {
      if (!this.audioElement) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: 'No audio loaded',
        });
      }

      this.audioElement.currentTime = positionMs / 1000;
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Set playback speed.
   */
  async setSpeed(speed: number): Promise<Result<void, AudioPlayerError>> {
    try {
      // Clamp speed to valid range
      this.speed = Math.max(0.5, Math.min(2.0, speed));

      if (this.audioElement) {
        this.audioElement.playbackRate = this.speed;
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Get current playback position.
   */
  getPosition(): number {
    if (!this.audioElement) return 0;
    return this.audioElement.currentTime * 1000;
  }

  /**
   * Get audio duration.
   */
  getDuration(): number {
    if (!this.audioElement) return 0;
    return (this.audioElement.duration || 0) * 1000;
  }

  /**
   * Get current playback status.
   */
  getStatus(): PlaybackStatus {
    return this.status;
  }

  /**
   * Subscribe to playback events.
   */
  addEventListener(listener: PlaybackEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: PlaybackEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[DirectAudioAdapter] Listener error:', error);
      }
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.listeners.clear();

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.status = 'idle';
  }
}
