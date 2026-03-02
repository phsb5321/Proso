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
export { BrowserTtsAudioAdapter } from './browser-tts-audio.adapter';
export { ServerTtsAudioAdapter } from './server-tts-audio.adapter';
export { AudioUrlAdapter } from './audio-url.adapter';

// Playback Adapters (IAudioPlayer)
export { OffscreenAudioAdapter } from './offscreen.adapter';
export { DirectAudioAdapter } from './direct.adapter';
