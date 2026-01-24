/**
 * Audio Message Handlers
 *
 * Handlers for audio-related messages in the hexagonal architecture.
 * These handlers delegate to the IAudioGenerator port implementations.
 *
 * 049-tts-provider-consolidation: Added fallback logic (T029-T032)
 *
 * @module handlers/audio
 */

import { browser } from 'wxt/browser';
import { getContainer, isContainerInitialized, createAudioGeneratorAdapter } from '../composition';
import type { AudioError, ProviderId } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { AudioRequest, Voice, IAudioGenerator } from '../ports/audio-generator.port';
import type { HandlerRegistry } from './registry';
import { createAudioUrl } from '../utils/audio/audio-url';
import type { FallbackReason, FallbackOccurredNotification } from '../utils/messaging/schemas';

/**
 * Audio handler error type.
 */
export type AudioHandlerError =
  | { type: 'container_not_initialized'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string }
  | { type: 'fallback_used'; message: string; fallbackProvider: ProviderId };

// ========== Retry Configuration (049-tts-provider-consolidation: T030) ==========

/**
 * Retry configuration for exponential backoff with jitter.
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.2, // 20% jitter
} as const;

/**
 * Calculate delay for exponential backoff with jitter.
 * Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
  const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map AudioError to FallbackReason.
 * Maps internal error types to the fallback notification schema types.
 */
function mapErrorToFallbackReason(error: AudioError): FallbackReason {
  switch (error.type) {
    case 'rate_limit':
      return 'rate_limited';
    case 'network':
      return 'network_error';
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'provider_error':
    default:
      return 'api_error';
  }
}

/**
 * Check if an error is retryable.
 */
function isRetryableError(error: AudioError): boolean {
  return error.type === 'rate_limit' || error.type === 'network';
}

/**
 * Send fallback notification to all extension contexts.
 */
async function sendFallbackNotification(notification: FallbackOccurredNotification): Promise<void> {
  try {
    // Send to all tabs (content scripts)
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, notification).catch(() => {
          // Ignore errors for tabs without content script
        });
      }
    }

    // Also broadcast via runtime for popup/options
    browser.runtime.sendMessage(notification).catch(() => {
      // Ignore if no listeners
    });

    console.log('[AudioHandlers] Fallback notification sent:', notification);
  } catch (error) {
    console.warn('[AudioHandlers] Failed to send fallback notification:', error);
  }
}

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
    case 'provider_error':
      return error.message;
    case 'network':
      return `Network error: ${error.message}`;
    case 'invalid_credentials':
      return `Invalid credentials${error.provider ? ` for ${error.provider}` : ''}`;
    case 'rate_limit':
      return `Rate limited. Retry after ${error.retryAfterMs}ms`;
    case 'unsupported_language':
      return `Language ${error.language} not supported${error.provider ? ` by ${error.provider}` : ''}`;
    case 'audio_decode_error':
      return `Audio decode error: ${error.message}`;
    case 'text_too_long':
      return `Text too long. Maximum length is ${error.maxLength} characters`;
    default:
      return 'Unknown audio error';
  }
}

/**
 * Get actionable error message for user display (T032).
 * Provides user-friendly messages with suggested actions.
 */
function getActionableErrorMessage(error: AudioError): string {
  switch (error.type) {
    case 'provider_error':
      return `TTS service error: ${error.message}. Try again or switch to Browser TTS.`;
    case 'network':
      return 'Network connection failed. Check your internet connection and try again.';
    case 'invalid_credentials':
      return `Invalid API key${error.provider ? ` for ${error.provider}` : ''}. Please check your API key in Settings.`;
    case 'rate_limit':
      return 'Rate limit reached. Please wait a moment and try again, or switch to Browser TTS.';
    case 'unsupported_language':
      return `${error.provider || 'Provider'} doesn't support this language. Try Browser TTS for wider language support.`;
    case 'audio_decode_error':
      return 'Audio processing error. Try again with a different section.';
    case 'text_too_long':
      return `Text is too long (max ${error.maxLength} characters). Try selecting a shorter section.`;
    default:
      return 'Audio generation failed. Please try again or switch providers.';
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
   * Generate audio from text with fallback support.
   * Returns a URL to the audio blob.
   *
   * 049-tts-provider-consolidation (T029, T030, T032):
   * - Implements retry logic with exponential backoff for rate-limited requests
   * - Falls back to Browser TTS if ElevenLabs fails after max retries
   * - Sends notification when fallback occurs
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
        const audioGenerator: IAudioGenerator = container.adapters.audioGenerator;
        const primaryProviderId = audioGenerator.providerId;

        let lastError: AudioError | null = null;
        let attempt = 0;

        // Retry loop with exponential backoff (T030)
        while (attempt <= RETRY_CONFIG.maxRetries) {
          const result = await audioGenerator.generateAudio(params);

          if (result.ok) {
            // Success - convert blob to URL
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
          }

          // Store the error for potential fallback
          lastError = result.error;

          // Check if error is retryable
          if (!isRetryableError(result.error) || attempt >= RETRY_CONFIG.maxRetries) {
            break;
          }

          // Calculate backoff delay
          const delay =
            result.error.type === 'rate_limit' && result.error.retryAfterMs
              ? result.error.retryAfterMs
              : calculateBackoffDelay(attempt);

          console.log(
            `[AudioHandlers] Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms`,
          );
          await sleep(delay);
          attempt++;
        }

        // All retries failed - try fallback to Browser TTS (T029)
        if (lastError && primaryProviderId === 'elevenlabs') {
          console.log(`[AudioHandlers] ${primaryProviderId} failed, falling back to Browser TTS`);

          // Create Browser TTS adapter for fallback
          const fallbackGenerator = createAudioGeneratorAdapter('browser', null);

          const fallbackResult = await fallbackGenerator.generateAudio({
            ...params,
            // Browser TTS doesn't support word timings
          });

          if (fallbackResult.ok) {
            // Send fallback notification (T031)
            const notification: FallbackOccurredNotification = {
              type: 'FALLBACK_OCCURRED',
              fromProvider: primaryProviderId,
              toProvider: 'browser',
              reason: mapErrorToFallbackReason(lastError),
              message: getAudioErrorMessage(lastError),
              retryable: isRetryableError(lastError),
              retryAfterMs: lastError.type === 'rate_limit' ? lastError.retryAfterMs : undefined,
            };
            await sendFallbackNotification(notification);

            // Convert blob to URL
            const audioUrl = await createAudioUrl(fallbackResult.value.audioBlob);

            return Ok({
              audioUrl,
              durationMs: fallbackResult.value.durationMs,
              wordTimings: null, // Browser TTS doesn't support word timings
            });
          }

          // Both primary and fallback failed
          return Err({
            type: 'operation_failed',
            message: `Primary provider failed: ${getAudioErrorMessage(lastError)}. Fallback also failed: ${getAudioErrorMessage(fallbackResult.error)}`,
          });
        }

        // Non-ElevenLabs provider failed or no fallback available (T032)
        return Err({
          type: 'operation_failed',
          message: lastError ? getActionableErrorMessage(lastError) : 'Audio generation failed',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Generate audio from text',
  );
}
