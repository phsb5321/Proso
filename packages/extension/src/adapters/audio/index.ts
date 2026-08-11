/**
 * Audio Adapters
 *
 * Barrel export for all audio adapters.
 * IAudioGenerator adapters for TTS generation.
 * IAudioPlayer adapters for playback.
 *
 * @module adapters/audio
 */

// TTS Generator Adapters (IAudioGenerator)
export { ServerTtsAudioAdapter } from './server-tts-audio.adapter';
export { NoOpAudioGeneratorAdapter } from './noop-audio-generator.adapter';
export { FallbackAudioAdapter } from './fallback-audio.adapter';
export type { FallbackGateResult } from './fallback-audio.adapter';
export { LocalHostAudioAdapter } from './local-host-audio.adapter';
export { parseWavDurationMs, APPLIANCE_MAX_TEXT_UTF8_BYTES } from './local-host-audio.adapter';
export { AudioUrlAdapter } from './audio-url.adapter';

// Playback Adapters (IAudioPlayer)

// Worker-safe `Audio` shim (spec 106) — not a port implementer; installs a
// polyfill onto `globalThis.Audio` for Chrome MV3's DOM-less service worker.
export {
  OffscreenAudioElement,
  installOffscreenAudioElementShim,
} from './offscreen-audio-element.adapter';
