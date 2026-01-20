// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Offscreen Audio Adapter
 *
 * Implements IAudioPlayer port for Chrome MV3 using the offscreen document.
 * Service workers cannot play audio directly, so we delegate to offscreen.html.
 *
 * @module adapters/audio/offscreen.adapter
 */

import type { Result } from '../../core/shared/result';
import { Ok, Err } from '../../core/shared/result';
import type {
  IAudioPlayer,
  AudioPlayerError,
  PlaybackEvent,
  PlaybackEventListener,
} from '../../ports/audio-player.port';
import type { PlaybackStatus } from '../../utils/schemas/playback.schema';

/**
 * Response from offscreen document
 */
interface OffscreenResponse {
  success: boolean;
  error?: string;
  duration?: number;
  speed?: number;
  state?: {
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    speed: number;
  };
}

/**
 * OffscreenAudioAdapter
 *
 * Manages audio playback via Chrome's offscreen document API.
 * Used only in Chrome MV3 where service workers can't play audio.
 */
export class OffscreenAudioAdapter implements IAudioPlayer {
  private listeners: Set<PlaybackEventListener> = new Set();
  private status: PlaybackStatus = 'idle';
  private positionMs = 0;
  private durationMs = 0;
  private speed = 1.0;
  private offscreenCreated = false;

  constructor() {
    // Listen for events from offscreen document
    this.setupEventListener();
  }

  /**
   * Set up listener for events from offscreen document
   */
  private setupEventListener(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
        if (message.type === 'OFFSCREEN_EVENT') {
          this.handleOffscreenEvent(message.eventType, message.data);
        }
      });
    }
  }

  /**
   * Handle events from offscreen document
   */
  private handleOffscreenEvent(eventType: string, data: Record<string, unknown>): void {
    switch (eventType) {
      case 'playing':
        this.status = 'playing';
        this.positionMs = (data.positionMs as number) || 0;
        this.notifyListeners({ type: 'playing', positionMs: this.positionMs });
        break;

      case 'paused':
        this.status = 'paused';
        this.positionMs = (data.positionMs as number) || 0;
        this.notifyListeners({ type: 'paused', positionMs: this.positionMs });
        break;

      case 'ended':
        this.status = 'idle';
        this.notifyListeners({ type: 'ended' });
        break;

      case 'timeupdate':
        this.positionMs = (data.positionMs as number) || 0;
        this.notifyListeners({ type: 'timeupdate', positionMs: this.positionMs });
        break;

      case 'error':
        this.status = 'error';
        this.notifyListeners({
          type: 'error',
          error: {
            type: 'PLAYBACK_ERROR',
            message: (data.message as string) || 'Unknown error',
          },
        });
        break;

      case 'loaded':
        this.durationMs = (data.durationMs as number) || 0;
        break;
    }
  }

  /**
   * Ensure offscreen document exists
   */
  private async ensureOffscreen(): Promise<void> {
    if (this.offscreenCreated) return;

    if (typeof chrome === 'undefined' || !chrome.offscreen) {
      throw new Error('Chrome offscreen API not available');
    }

    try {
      // Check if offscreen document already exists
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      });

      if (contexts.length === 0) {
        // Create offscreen document
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
          justification: 'TTS audio playback',
        });
      }

      this.offscreenCreated = true;
    } catch (error) {
      // Document may already exist
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        throw error;
      }
      this.offscreenCreated = true;
    }
  }

  /**
   * Send message to offscreen document
   */
  private async sendToOffscreen(
    message: Record<string, unknown>,
  ): Promise<OffscreenResponse> {
    await this.ensureOffscreen();

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: OffscreenResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Load audio blob for playback.
   */
  async load(audioBlob: Blob): Promise<Result<void, AudioPlayerError>> {
    try {
      this.status = 'loading';

      // Convert blob to array buffer for transfer
      const arrayBuffer = await audioBlob.arrayBuffer();

      const response = await this.sendToOffscreen({
        type: 'LOAD_AUDIO',
        data: {
          audioData: Array.from(new Uint8Array(arrayBuffer)),
          mimeType: audioBlob.type,
        },
      });

      if (!response.success) {
        this.status = 'error';
        return Err({
          type: 'INVALID_AUDIO',
          message: response.error || 'Failed to load audio',
        });
      }

      this.durationMs = response.duration || 0;
      this.status = 'paused';

      return Ok(undefined);
    } catch (error) {
      this.status = 'error';
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err({ type: 'PLAYBACK_ERROR', message });
    }
  }

  /**
   * Start or resume playback.
   */
  async play(): Promise<Result<void, AudioPlayerError>> {
    try {
      const response = await this.sendToOffscreen({ type: 'PLAY' });

      if (!response.success) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: response.error || 'Failed to play',
        });
      }

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
      const response = await this.sendToOffscreen({ type: 'PAUSE' });

      if (!response.success) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: response.error || 'Failed to pause',
        });
      }

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
      const response = await this.sendToOffscreen({ type: 'STOP' });

      if (!response.success) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: response.error || 'Failed to stop',
        });
      }

      this.status = 'idle';
      this.positionMs = 0;

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
      const response = await this.sendToOffscreen({
        type: 'SEEK',
        data: { positionMs },
      });

      if (!response.success) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: response.error || 'Failed to seek',
        });
      }

      this.positionMs = positionMs;

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
      const response = await this.sendToOffscreen({
        type: 'SET_SPEED',
        data: { speed },
      });

      if (!response.success) {
        return Err({
          type: 'PLAYBACK_ERROR',
          message: response.error || 'Failed to set speed',
        });
      }

      this.speed = response.speed || speed;

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
    return this.positionMs;
  }

  /**
   * Get audio duration.
   */
  getDuration(): number {
    return this.durationMs;
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
        console.error('[OffscreenAudioAdapter] Listener error:', error);
      }
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.listeners.clear();

    // Close offscreen document if we created it
    if (this.offscreenCreated && typeof chrome !== 'undefined' && chrome.offscreen) {
      chrome.offscreen.closeDocument().catch(() => {
        // Ignore errors during cleanup
      });
      this.offscreenCreated = false;
    }
  }
}
