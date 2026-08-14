/**
 * Provider Message Handlers
 *
 * Handlers for TTS provider-related messages in the hexagonal architecture.
 * Manages provider selection, listing, and language support.
 *
 * @module handlers/provider
 */

import { browser } from 'wxt/browser';
import { getContainer, isContainerInitialized, reconfigureAudioGenerator } from '../composition';
import type { ProviderId } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { HandlerRegistry } from './registry';
import {
  providerSelectParamsSchema,
  providerValidateLanguageParamsSchema,
} from './schemas/provider.schemas';

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

interface ProviderSelectParams {
  readonly provider: ProviderId;
  /** A candidate already validated by onboarding; adopted atomically with selection. */
  readonly validatedApiKey?: string;
}

const PROVIDER_KEY_NAME: Partial<Record<ProviderId, string>> = {
  elevenlabs: 'elevenlabsApiKey',
  openai: 'openaiApiKey',
  groq: 'groqApiKey',
  cartesia: 'cartesiaApiKey',
};

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
 * Matches existing Proso providers.
 */
const PROVIDER_METADATA: Record<ProviderId, Omit<ProviderInfo, 'id'>> = {
  elevenlabs: {
    name: 'ElevenLabs',
    description: 'Ultra-realistic voices with word-level timing',
    supportsWordTiming: true,
    requiresApiKey: true,
    supportedLanguages: [],
  },
  openai: {
    name: 'OpenAI TTS',
    description: 'High-quality voices with gpt-4o-mini-tts model',
    supportsWordTiming: false,
    requiresApiKey: true,
    supportedLanguages: [],
  },
  groq: {
    name: 'Groq',
    description: 'Fast inference TTS (English only)',
    supportsWordTiming: false,
    requiresApiKey: true,
    supportedLanguages: ['en'],
  },
  cartesia: {
    name: 'Cartesia',
    description: 'Low-latency voice synthesis (English only)',
    supportsWordTiming: false,
    requiresApiKey: true,
    supportedLanguages: ['en'],
  },
  local: {
    name: 'Local synthesis host',
    description: 'A reader-operated TTS host on your own network (no account, no key)',
    supportsWordTiming: false,
    requiresApiKey: false,
    supportedLanguages: ['pt-BR', 'en-US'],
  },
};

/**
 * Providers that support all languages (empty array means all).
 */
const _MULTILINGUAL_PROVIDERS: ProviderId[] = ['elevenlabs', 'openai'];

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
  registry.register<ProviderSelectParams, Result<ProviderSelectResponse, ProviderHandlerError>>(
    'provider.select',
    async (params) => {
      const parsed = providerSelectParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: 'Invalid provider. Must be one of: elevenlabs, openai, groq, cartesia, local',
        });
      }

      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      try {
        const provider = parsed.data.provider;
        const candidate = params.validatedApiKey?.trim();
        const keyName = PROVIDER_KEY_NAME[provider];
        if (params.validatedApiKey !== undefined && (!keyName || !candidate)) {
          return Err({
            type: 'invalid_params',
            message: 'A validated API key is supported only for keyed providers.',
          });
        }

        const previousContainer = getContainer();
        const previousProvider = previousContainer.config.provider;
        const previousVoice = previousContainer.services.playback.getState().voice;
        const previousKeyName = PROVIDER_KEY_NAME[previousProvider];
        const keyNames = [
          ...new Set([keyName, previousKeyName].filter((key) => key !== undefined)),
        ];
        const stored = keyNames.length > 0 ? await browser.storage.local.get(keyNames) : {};
        const apiKey = candidate ?? ((keyName && (stored[keyName] as string)) || null);
        const previousApiKey = (previousKeyName && (stored[previousKeyName] as string)) || null;

        // A validated candidate must never degrade to a no-op adapter. If
        // construction fails, leave both the live route and storage untouched.
        const configured = reconfigureAudioGenerator(provider, apiKey, candidate === undefined);
        if (!configured) {
          return Err({
            type: 'operation_failed',
            message: `Could not configure ${provider}.`,
          });
        }

        try {
          // A validated onboarding candidate and its provider commit together.
          await browser.storage.local.set({
            ...(candidate && keyName ? { [keyName]: candidate } : {}),
            provider,
          });
        } catch (error) {
          // Storage is the durable source of truth. Restore the previous live
          // route before reporting a failed commit to the popup.
          reconfigureAudioGenerator(previousProvider, previousApiKey);
          await getContainer().services.playback.setVoice(previousVoice);
          throw error;
        }

        return Ok({
          success: true,
          provider,
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
      const langParsed = providerValidateLanguageParamsSchema.safeParse(params);
      if (!langParsed.success) {
        return Err({
          type: 'invalid_params',
          message: 'language is required and must be a string (BCP-47 code)',
        });
      }

      if (!isContainerInitialized()) {
        return Err({
          type: 'container_not_initialized',
          message: 'Container not initialized.',
        });
      }

      try {
        const container = getContainer();
        const providerId = langParsed.data.provider || container.config.provider;
        const metadata = PROVIDER_METADATA[providerId];

        if (!metadata) {
          return Err({
            type: 'invalid_params',
            message: `Unknown provider: ${providerId}`,
          });
        }

        const language = langParsed.data.language;

        // Empty supportedLanguages means all languages are supported
        const supported =
          metadata.supportedLanguages.length === 0 ||
          metadata.supportedLanguages.includes(language) ||
          metadata.supportedLanguages.some((lang) =>
            language.toLowerCase().startsWith(lang.toLowerCase()),
          );

        // Find providers that support this language
        const suggestedProviders: ProviderId[] = [];
        if (!supported) {
          for (const [id, meta] of Object.entries(PROVIDER_METADATA)) {
            const supportsLang =
              meta.supportedLanguages.length === 0 ||
              meta.supportedLanguages.includes(language) ||
              meta.supportedLanguages.some((lang) =>
                language.toLowerCase().startsWith(lang.toLowerCase()),
              );
            if (supportsLang) {
              suggestedProviders.push(id as ProviderId);
            }
          }
        }

        return Ok({
          supported,
          provider: providerId,
          language,
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
