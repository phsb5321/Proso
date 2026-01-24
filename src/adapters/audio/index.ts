/**
 * Audio Adapters
 *
 * Barrel export for all audio adapters.
 * IAudioGenerator adapters for TTS generation.
 * IAudioPlayer adapters for playback.
 *
 * @module adapters/audio
 * 049-tts-provider-consolidation: Removed OpenAIAudioAdapter
 */

// TTS Generator Adapters (IAudioGenerator)
export { ElevenLabsAudioAdapter } from './elevenlabs-audio.adapter';
export { BrowserAudioAdapter } from './browser-audio.adapter';
export { AudioUrlAdapter } from './audio-url.adapter';

// Playback Adapters (IAudioPlayer)
export { OffscreenAudioAdapter } from './offscreen.adapter';
export { DirectAudioAdapter } from './direct.adapter';
