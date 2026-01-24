/**
 * TTS Routing Policy
 *
 * Pure domain logic for selecting TTS providers based on context.
 * No external dependencies - follows hexagonal architecture principles.
 *
 * @module core/tts/routing-policy
 * @since 049-tts-provider-consolidation
 */

import type { ProviderId } from '../shared/errors';

/**
 * Languages supported by ElevenLabs TTS.
 * Source: https://elevenlabs.io/docs/api-reference/how-to-use-text-to-speech
 */
export const ELEVENLABS_LANGUAGES = [
  'ar', // Arabic
  'bg', // Bulgarian
  'cs', // Czech
  'da', // Danish
  'de', // German
  'el', // Greek
  'en', // English
  'es', // Spanish
  'fi', // Finnish
  'fil', // Filipino
  'fr', // French
  'hi', // Hindi
  'hr', // Croatian
  'hu', // Hungarian
  'id', // Indonesian
  'it', // Italian
  'ja', // Japanese
  'ko', // Korean
  'ms', // Malay
  'nl', // Dutch
  'pl', // Polish
  'pt', // Portuguese
  'ro', // Romanian
  'ru', // Russian
  'sk', // Slovak
  'sv', // Swedish
  'ta', // Tamil
  'tr', // Turkish
  'uk', // Ukrainian
  'zh', // Chinese
] as const;

export type ElevenLabsLanguage = (typeof ELEVENLABS_LANGUAGES)[number];

/**
 * Reason for provider selection.
 */
export type RoutingReason =
  | 'user_override' // User explicitly selected provider
  | 'api_key_available' // ElevenLabs key is configured
  | 'api_key_missing' // No API key configured, fallback to browser
  | 'default_selection'; // Normal automatic selection

/**
 * Input context for routing decisions.
 */
export interface RoutingContext {
  /** Detected page language (BCP-47 format, e.g., 'en', 'es', 'pt-BR') */
  readonly languageCode: string;
  /** Whether ElevenLabs API key is configured */
  readonly hasElevenLabsKey: boolean;
  /** Manual provider override, null = automatic routing */
  readonly userOverride: ProviderId | null;
}

/**
 * Output of routing decision.
 */
export interface RoutingDecision {
  /** Selected provider */
  readonly provider: ProviderId;
  /** Why this provider was selected */
  readonly reason: RoutingReason;
  /** Whether the selected provider supports the detected language */
  readonly languageSupported: boolean;
}

/**
 * TTS Provider Routing Policy
 *
 * Determines which TTS provider to use based on:
 * 1. User manual override (if set)
 * 2. ElevenLabs API key availability
 * 3. Language support
 *
 * Pure domain logic with no side effects.
 */
export class TtsRoutingPolicy {
  /**
   * Resolve which provider to use based on context.
   *
   * Priority:
   * 1. User override (if set)
   * 2. ElevenLabs (if API key configured)
   * 3. Browser TTS (fallback)
   *
   * @param context - Routing context with language and API key info
   * @returns Routing decision with provider and reason
   */
  resolveProvider(context: RoutingContext): RoutingDecision {
    const { languageCode, hasElevenLabsKey, userOverride } = context;

    // Priority 1: User override
    if (userOverride !== null) {
      return {
        provider: userOverride,
        reason: 'user_override',
        languageSupported: this.supportsLanguage(userOverride, languageCode),
      };
    }

    // Priority 2: ElevenLabs if API key available
    if (hasElevenLabsKey) {
      return {
        provider: 'elevenlabs',
        reason: 'api_key_available',
        languageSupported: this.supportsLanguage('elevenlabs', languageCode),
      };
    }

    // Priority 3: Browser TTS fallback
    return {
      provider: 'browser',
      reason: 'api_key_missing',
      languageSupported: true, // Browser TTS uses system voices, language support varies
    };
  }

  /**
   * Check if a provider supports a given language.
   *
   * @param provider - Provider to check
   * @param languageCode - BCP-47 language code (e.g., 'en', 'en-US', 'pt-BR')
   * @returns true if language is supported
   */
  supportsLanguage(provider: ProviderId, languageCode: string): boolean {
    if (provider === 'browser') {
      // Browser TTS uses system voices, assume any language might be available
      return true;
    }

    // Extract primary language code (e.g., 'en-US' -> 'en', 'pt-BR' -> 'pt')
    const primaryCode = this.extractPrimaryLanguageCode(languageCode);

    if (provider === 'elevenlabs') {
      return ELEVENLABS_LANGUAGES.includes(primaryCode as ElevenLabsLanguage);
    }

    return false;
  }

  /**
   * Get list of supported languages for a provider.
   *
   * @param provider - Provider to get languages for
   * @returns Array of supported BCP-47 language codes
   */
  getSupportedLanguages(provider: ProviderId): readonly string[] {
    if (provider === 'elevenlabs') {
      return ELEVENLABS_LANGUAGES;
    }

    // Browser TTS - return empty array as it depends on system
    return [];
  }

  /**
   * Extract primary language code from a BCP-47 code.
   *
   * Examples:
   * - 'en' -> 'en'
   * - 'en-US' -> 'en'
   * - 'pt-BR' -> 'pt'
   * - 'zh-Hans' -> 'zh'
   *
   * @param languageCode - Full BCP-47 code
   * @returns Primary 2-letter language code
   */
  private extractPrimaryLanguageCode(languageCode: string): string {
    if (!languageCode) {
      return 'en'; // Default to English
    }

    // Handle primary code extraction
    const parts = languageCode.toLowerCase().split('-');
    return parts[0];
  }
}

/**
 * Singleton instance for convenience.
 * Use this when you don't need dependency injection.
 */
export const ttsRoutingPolicy = new TtsRoutingPolicy();
