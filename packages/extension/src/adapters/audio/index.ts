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
export { AudioUrlAdapter } from './audio-url.adapter';

// Playback Adapters (IAudioPlayer)
export { OffscreenAudioAdapter } from './offscreen.adapter';
export { DirectAudioAdapter } from './direct.adapter';

// Worker-safe `Audio` shim (spec 106) — not a port implementer; installs a
// polyfill onto `globalThis.Audio` for Chrome MV3's DOM-less service worker.
export {
  OffscreenAudioElement,
  installOffscreenAudioElementShim,
} from './offscreen-audio-element.adapter';
