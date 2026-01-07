/**
 * Audio Adapters
 *
 * Barrel export for all audio generator adapters.
 * Each adapter implements the IAudioGenerator port interface.
 *
 * @module adapters/audio
 */

// Adapters
export { OpenAIAudioAdapter } from './openai-audio.adapter';
export { ElevenLabsAudioAdapter } from './elevenlabs-audio.adapter';
export { GroqAudioAdapter } from './groq-audio.adapter';
export { CartesiaAudioAdapter } from './cartesia-audio.adapter';
export { BrowserAudioAdapter } from './browser-audio.adapter';
