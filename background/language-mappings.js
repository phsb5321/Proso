/**
 * VoxPage Language Mappings
 * BCP 47 to provider-specific language code mappings
 *
 * @module background/language-mappings
 * @description Maps standard BCP 47 language codes to provider-specific formats.
 * Used for selecting appropriate voices and passing language codes to TTS APIs.
 */

import { normalizeLanguageCode } from '../shared/language-codes.js';

/**
 * Language mapping entry
 * @typedef {Object} LanguageMapping
 * @property {string} bcp47 - BCP 47 language tag
 * @property {Object} providers - Provider-specific code mappings
 * @property {string|null} providers.elevenlabs - ElevenLabs language_code (null = use default)
 * @property {string|null} providers.openai - OpenAI (null = auto-detect)
 * @property {string} providers.browser - Browser TTS lang attribute
 * @property {null} providers.groq - Groq (null = English only)
 * @property {null} providers.cartesia - Cartesia (null = English only)
 * @property {string} displayName - Human-readable language name
 * @property {string} iso639_1 - ISO 639-1 2-letter code
 */

/**
 * Complete language mappings for 20+ supported languages
 * ElevenLabs codes from: https://elevenlabs.io/docs/api-reference/text-to-speech
 * @constant {Object.<string, LanguageMapping>}
 */
export const LANGUAGE_MAPPINGS = Object.freeze({
  en: {
    bcp47: 'en',
    providers: { elevenlabs: null, openai: null, browser: 'en-US', groq: 'en', cartesia: 'en' },
    displayName: 'English',
    iso639_1: 'en'
  },
  es: {
    bcp47: 'es',
    providers: { elevenlabs: 'es', openai: null, browser: 'es-ES', groq: null, cartesia: null },
    displayName: 'Spanish',
    iso639_1: 'es'
  },
  fr: {
    bcp47: 'fr',
    providers: { elevenlabs: 'fr', openai: null, browser: 'fr-FR', groq: null, cartesia: null },
    displayName: 'French',
    iso639_1: 'fr'
  },
  de: {
    bcp47: 'de',
    providers: { elevenlabs: 'de', openai: null, browser: 'de-DE', groq: null, cartesia: null },
    displayName: 'German',
    iso639_1: 'de'
  },
  it: {
    bcp47: 'it',
    providers: { elevenlabs: 'it', openai: null, browser: 'it-IT', groq: null, cartesia: null },
    displayName: 'Italian',
    iso639_1: 'it'
  },
  pt: {
    bcp47: 'pt',
    providers: { elevenlabs: 'pt', openai: null, browser: 'pt-PT', groq: null, cartesia: null },
    displayName: 'Portuguese',
    iso639_1: 'pt'
  },
  pl: {
    bcp47: 'pl',
    providers: { elevenlabs: 'pl', openai: null, browser: 'pl-PL', groq: null, cartesia: null },
    displayName: 'Polish',
    iso639_1: 'pl'
  },
  tr: {
    bcp47: 'tr',
    providers: { elevenlabs: 'tr', openai: null, browser: 'tr-TR', groq: null, cartesia: null },
    displayName: 'Turkish',
    iso639_1: 'tr'
  },
  ru: {
    bcp47: 'ru',
    providers: { elevenlabs: 'ru', openai: null, browser: 'ru-RU', groq: null, cartesia: null },
    displayName: 'Russian',
    iso639_1: 'ru'
  },
  nl: {
    bcp47: 'nl',
    providers: { elevenlabs: 'nl', openai: null, browser: 'nl-NL', groq: null, cartesia: null },
    displayName: 'Dutch',
    iso639_1: 'nl'
  },
  cs: {
    bcp47: 'cs',
    providers: { elevenlabs: 'cs', openai: null, browser: 'cs-CZ', groq: null, cartesia: null },
    displayName: 'Czech',
    iso639_1: 'cs'
  },
  ar: {
    bcp47: 'ar',
    providers: { elevenlabs: 'ar', openai: null, browser: 'ar-SA', groq: null, cartesia: null },
    displayName: 'Arabic',
    iso639_1: 'ar'
  },
  zh: {
    bcp47: 'zh',
    providers: { elevenlabs: 'zh-cn', openai: null, browser: 'zh-CN', groq: null, cartesia: null },
    displayName: 'Chinese',
    iso639_1: 'zh'
  },
  hu: {
    bcp47: 'hu',
    providers: { elevenlabs: 'hu', openai: null, browser: 'hu-HU', groq: null, cartesia: null },
    displayName: 'Hungarian',
    iso639_1: 'hu'
  },
  ko: {
    bcp47: 'ko',
    providers: { elevenlabs: 'ko', openai: null, browser: 'ko-KR', groq: null, cartesia: null },
    displayName: 'Korean',
    iso639_1: 'ko'
  },
  ja: {
    bcp47: 'ja',
    providers: { elevenlabs: 'ja', openai: null, browser: 'ja-JP', groq: null, cartesia: null },
    displayName: 'Japanese',
    iso639_1: 'ja'
  },
  hi: {
    bcp47: 'hi',
    providers: { elevenlabs: 'hi', openai: null, browser: 'hi-IN', groq: null, cartesia: null },
    displayName: 'Hindi',
    iso639_1: 'hi'
  },
  sv: {
    bcp47: 'sv',
    providers: { elevenlabs: 'sv', openai: null, browser: 'sv-SE', groq: null, cartesia: null },
    displayName: 'Swedish',
    iso639_1: 'sv'
  },
  id: {
    bcp47: 'id',
    providers: { elevenlabs: 'id', openai: null, browser: 'id-ID', groq: null, cartesia: null },
    displayName: 'Indonesian',
    iso639_1: 'id'
  },
  uk: {
    bcp47: 'uk',
    providers: { elevenlabs: 'uk', openai: null, browser: 'uk-UA', groq: null, cartesia: null },
    displayName: 'Ukrainian',
    iso639_1: 'uk'
  },
  el: {
    bcp47: 'el',
    providers: { elevenlabs: 'el', openai: null, browser: 'el-GR', groq: null, cartesia: null },
    displayName: 'Greek',
    iso639_1: 'el'
  },
  fi: {
    bcp47: 'fi',
    providers: { elevenlabs: 'fi', openai: null, browser: 'fi-FI', groq: null, cartesia: null },
    displayName: 'Finnish',
    iso639_1: 'fi'
  },
  ro: {
    bcp47: 'ro',
    providers: { elevenlabs: 'ro', openai: null, browser: 'ro-RO', groq: null, cartesia: null },
    displayName: 'Romanian',
    iso639_1: 'ro'
  },
  da: {
    bcp47: 'da',
    providers: { elevenlabs: 'da', openai: null, browser: 'da-DK', groq: null, cartesia: null },
    displayName: 'Danish',
    iso639_1: 'da'
  },
  bg: {
    bcp47: 'bg',
    providers: { elevenlabs: 'bg', openai: null, browser: 'bg-BG', groq: null, cartesia: null },
    displayName: 'Bulgarian',
    iso639_1: 'bg'
  },
  ms: {
    bcp47: 'ms',
    providers: { elevenlabs: 'ms', openai: null, browser: 'ms-MY', groq: null, cartesia: null },
    displayName: 'Malay',
    iso639_1: 'ms'
  },
  sk: {
    bcp47: 'sk',
    providers: { elevenlabs: 'sk', openai: null, browser: 'sk-SK', groq: null, cartesia: null },
    displayName: 'Slovak',
    iso639_1: 'sk'
  },
  hr: {
    bcp47: 'hr',
    providers: { elevenlabs: 'hr', openai: null, browser: 'hr-HR', groq: null, cartesia: null },
    displayName: 'Croatian',
    iso639_1: 'hr'
  },
  ta: {
    bcp47: 'ta',
    providers: { elevenlabs: 'ta', openai: null, browser: 'ta-IN', groq: null, cartesia: null },
    displayName: 'Tamil',
    iso639_1: 'ta'
  },
  fil: {
    bcp47: 'fil',
    providers: { elevenlabs: 'fil', openai: null, browser: 'fil-PH', groq: null, cartesia: null },
    displayName: 'Filipino',
    iso639_1: 'fil'
  }
});

/**
 * Get mapping for a language code
 * @param {string} code - BCP 47 or ISO 639-1 language code
 * @returns {LanguageMapping|null}
 */
export function getLanguageMapping(code) {
  const primary = normalizeLanguageCode(code);
  return LANGUAGE_MAPPINGS[primary] || null;
}

/**
 * Get provider-specific language code
 * @param {string} languageCode - BCP 47 or ISO 639-1 code
 * @param {string} providerId - Provider ID (elevenlabs, openai, browser, groq, cartesia)
 * @returns {string|null} Provider-specific code, null if unsupported
 */
export function getProviderLanguageCode(languageCode, providerId) {
  const mapping = getLanguageMapping(languageCode);
  if (!mapping) return null;
  return mapping.providers[providerId];
}

/**
 * Get display name for a language code
 * @param {string} code - Language code
 * @returns {string} Display name or uppercase code if not found
 */
export function getLanguageDisplayName(code) {
  const mapping = getLanguageMapping(code);
  return mapping?.displayName || code.toUpperCase();
}

/**
 * Check if a provider supports a language
 * @param {string} providerId - Provider ID
 * @param {string} languageCode - Language code to check
 * @returns {boolean}
 */
export function providerSupportsLanguage(providerId, languageCode) {
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
  // For now, assume all mapped languages have potential browser support
  if (providerId === 'browser') return true;

  // ElevenLabs: check if there's a non-null mapping
  if (providerId === 'elevenlabs') {
    // null means use default (English), non-null means explicit support
    return true; // ElevenLabs multilingual model supports all mapped languages
  }

  return false;
}

/**
 * Get all providers that support a language
 * @param {string} languageCode - Language code to check
 * @returns {string[]} Array of provider IDs
 */
export function getProvidersForLanguage(languageCode) {
  const providers = ['openai', 'elevenlabs', 'browser', 'groq', 'cartesia'];
  return providers.filter(providerId => providerSupportsLanguage(providerId, languageCode));
}

/**
 * Get all supported language codes as an array
 * @returns {Array<{code: string, displayName: string}>}
 */
export function getAllLanguages() {
  return Object.entries(LANGUAGE_MAPPINGS).map(([code, mapping]) => ({
    code,
    displayName: mapping.displayName
  }));
}

/**
 * T036: Filter voices by language (019-multilingual-tts)
 * Filters a list of voices to only those supporting the specified language.
 * For Browser TTS, filters by voice.lang; for API providers, checks provider support.
 *
 * @param {Array<{id: string, name: string, description?: string, lang?: string}>} voices - All available voices
 * @param {string} languageCode - Target language code (ISO 639-1 or BCP 47)
 * @param {string} providerId - Provider ID (browser, elevenlabs, openai, groq, cartesia)
 * @returns {Array} Filtered voices that support the language
 */
export function getVoicesForLanguage(voices, languageCode, providerId) {
  if (!voices || !Array.isArray(voices) || voices.length === 0) {
    return [];
  }

  if (!languageCode) {
    // No language filter - return all voices
    return voices;
  }

  const targetPrimary = normalizeLanguageCode(languageCode);

  // OpenAI: auto-detect, all voices support all languages
  if (providerId === 'openai') {
    return voices;
  }

  // Groq/Cartesia: English only - return all voices for English, empty for others
  if (providerId === 'groq' || providerId === 'cartesia') {
    return targetPrimary === 'en' ? voices : [];
  }

  // ElevenLabs: Multilingual model supports all mapped languages
  if (providerId === 'elevenlabs') {
    // If language is in our mappings, all ElevenLabs voices can handle it
    const mapping = getLanguageMapping(languageCode);
    return mapping ? voices : [];
  }

  // Browser TTS: Filter by voice.lang or description containing language
  if (providerId === 'browser') {
    return voices.filter(voice => {
      // Check voice.lang (Browser TTS native property)
      if (voice.lang) {
        const voicePrimary = normalizeLanguageCode(voice.lang);
        return voicePrimary === targetPrimary;
      }
      // Check description for language code (format: "Voice Name - en-US")
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

export default {
  LANGUAGE_MAPPINGS,
  getLanguageMapping,
  getProviderLanguageCode,
  getLanguageDisplayName,
  providerSupportsLanguage,
  getProvidersForLanguage,
  getAllLanguages,
  getVoicesForLanguage
};
