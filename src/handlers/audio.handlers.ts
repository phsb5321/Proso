/**
 * Audio Message Handlers
 *
 * Handlers for audio-related messages in the hexagonal architecture.
 * These handlers delegate to the IAudioGenerator port implementations.
 *
 * @module handlers/audio
 */

import { getContainer, isContainerInitialized } from '../composition';
import type { AudioError, ProviderId } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { AudioRequest, Voice } from '../ports/audio-generator.port';
import { createAudioUrl } from '../utils/audio/audio-url';
import type { HandlerRegistry } from './registry';

/**
 * Audio handler error type.
 */
export type AudioHandlerError =
  | { type: 'container_not_initialized'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response type for getVoices.
 */
export interface VoicesResponse {
  voices: Voice[];
}

/**
 * Response type for setVoice.
 */
export interface SetVoiceResponse {
  success: boolean;
}

/**
 * Response type for validateCredentials.
 */
export interface ValidateCredentialsResponse {
  valid: boolean;
  message?: string;
}

/**
 * Response type for generate audio.
 */
export interface GenerateAudioResponse {
  audioUrl: string;
  durationMs: number;
  wordTimings: Array<{ word: string; startMs: number; endMs: number }> | null;
}

/**
 * Get error message from AudioError.
 */
function getAudioErrorMessage(error: AudioError): string {
  switch (error.type) {
    case 'network':
      return `Network error: ${error.message}`;
    case 'rate_limit':
      return `Rate limited. Retry after ${error.retryAfterMs}ms`;
    case 'invalid_credentials':
      return 'Invalid credentials';
    case 'unsupported_language':
      return `Language ${error.language} not supported`;
    case 'text_too_long':
      return `Text too long (max ${error.maxLength} characters)`;
    case 'provider_error':
      return `Provider error [${error.code}]: ${error.message}`;
    default:
      return 'Unknown audio error';
  }
}

/**
 * Register audio message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerAudioHandlers(registry: HandlerRegistry): void {
  /**
   * Get available voices for a language.
   */
  registry.register<{ language?: string }, Result<VoicesResponse, AudioHandlerError>>(
    'audio.getVoices',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      try {
        const container = getContainer();
        const audioGenerator = container.adapters.audioGenerator;

        const result = await audioGenerator.getVoices(params.language);

        if (!result.ok) {
          return Ok({ voices: [] }); // Return empty on error for backwards compatibility
        }

        return Ok({ voices: result.value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get available voices',
  );

  /**
   * Set the current voice.
   * This updates the voice setting in storage.
   */
  registry.register<{ voiceId: string }, Result<SetVoiceResponse, AudioHandlerError>>(
    'audio.setVoice',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      if (!params.voiceId || typeof params.voiceId !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'voiceId is required and must be a string',
        });
      }

      try {
        const container = getContainer();
        const settingsStore = container.adapters.settingsStore;

        await settingsStore.updateSettings({ voice: params.voiceId });

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Set voice for TTS',
  );

  /**
   * Validate API credentials for the current provider.
   */
  registry.register<
    { provider?: ProviderId },
    Result<ValidateCredentialsResponse, AudioHandlerError>
  >(
    'audio.validateCredentials',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      try {
        const container = getContainer();

        // If provider specified and different from current, we need to check that provider
        // For now, we validate the current container's audio generator
        const audioGenerator = container.adapters.audioGenerator;

        // Browser TTS doesn't need credentials
        if (audioGenerator.providerId === 'browser') {
          return Ok({ valid: true, message: 'Browser TTS does not require API key' });
        }

        const valid = await audioGenerator.validateCredentials();

        return Ok({
          valid,
          message: valid ? 'API key is valid' : 'API key validation failed',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Ok({ valid: false, message }); // Return as response, not error
      }
    },
    'Validate API credentials',
  );

  /**
   * Generate audio from text.
   * Returns a URL to the audio blob.
   */
  registry.register<AudioRequest, Result<GenerateAudioResponse, AudioHandlerError>>(
    'audio.generate',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      if (!params.text || typeof params.text !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'text is required and must be a string',
        });
      }

      try {
        const container = getContainer();
        const audioGenerator = container.adapters.audioGenerator;

        const result = await audioGenerator.generateAudio(params);

        if (!result.ok) {
          return Err({
            type: 'operation_failed',
            message: getAudioErrorMessage(result.error),
          });
        }

        // Convert blob to URL (uses data URL in service worker, blob URL in DOM)
        const audioUrl = await createAudioUrl(result.value.audioBlob);

        return Ok({
          audioUrl,
          durationMs: result.value.durationMs,
          wordTimings: result.value.wordTimings
            ? result.value.wordTimings.map((wt) => ({
                word: wt.word,
                startMs: wt.startMs,
                endMs: wt.endMs,
              }))
            : null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Generate audio from text',
  );
}
