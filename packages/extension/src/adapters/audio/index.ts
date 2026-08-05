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
export {
  APPLIANCE_ERROR_CODES,
  APPLIANCE_MAX_TEXT_UTF8_BYTES,
  LocalApplianceAudioAdapter,
  deriveIdempotencyKey,
  parseWavDurationMs,
} from './local-appliance-audio.adapter';
export { NoOpAudioGeneratorAdapter } from './noop-audio-generator.adapter';
export { AudioUrlAdapter } from './audio-url.adapter';

// Playback Adapters (IAudioPlayer)
export { OffscreenAudioAdapter } from './offscreen.adapter';
export { DirectAudioAdapter } from './direct.adapter';
