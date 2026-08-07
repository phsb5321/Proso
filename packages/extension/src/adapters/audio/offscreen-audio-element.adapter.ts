// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Offscreen Audio Element — worker-safe `Audio` shim (spec 106 verdict)
 *
 * Chrome MV3 service workers have no DOM, so `Audio` is undefined there and
 * `PlaybackService`'s `new Audio()` throws at the first playback attempt
 * (spec 106 C1/C2). This class proxies the exact HTMLMediaElement surface
 * PlaybackService drives — `src`, `play`, `pause`, `currentTime`, `duration`,
 * `paused`, `playbackRate`, and the `timeupdate`/`ended`/`error` events — to
 * the shipped offscreen document (`entrypoints/offscreen.html` +
 * `entrypoints/offscreen/main.ts`'s `LOAD_AUDIO`/`PLAY`/`PAUSE`/`SEEK`/
 * `SET_SPEED`/`OFFSCREEN_EVENT` protocol), which has a real DOM and a real
 * `<audio>` element. `installOffscreenAudioElementShim()` only installs when
 * `Audio` doesn't already exist, so Firefox MV2's background page (which has
 * a native `Audio`) is untouched.
 *
 * This class deliberately mimics `HTMLMediaElement`'s throw/reject contract
 * rather than the repo's `Result<T, E>` pattern: it stands in for a native
 * browser API that `PlaybackService` (unchanged by this file) already drives
 * with try/catch, not for one of our own ports.
 *
 * @module adapters/audio/offscreen-audio-element.adapter
 */

interface OffscreenLoadResponse {
  success: boolean;
  error?: string;
  duration?: number;
}

interface OffscreenAckResponse {
  success: boolean;
  error?: string;
}

/**
 * Decode a `data:<mimeType>;base64,<data>` URL into raw bytes.
 *
 * `AudioUrlAdapter`/`createAudioUrl()` always produces a data: URL in this
 * context: `URL.createObjectURL` is unavailable in the MV3 worker, so the
 * blob-URL branch never runs there (a blob URL would be scoped to the worker
 * anyway and unresolvable from the offscreen document's own context).
 */
function decodeDataUrl(dataUrl: string): { buffer: ArrayBuffer; mimeType: string } {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) {
    throw new Error(
      'OffscreenAudioElement only accepts data: URLs (the worker context has no ' +
        'URL.createObjectURL, so AudioUrlAdapter always produces one there)',
    );
  }
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { buffer: bytes.buffer, mimeType };
}

/**
 * A worker-safe stand-in for `HTMLAudioElement`, proxying playback to the
 * Chrome MV3 offscreen document.
 *
 * Extends `EventTarget` (a standard worker global) so
 * `addEventListener('timeupdate' | 'ended' | 'error', cb)` — the only three
 * events `PlaybackService` listens for, all with zero-argument callbacks —
 * works exactly as it does against a real `<audio>` element.
 */
export class OffscreenAudioElement extends EventTarget {
  private _src = '';
  private _currentTimeMs = 0;
  private _durationMs = 0;
  private _paused = true;
  private _playbackRate = 1;
  private _offscreenReady: Promise<void> | null = null;
  private _pendingLoad: Promise<void> = Promise.resolve();

  constructor() {
    super();
    if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime?.onMessage) {
      globalThis.chrome.runtime.onMessage.addListener((message: unknown) => {
        const msg = message as Record<string, unknown>;
        if (msg.type === 'OFFSCREEN_EVENT') {
          this.handleOffscreenEvent(
            msg.eventType as string,
            (msg.data ?? {}) as Record<string, unknown>,
          );
        }
        return undefined;
      });
    }
  }

  get src(): string {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    this._durationMs = 0;
    this._currentTimeMs = 0;
    if (!value) {
      this._pendingLoad = Promise.resolve();
      return;
    }
    this._pendingLoad = this.loadFromDataUrl(value);
    // Native <audio> never rejects synchronously on assigning `.src`; a bad
    // source surfaces as an `error` event (dispatched in loadFromDataUrl),
    // and `play()` re-observes the same rejection by awaiting this promise.
    this._pendingLoad.catch(() => {});
  }

  get currentTime(): number {
    return this._currentTimeMs / 1000;
  }

  set currentTime(seconds: number) {
    this._currentTimeMs = Math.max(0, seconds) * 1000;
    this.sendToOffscreen({ type: 'SEEK', data: { positionMs: this._currentTimeMs } }).catch(() => {
      // Native seeking never throws synchronously either; a failure surfaces
      // via the next `error` event.
    });
  }

  get duration(): number {
    return this._durationMs > 0 ? this._durationMs / 1000 : Number.NaN;
  }

  get paused(): boolean {
    return this._paused;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(rate: number) {
    this._playbackRate = rate;
    this.sendToOffscreen({ type: 'SET_SPEED', data: { speed: rate } }).catch(() => {
      // Best-effort, matching the synchronous native property write.
    });
  }

  async play(): Promise<void> {
    await this._pendingLoad;
    const response = (await this.sendToOffscreen({ type: 'PLAY' })) as OffscreenAckResponse;
    if (!response.success) {
      throw new Error(response.error || 'Failed to play');
    }
    this._paused = false;
  }

  pause(): void {
    this._paused = true;
    this.sendToOffscreen({ type: 'PAUSE' }).catch(() => {
      // Native pause() never throws; a failure surfaces via the next event.
    });
  }

  private async loadFromDataUrl(dataUrl: string): Promise<void> {
    let decoded: { buffer: ArrayBuffer; mimeType: string };
    try {
      decoded = decodeDataUrl(dataUrl);
    } catch (error) {
      this.dispatchEvent(new Event('error'));
      throw error;
    }
    const response = (await this.sendToOffscreen({
      type: 'LOAD_AUDIO',
      data: { audioData: Array.from(new Uint8Array(decoded.buffer)), mimeType: decoded.mimeType },
    })) as OffscreenLoadResponse;
    if (!response.success) {
      this.dispatchEvent(new Event('error'));
      throw new Error(response.error || 'Failed to load audio');
    }
    this._durationMs = response.duration || 0;
  }

  private handleOffscreenEvent(eventType: string, data: Record<string, unknown>): void {
    switch (eventType) {
      case 'playing':
        this._paused = false;
        break;
      case 'paused':
        this._paused = true;
        break;
      case 'ended':
        this._paused = true;
        this.dispatchEvent(new Event('ended'));
        break;
      case 'timeupdate':
        this._currentTimeMs = (data.positionMs as number) || this._currentTimeMs;
        this.dispatchEvent(new Event('timeupdate'));
        break;
      case 'error':
        this.dispatchEvent(new Event('error'));
        break;
      case 'loaded':
        this._durationMs = (data.durationMs as number) || this._durationMs;
        break;
      default:
        break;
    }
  }

  /** Create the offscreen document once, tolerating a concurrent creation. */
  private ensureOffscreenDocument(): Promise<void> {
    if (!this._offscreenReady) {
      this._offscreenReady = (async () => {
        if (typeof globalThis.chrome === 'undefined' || !globalThis.chrome.offscreen) {
          throw new Error(
            'chrome.offscreen is unavailable — the "offscreen" manifest permission is missing',
          );
        }
        const existing = await globalThis.chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        });
        if (existing.length > 0) return;
        try {
          await globalThis.chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
            justification: 'TTS audio playback (Chrome MV3 service workers have no DOM)',
          });
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('already exists')) {
            throw error;
          }
        }
      })();
    }
    return this._offscreenReady;
  }

  private async sendToOffscreen(message: Record<string, unknown>): Promise<unknown> {
    await this.ensureOffscreenDocument();
    return new Promise((resolve, reject) => {
      globalThis.chrome.runtime.sendMessage(message, (response: unknown) => {
        if (globalThis.chrome.runtime.lastError) {
          reject(new Error(globalThis.chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

/**
 * Install the shim on `globalThis.Audio` when the platform doesn't already
 * have one (Chrome MV3's service worker). Never fires on Firefox MV2's event
 * page, which has a real DOM and a real `Audio` — the Firefox path is
 * untouched by construction.
 */
export function installOffscreenAudioElementShim(): void {
  if (typeof Audio === 'undefined') {
    (globalThis as { Audio: unknown }).Audio = OffscreenAudioElement;
  }
}
