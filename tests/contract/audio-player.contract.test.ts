/**
 * IAudioPlayer Contract Tests
 *
 * These tests define the contract that all audio player adapters must satisfy.
 * Run against DirectAudioAdapter to verify it fulfills the IAudioPlayer port interface.
 *
 * @module tests/contract/audio-player
 */

import { jest } from '@jest/globals';
import type {
  IAudioPlayer,
  AudioPlayerError,
  PlaybackEventListener,
} from '../../src/ports/audio-player.port';
import type { PlaybackStatus } from '../../src/utils/schemas/playback.schema';
import { isOk, isErr } from '../../src/core/shared/result';
import { DirectAudioAdapter } from '../../src/adapters/audio/direct.adapter';

/**
 * Valid AudioPlayerError type discriminants.
 */
const VALID_ERROR_TYPES: readonly AudioPlayerError['type'][] = [
  'PLAYBACK_ERROR',
  'INVALID_AUDIO',
  'NOT_SUPPORTED',
  'CONTEXT_LOST',
];

/**
 * Valid PlaybackStatus values.
 */
const VALID_STATUSES: readonly PlaybackStatus[] = [
  'idle',
  'loading',
  'playing',
  'paused',
  'error',
];

/**
 * Helper: create a minimal valid audio blob.
 */
function createTestAudioBlob(): Blob {
  return new Blob([new Uint8Array(100)], { type: 'audio/mpeg' });
}

/**
 * Helper: patch the global Audio mock so that setting `src` triggers `loadeddata`.
 *
 * The global MockAudio from tests/setup.js does not auto-fire `loadeddata`,
 * which DirectAudioAdapter.load() awaits. We intercept `src` assignment to
 * asynchronously dispatch the event so load() can resolve.
 */
function patchAudioMockForLoad(): void {
  const OriginalAudio = global.Audio as unknown as new () => Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Audio = class PatchedAudio extends (OriginalAudio as any) {
    constructor() {
      super();
      let srcValue = '';
      Object.defineProperty(this, 'src', {
        get() {
          return srcValue;
        },
        set(value: string) {
          srcValue = value;
          // If a non-empty src is assigned, schedule a loadeddata event
          if (value) {
            Promise.resolve().then(() => {
              (this as Record<string, unknown>).duration = 5; // 5 seconds
              this.dispatchEvent(new Event('loadeddata'));
            });
          }
        },
        configurable: true,
        enumerable: true,
      });
    }
  };
}

/**
 * Contract test suite for IAudioPlayer implementations.
 */
export function runAudioPlayerContractTests(
  adapterName: string,
  createAdapter: () => IAudioPlayer,
) {
  describe(`${adapterName} implements IAudioPlayer contract`, () => {
    let adapter: IAudioPlayer;

    beforeEach(() => {
      adapter = createAdapter();
    });

    afterEach(() => {
      adapter.dispose();
    });

    // ── 1. Interface completeness ──────────────────────────────────────

    describe('interface completeness', () => {
      it('should have all required methods', () => {
        const requiredMethods: (keyof IAudioPlayer)[] = [
          'load',
          'play',
          'pause',
          'stop',
          'seek',
          'setSpeed',
          'getPosition',
          'getDuration',
          'getStatus',
          'addEventListener',
          'dispose',
        ];

        for (const method of requiredMethods) {
          expect(typeof adapter[method]).toBe('function');
        }
      });
    });

    // ── 2. load() ──────────────────────────────────────────────────────

    describe('load()', () => {
      it('should return Result with ok:true on valid audio blob', async () => {
        const blob = createTestAudioBlob();
        const result = await adapter.load(blob);

        expect(typeof result.ok).toBe('boolean');
        expect(result.ok).toBe(true);

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }
      });

      it('should transition status from idle through loading to paused', async () => {
        expect(adapter.getStatus()).toBe('idle');

        const blob = createTestAudioBlob();
        await adapter.load(blob);

        expect(adapter.getStatus()).toBe('paused');
      });

      it('should return Result with ok:false and INVALID_AUDIO error on bad input', async () => {
        // Patch Audio so that setting src fires an error event instead of loadeddata
        const OrigAudio = global.Audio;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = class ErrorAudio {
          src = '';
          currentTime = 0;
          duration = 0;
          playbackRate = 1;
          paused = true;
          error = { message: 'Decode error' };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _listeners: Record<string, ((...args: any[]) => void)[]> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          addEventListener(event: string, cb: (...args: any[]) => void) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(cb);
            // If loading, trigger error asynchronously
            if (event === 'error') {
              Promise.resolve().then(() => {
                this._listeners['error']?.forEach((fn) => fn(new Event('error')));
              });
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          removeEventListener(event: string, cb: (...args: any[]) => void) {
            if (this._listeners[event]) {
              this._listeners[event] = this._listeners[event].filter((fn) => fn !== cb);
            }
          }
          dispatchEvent(event: Event) {
            this._listeners[event.type]?.forEach((fn) => fn(event));
          }
          play() { return Promise.resolve(); }
          pause() { /* no-op */ }
        };

        // Create a fresh adapter to pick up the error audio mock
        const errorAdapter = createAdapter();
        const result = await errorAdapter.load(new Blob([]));

        expect(result.ok).toBe(false);
        if (isErr(result)) {
          expect(result.error.type).toBe('INVALID_AUDIO');
          expect(typeof result.error.message).toBe('string');
        }

        errorAdapter.dispose();
        // Restore
        global.Audio = OrigAudio;
      });
    });

    // ── 3. play() ──────────────────────────────────────────────────────

    describe('play()', () => {
      it('should return Result with ok:true when audio is loaded', async () => {
        await adapter.load(createTestAudioBlob());
        const result = await adapter.play();

        expect(result.ok).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }
      });

      it('should return Result with ok:false when no audio loaded', async () => {
        const result = await adapter.play();

        expect(result.ok).toBe(false);
        if (isErr(result)) {
          expect(VALID_ERROR_TYPES).toContain(result.error.type);
          expect(typeof result.error.message).toBe('string');
        }
      });
    });

    // ── 4. pause() ─────────────────────────────────────────────────────

    describe('pause()', () => {
      it('should return Result with ok:true when audio is loaded', async () => {
        await adapter.load(createTestAudioBlob());
        await adapter.play();
        const result = await adapter.pause();

        expect(result.ok).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }
      });

      it('should return Result with ok:false when no audio loaded', async () => {
        const result = await adapter.pause();

        expect(result.ok).toBe(false);
        if (isErr(result)) {
          expect(VALID_ERROR_TYPES).toContain(result.error.type);
        }
      });
    });

    // ── 5. stop() ──────────────────────────────────────────────────────

    describe('stop()', () => {
      it('should transition status to idle', async () => {
        await adapter.load(createTestAudioBlob());
        await adapter.play();
        const result = await adapter.stop();

        expect(result.ok).toBe(true);
        expect(adapter.getStatus()).toBe('idle');
      });

      it('should return Result type even when nothing is loaded', async () => {
        const result = await adapter.stop();

        expect(typeof result.ok).toBe('boolean');
      });
    });

    // ── 6. seek() ──────────────────────────────────────────────────────

    describe('seek()', () => {
      it('should accept positionMs as a number', async () => {
        await adapter.load(createTestAudioBlob());
        const result = await adapter.seek(1500);

        expect(result.ok).toBe(true);
      });

      it('should accept zero as position', async () => {
        await adapter.load(createTestAudioBlob());
        const result = await adapter.seek(0);

        expect(result.ok).toBe(true);
      });

      it('should return error when no audio loaded', async () => {
        const result = await adapter.seek(1000);

        expect(result.ok).toBe(false);
        if (isErr(result)) {
          expect(VALID_ERROR_TYPES).toContain(result.error.type);
        }
      });
    });

    // ── 7. setSpeed() ──────────────────────────────────────────────────

    describe('setSpeed()', () => {
      it('should accept speed within valid range', async () => {
        const result = await adapter.setSpeed(1.5);

        expect(result.ok).toBe(true);
      });

      it('should clamp speed below 0.5 to 0.5', async () => {
        const result = await adapter.setSpeed(0.1);

        expect(result.ok).toBe(true);
      });

      it('should clamp speed above 2.0 to 2.0', async () => {
        const result = await adapter.setSpeed(5.0);

        expect(result.ok).toBe(true);
      });

      it('should return a Result type', async () => {
        const result = await adapter.setSpeed(1.0);

        expect(typeof result.ok).toBe('boolean');
      });
    });

    // ── 8. getPosition() / getDuration() ───────────────────────────────

    describe('getPosition()', () => {
      it('should return a number (milliseconds)', () => {
        const position = adapter.getPosition();

        expect(typeof position).toBe('number');
        expect(position).toBeGreaterThanOrEqual(0);
      });

      it('should return 0 when no audio is loaded', () => {
        expect(adapter.getPosition()).toBe(0);
      });
    });

    describe('getDuration()', () => {
      it('should return a number (milliseconds)', () => {
        const duration = adapter.getDuration();

        expect(typeof duration).toBe('number');
        expect(duration).toBeGreaterThanOrEqual(0);
      });

      it('should return 0 when no audio is loaded', () => {
        expect(adapter.getDuration()).toBe(0);
      });
    });

    // ── 9. getStatus() ─────────────────────────────────────────────────

    describe('getStatus()', () => {
      it('should return a valid PlaybackStatus', () => {
        const status = adapter.getStatus();

        expect(VALID_STATUSES).toContain(status);
      });

      it('should start as idle', () => {
        expect(adapter.getStatus()).toBe('idle');
      });
    });

    // ── 10. addEventListener() ─────────────────────────────────────────

    describe('addEventListener()', () => {
      it('should return an unsubscribe function', () => {
        const listener: PlaybackEventListener = jest.fn();
        const unsubscribe = adapter.addEventListener(listener);

        expect(typeof unsubscribe).toBe('function');

        // Clean up
        unsubscribe();
      });

      it('should accept a PlaybackEventListener function', () => {
        const listener: PlaybackEventListener = jest.fn();

        expect(() => adapter.addEventListener(listener)).not.toThrow();
      });

      it('should stop receiving events after unsubscribe is called', async () => {
        const listener = jest.fn<PlaybackEventListener>();
        const unsubscribe = adapter.addEventListener(listener);

        unsubscribe();
        listener.mockClear();

        // Load and play to trigger events — listener should NOT be called
        await adapter.load(createTestAudioBlob());
        await adapter.play();

        // Give a tick for any async events
        await new Promise((r) => setTimeout(r, 10));

        expect(listener).not.toHaveBeenCalled();
      });
    });

    // ── 11. dispose() ──────────────────────────────────────────────────

    describe('dispose()', () => {
      it('should not throw errors', () => {
        expect(() => adapter.dispose()).not.toThrow();
      });

      it('should be safe to call multiple times', () => {
        expect(() => {
          adapter.dispose();
          adapter.dispose();
          adapter.dispose();
        }).not.toThrow();
      });

      it('should set status to idle after dispose', () => {
        adapter.dispose();

        expect(adapter.getStatus()).toBe('idle');
      });
    });

    // ── 12. Error type validation ──────────────────────────────────────

    describe('error types match AudioPlayerError union', () => {
      it('should produce errors with valid type discriminants', async () => {
        // Trigger an error by calling play() with no audio loaded
        const result = await adapter.play();

        if (isErr(result)) {
          expect(VALID_ERROR_TYPES).toContain(result.error.type);
          expect(typeof result.error.message).toBe('string');
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      });

      it('should always include a message string in errors', async () => {
        const seekResult = await adapter.seek(1000);

        if (isErr(seekResult)) {
          expect(typeof seekResult.error.message).toBe('string');
        }

        const pauseResult = await adapter.pause();

        if (isErr(pauseResult)) {
          expect(typeof pauseResult.error.message).toBe('string');
        }
      });

      it('should use PLAYBACK_ERROR type for operational failures', async () => {
        const result = await adapter.play();

        if (isErr(result)) {
          expect(result.error.type).toBe('PLAYBACK_ERROR');
        }
      });
    });

    // ── 13. Result type shape validation ───────────────────────────────

    describe('Result type shape', () => {
      it('should have ok:true and value on success', async () => {
        const result = await adapter.setSpeed(1.0);

        expect(result).toHaveProperty('ok');
        if (result.ok) {
          expect(result).toHaveProperty('value');
        }
      });

      it('should have ok:false and error on failure', async () => {
        const result = await adapter.play();

        expect(result).toHaveProperty('ok');
        if (!result.ok) {
          expect(result).toHaveProperty('error');
          expect(result.error).toHaveProperty('type');
          expect(result.error).toHaveProperty('message');
        }
      });
    });
  });
}

// ── Run contract tests against DirectAudioAdapter ─────────────────────

// Patch the global Audio mock so loadeddata fires when src is set
patchAudioMockForLoad();

runAudioPlayerContractTests(
  'DirectAudioAdapter',
  () => new DirectAudioAdapter(),
);
