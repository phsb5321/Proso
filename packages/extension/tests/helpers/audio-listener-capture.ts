/**
 * Audio element listener capture for playback tests.
 *
 * Shadows `Audio.prototype.addEventListener` so a test can fire the element's
 * lifecycle events itself and replay Firefox's real dispatch order (a natural
 * clip end fires `pause` with `ended === true` *before* `ended`), plus
 * `play()` resolution and an instance-level `ended` override.
 *
 * @module tests/helpers/audio-listener-capture
 */

import { jest } from '@jest/globals';

export interface AudioListenerCapture {
  /** The element the service created, once playback has started. */
  readonly element: HTMLAudioElement | null;
  /** Dispatch the element's `pause` listener. */
  pause(): void;
  /** Dispatch the element's `ended` listener. */
  ended(): void;
  /** Dispatch the element's `error` listener. */
  error(): void;
  /** Shadow `ended` on the element; Firefox reports ended during the pre-`ended` pause. */
  setEnded(flag: boolean): void;
}

export function captureAudioElementListeners(): AudioListenerCapture {
  let element: HTMLAudioElement | null = null;
  let pauseListener: (() => void) | null = null;
  let endedListener: (() => void) | null = null;
  let errorListener: (() => void) | null = null;
  let endedFlag = false;

  const originalAddEventListener = Audio.prototype.addEventListener;
  jest.spyOn(Audio.prototype, 'addEventListener').mockImplementation(function (
    this: HTMLAudioElement,
    event: unknown,
    cb: unknown,
  ) {
    if (event === 'pause') pauseListener = cb as () => void;
    if (event === 'ended') endedListener = cb as () => void;
    if (event === 'error') errorListener = cb as () => void;
    element = this;
    return originalAddEventListener.call(this, event as string, cb as EventListener);
  });
  jest.spyOn(Audio.prototype, 'play').mockImplementation(() => Promise.resolve());

  return {
    get element() {
      return element;
    },
    pause: () => pauseListener?.call(element ?? undefined),
    ended: () => endedListener?.call(element ?? undefined),
    error: () => errorListener?.call(element ?? undefined),
    setEnded: (flag: boolean) => {
      endedFlag = flag;
      if (element) {
        Object.defineProperty(element, 'ended', {
          get: () => endedFlag,
          configurable: true,
        });
      }
    },
  };
}
