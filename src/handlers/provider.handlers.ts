/**
 * Provider Message Handlers
 *
 * Handlers for TTS provider-related messages in the hexagonal architecture.
 * Manages provider selection, listing, and language support.
 *
 * @module handlers/provider
 */

import { browser } from 'wxt/browser';
import {
  getContainer,
  isContainerInitialized,
  reconfigureAudioGenerator,
} from '../composition';
import type { ProviderId } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { HandlerRegistry } from './registry';

/**
 * Provider handler error type.
 */
export type ProviderHandlerError =
  | { type: 'container_not_initialized'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Provider info type.
 */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  supportsWordTiming: boolean;
  requiresApiKey: boolean;
  supportedLanguages: readonly string[];
}

/**
 * Response type for getList.
 */
export interface ProviderListResponse {
  providers: ProviderInfo[];
  currentProvider: ProviderId;
}

/**
 * Response type for select.
 */
export interface ProviderSelectResponse {
  success: boolean;
  provider: ProviderId;
}

/**
 * Response type for validateLanguage.
 */
export interface LanguageValidationResponse {
  supported: boolean;
  provider: ProviderId;
  language: string;
  suggestedProviders?: ProviderId[];
}

/**
 * Static provider metadata.
 * Matches existing VoxPage providers.
 */
const PROVIDER_METADATA: Record<ProviderId, Omit<ProviderInfo, 'id'>> = {
  openai: {
    name: 'OpenAI TTS',
    description: 'High-quality voices with fast generation',
    supportsWordTiming: false,
    requiresApiKey: true,
    supportedLanguages: [], // Supports all languages
  },
  elevenlabs: {
    name: 'ElevenLabs',
    description: 'Ultra-realistic voices with word-level timing',
    supportsWordTiming: true,
    requiresApiKey: true,
    supportedLanguages: [], // Supports many languages
  },
  groq: {
    name: 'Groq',
    description: 'Fast inference with Whisper timing',
    supportsWordTiming: true, // Via Whisper
    requiresApiKey: true,
    supportedLanguages: ['en'], // English only
  },
  cartesia: {
    name: 'Cartesia',
    description: 'Low-latency streaming audio',
    supportsWordTiming: false,
    requiresApiKey: true,
    supportedLanguages: ['en'], // English only
  },
  browser: {
    name: 'Browser TTS',
    description: 'Free built-in speech synthesis',
    supportsWordTiming: false,
    requiresApiKey: false,
    supportedLanguages: [], // Depends on system
  },
};

/**
 * Providers that support all languages (empty array means all).
 */
const MULTILINGUAL_PROVIDERS: ProviderId[] = ['openai', 'elevenlabs', 'browser'];

/**
 * Register provider message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerProviderHandlers(registry: HandlerRegistry): void {
  /**
   * Get list of available providers.
   */
  registry.register<void, Result<ProviderListResponse, ProviderHandlerError>>(
    'provider.getList',
    async () => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      try {
        const container = getContainer();
        const currentProvider = container.config.provider;

        const providers: ProviderInfo[] = Object.entries(PROVIDER_METADATA).map(
          ([id, metadata]) => ({
            id: id as ProviderId,
            ...metadata,
          }),
        );

        return Ok({
          providers,
          currentProvider,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get list of TTS providers',
  );

  /**
   * Select a TTS provider.
   * This reconfigures the audio generator in the container.
   */
  registry.register<{ provider: ProviderId }, Result<ProviderSelectResponse, ProviderHandlerError>>(
    'provider.select',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      const validProviders: ProviderId[] = ['openai', 'elevenlabs', 'groq', 'cartesia', 'browser'];
      if (!params.provider || !validProviders.includes(params.provider)) {
        return Err({
          type: 'invalid_params',
          message: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
        });
      }

      try {
        // Get API key for the new provider
        const keyName = `${params.provider}ApiKey`;
        const stored = await browser.storage.local.get([keyName]);
        const apiKey = (stored[keyName] as string) || null;

        // Reconfigure the container with new provider
        reconfigureAudioGenerator(params.provider, apiKey);

        // Save to storage
        await browser.storage.local.set({ provider: params.provider });

        return Ok({
          success: true,
          provider: params.provider,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Select TTS provider',
  );

  /**
   * Validate if a language is supported by the current provider.
   */
  registry.register<
    { language: string; provider?: ProviderId },
    Result<LanguageValidationResponse, ProviderHandlerError>
  >(
    'provider.validateLanguage',
    async (params) => {
      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      if (!params.language || typeof params.language !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'language is required and must be a string (BCP-47 code)',
        });
      }

      try {
        const container = getContainer();
        const providerId = params.provider || container.config.provider;
        const metadata = PROVIDER_METADATA[providerId];

        if (!metadata) {
          return Err({
            type: 'invalid_params',
            message: `Unknown provider: ${providerId}`,
          });
        }

        // Empty supportedLanguages means all languages are supported
        const supported =
          metadata.supportedLanguages.length === 0 ||
          metadata.supportedLanguages.includes(params.language) ||
          metadata.supportedLanguages.some((lang) =>
            params.language.toLowerCase().startsWith(lang.toLowerCase()),
          );

        // Find providers that support this language
        const suggestedProviders: ProviderId[] = [];
        if (!supported) {
          for (const [id, meta] of Object.entries(PROVIDER_METADATA)) {
            const supportsLang =
              meta.supportedLanguages.length === 0 ||
              meta.supportedLanguages.includes(params.language) ||
              meta.supportedLanguages.some((lang) =>
                params.language.toLowerCase().startsWith(lang.toLowerCase()),
              );
            if (supportsLang) {
              suggestedProviders.push(id as ProviderId);
            }
          }
        }

        return Ok({
          supported,
          provider: providerId,
          language: params.language,
          suggestedProviders: suggestedProviders.length > 0 ? suggestedProviders : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Validate language support for provider',
  );
}
