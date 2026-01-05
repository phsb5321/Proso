/**
 * VoxPage Language Mappings
 * BCP 47 to provider-specific language code mappings
 *
 * @module utils/language/mappings
 */

import { normalizeLanguageCode } from './codes';

/**
 * Provider ID type
 */
export type ProviderId = 'openai' | 'elevenlabs' | 'browser' | 'groq' | 'cartesia';

/**
 * Language mapping entry with provider-specific codes
 */
export interface LanguageMapping {
  bcp47: string;
  providers: {
    elevenlabs: string | null; // null = use default/English
    openai: string | null; // null = auto-detect
    browser: string; // BCP-47 for Browser TTS
    groq: string | null; // null = unsupported (English only)
    cartesia: string | null; // null = unsupported (English only)
  };
  displayName: string;
  iso639_1: string;
}

/**
 * Voice interface for filtering
 */
export interface Voice {
  id: string;
  name: string;
  description?: string;
  lang?: string;
}

/**
 * Complete language mappings for 30 supported languages
 * ElevenLabs codes from: https://elevenlabs.io/docs/api-reference/text-to-speech
 */
export const LANGUAGE_MAPPINGS: Record<string, LanguageMapping> = Object.freeze({
  en: { bcp47: 'en', providers: { elevenlabs: null, openai: null, browser: 'en-US', groq: 'en', cartesia: 'en' }, displayName: 'English', iso639_1: 'en' },
  es: { bcp47: 'es', providers: { elevenlabs: 'es', openai: null, browser: 'es-ES', groq: null, cartesia: null }, displayName: 'Spanish', iso639_1: 'es' },
  fr: { bcp47: 'fr', providers: { elevenlabs: 'fr', openai: null, browser: 'fr-FR', groq: null, cartesia: null }, displayName: 'French', iso639_1: 'fr' },
  de: { bcp47: 'de', providers: { elevenlabs: 'de', openai: null, browser: 'de-DE', groq: null, cartesia: null }, displayName: 'German', iso639_1: 'de' },
  it: { bcp47: 'it', providers: { elevenlabs: 'it', openai: null, browser: 'it-IT', groq: null, cartesia: null }, displayName: 'Italian', iso639_1: 'it' },
  pt: { bcp47: 'pt', providers: { elevenlabs: 'pt', openai: null, browser: 'pt-PT', groq: null, cartesia: null }, displayName: 'Portuguese', iso639_1: 'pt' },
  pl: { bcp47: 'pl', providers: { elevenlabs: 'pl', openai: null, browser: 'pl-PL', groq: null, cartesia: null }, displayName: 'Polish', iso639_1: 'pl' },
  tr: { bcp47: 'tr', providers: { elevenlabs: 'tr', openai: null, browser: 'tr-TR', groq: null, cartesia: null }, displayName: 'Turkish', iso639_1: 'tr' },
  ru: { bcp47: 'ru', providers: { elevenlabs: 'ru', openai: null, browser: 'ru-RU', groq: null, cartesia: null }, displayName: 'Russian', iso639_1: 'ru' },
  nl: { bcp47: 'nl', providers: { elevenlabs: 'nl', openai: null, browser: 'nl-NL', groq: null, cartesia: null }, displayName: 'Dutch', iso639_1: 'nl' },
  cs: { bcp47: 'cs', providers: { elevenlabs: 'cs', openai: null, browser: 'cs-CZ', groq: null, cartesia: null }, displayName: 'Czech', iso639_1: 'cs' },
  ar: { bcp47: 'ar', providers: { elevenlabs: 'ar', openai: null, browser: 'ar-SA', groq: null, cartesia: null }, displayName: 'Arabic', iso639_1: 'ar' },
  zh: { bcp47: 'zh', providers: { elevenlabs: 'zh-cn', openai: null, browser: 'zh-CN', groq: null, cartesia: null }, displayName: 'Chinese', iso639_1: 'zh' },
  hu: { bcp47: 'hu', providers: { elevenlabs: 'hu', openai: null, browser: 'hu-HU', groq: null, cartesia: null }, displayName: 'Hungarian', iso639_1: 'hu' },
  ko: { bcp47: 'ko', providers: { elevenlabs: 'ko', openai: null, browser: 'ko-KR', groq: null, cartesia: null }, displayName: 'Korean', iso639_1: 'ko' },
  ja: { bcp47: 'ja', providers: { elevenlabs: 'ja', openai: null, browser: 'ja-JP', groq: null, cartesia: null }, displayName: 'Japanese', iso639_1: 'ja' },
  hi: { bcp47: 'hi', providers: { elevenlabs: 'hi', openai: null, browser: 'hi-IN', groq: null, cartesia: null }, displayName: 'Hindi', iso639_1: 'hi' },
  sv: { bcp47: 'sv', providers: { elevenlabs: 'sv', openai: null, browser: 'sv-SE', groq: null, cartesia: null }, displayName: 'Swedish', iso639_1: 'sv' },
  id: { bcp47: 'id', providers: { elevenlabs: 'id', openai: null, browser: 'id-ID', groq: null, cartesia: null }, displayName: 'Indonesian', iso639_1: 'id' },
  uk: { bcp47: 'uk', providers: { elevenlabs: 'uk', openai: null, browser: 'uk-UA', groq: null, cartesia: null }, displayName: 'Ukrainian', iso639_1: 'uk' },
  el: { bcp47: 'el', providers: { elevenlabs: 'el', openai: null, browser: 'el-GR', groq: null, cartesia: null }, displayName: 'Greek', iso639_1: 'el' },
  fi: { bcp47: 'fi', providers: { elevenlabs: 'fi', openai: null, browser: 'fi-FI', groq: null, cartesia: null }, displayName: 'Finnish', iso639_1: 'fi' },
  ro: { bcp47: 'ro', providers: { elevenlabs: 'ro', openai: null, browser: 'ro-RO', groq: null, cartesia: null }, displayName: 'Romanian', iso639_1: 'ro' },
  da: { bcp47: 'da', providers: { elevenlabs: 'da', openai: null, browser: 'da-DK', groq: null, cartesia: null }, displayName: 'Danish', iso639_1: 'da' },
  bg: { bcp47: 'bg', providers: { elevenlabs: 'bg', openai: null, browser: 'bg-BG', groq: null, cartesia: null }, displayName: 'Bulgarian', iso639_1: 'bg' },
  ms: { bcp47: 'ms', providers: { elevenlabs: 'ms', openai: null, browser: 'ms-MY', groq: null, cartesia: null }, displayName: 'Malay', iso639_1: 'ms' },
  sk: { bcp47: 'sk', providers: { elevenlabs: 'sk', openai: null, browser: 'sk-SK', groq: null, cartesia: null }, displayName: 'Slovak', iso639_1: 'sk' },
  hr: { bcp47: 'hr', providers: { elevenlabs: 'hr', openai: null, browser: 'hr-HR', groq: null, cartesia: null }, displayName: 'Croatian', iso639_1: 'hr' },
  ta: { bcp47: 'ta', providers: { elevenlabs: 'ta', openai: null, browser: 'ta-IN', groq: null, cartesia: null }, displayName: 'Tamil', iso639_1: 'ta' },
  fil: { bcp47: 'fil', providers: { elevenlabs: 'fil', openai: null, browser: 'fil-PH', groq: null, cartesia: null }, displayName: 'Filipino', iso639_1: 'fil' },
});

/**
 * Get mapping for a language code
 *
 * @param code - BCP 47 or ISO 639-1 language code
 * @returns Language mapping or null if not found
 */
export function getLanguageMapping(code: string): LanguageMapping | null {
  const primary = normalizeLanguageCode(code);
  return LANGUAGE_MAPPINGS[primary] || null;
}

/**
 * Get provider-specific language code
 *
 * @param languageCode - BCP 47 or ISO 639-1 code
 * @param providerId - Provider ID
 * @returns Provider-specific code, null if unsupported
 */
export function getProviderLanguageCode(languageCode: string, providerId: ProviderId): string | null {
  const mapping = getLanguageMapping(languageCode);
  if (!mapping) return null;
  return mapping.providers[providerId];
}

/**
 * Get display name for a language code
 *
 * @param code - Language code
 * @returns Display name or uppercase code if not found
 */
export function getLanguageDisplayName(code: string): string {
  const mapping = getLanguageMapping(code);
  return mapping?.displayName || code.toUpperCase();
}

/**
 * Check if a provider supports a language
 *
 * @param providerId - Provider ID
 * @param languageCode - Language code to check
 * @returns True if provider supports the language
 */
export function providerSupportsLanguage(providerId: ProviderId, languageCode: string): boolean {
  // OpenAI auto-detects all languages
  if (providerId === 'openai') return true;

  // Groq and Cartesia only support English
  if (providerId === 'groq' || providerId === 'cartesia') {
    const primary = normalizeLanguageCode(languageCode);
    return primary === 'en';
  }

  // ElevenLabs and Browser check the mapping
  const mapping = getLanguageMapping(languageCode);
  if (!mapping) return false;

  // Browser TTS dynamically supports languages based on system voices
  if (providerId === 'browser') return true;

  // ElevenLabs multilingual model supports all mapped languages
  if (providerId === 'elevenlabs') return true;

  return false;
}

/**
 * Get all providers that support a language
 *
 * @param languageCode - Language code to check
 * @returns Array of provider IDs
 */
export function getProvidersForLanguage(languageCode: string): ProviderId[] {
  const providers: ProviderId[] = ['openai', 'elevenlabs', 'browser', 'groq', 'cartesia'];
  return providers.filter(providerId => providerSupportsLanguage(providerId, languageCode));
}

/**
 * Get all supported language codes as an array
 *
 * @returns Array of {code, displayName} objects
 */
export function getAllLanguages(): Array<{ code: string; displayName: string }> {
  return Object.entries(LANGUAGE_MAPPINGS).map(([code, mapping]) => ({
    code,
    displayName: mapping.displayName,
  }));
}

/**
 * Filter voices by language
 * Filters a list of voices to only those supporting the specified language
 *
 * @param voices - All available voices
 * @param languageCode - Target language code (ISO 639-1 or BCP 47)
 * @param providerId - Provider ID
 * @returns Filtered voices that support the language
 */
export function getVoicesForLanguage(voices: Voice[], languageCode: string, providerId: ProviderId): Voice[] {
  if (!voices || !Array.isArray(voices) || voices.length === 0) {
    return [];
  }

  if (!languageCode) {
    return voices;
  }

  const targetPrimary = normalizeLanguageCode(languageCode);

  // OpenAI: auto-detect, all voices support all languages
  if (providerId === 'openai') {
    return voices;
  }

  // Groq/Cartesia: English only
  if (providerId === 'groq' || providerId === 'cartesia') {
    return targetPrimary === 'en' ? voices : [];
  }

  // ElevenLabs: Multilingual model supports all mapped languages
  if (providerId === 'elevenlabs') {
    const mapping = getLanguageMapping(languageCode);
    return mapping ? voices : [];
  }

  // Browser TTS: Filter by voice.lang or description
  if (providerId === 'browser') {
    return voices.filter(voice => {
      // Check voice.lang (Browser TTS native property)
      if (voice.lang) {
        const voicePrimary = normalizeLanguageCode(voice.lang);
        return voicePrimary === targetPrimary;
      }
      // Check description for language code
      if (voice.description) {
        const descPrimary = normalizeLanguageCode(voice.description);
        return descPrimary === targetPrimary;
      }
      return false;
    });
  }

  // Unknown provider - return all voices
  return voices;
}
