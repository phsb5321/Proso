/**
 * VoxPage Language Code Utilities
 * BCP 47 parsing and supported languages list
 *
 * @module shared/language-codes
 * @description Utilities for parsing BCP 47 language tags and managing
 * the list of languages supported by VoxPage TTS providers.
 */

/**
 * Supported languages with display names
 * Based on ElevenLabs + Browser TTS intersection (20+ languages)
 * @constant {Object.<string, string>}
 */
export const SUPPORTED_LANGUAGES = Object.freeze({
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  tr: 'Turkish',
  ru: 'Russian',
  nl: 'Dutch',
  cs: 'Czech',
  ar: 'Arabic',
  zh: 'Chinese',
  hu: 'Hungarian',
  ko: 'Korean',
  ja: 'Japanese',
  hi: 'Hindi',
  sv: 'Swedish',
  id: 'Indonesian',
  uk: 'Ukrainian',
  el: 'Greek',
  fi: 'Finnish',
  ro: 'Romanian',
  da: 'Danish',
  bg: 'Bulgarian',
  ms: 'Malay',
  sk: 'Slovak',
  hr: 'Croatian',
  ta: 'Tamil',
  fil: 'Filipino'
});

/**
 * Parse a BCP 47 language tag into components
 * @param {string} tag - BCP 47 language tag (e.g., "en-US", "zh-Hans-CN")
 * @returns {{ primary: string, region: string|null, script: string|null, full: string }}
 * @example
 * parseBCP47('en-US') // { primary: 'en', region: 'us', script: null, full: 'en-US' }
 * parseBCP47('zh-Hans-CN') // { primary: 'zh', region: 'cn', script: 'hans', full: 'zh-Hans-CN' }
 */
export function parseBCP47(tag) {
  if (!tag || typeof tag !== 'string') {
    return { primary: 'en', region: null, script: null, full: 'en' };
  }

  const parts = tag.toLowerCase().split('-');
  const primary = parts[0];
  let region = null;
  let script = null;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Script tags are 4 characters (e.g., "hans", "latn")
    if (part.length === 4 && !script) {
      script = part;
    }
    // Region tags are 2 characters (e.g., "us", "cn")
    else if (part.length === 2 && !region) {
      region = part;
    }
  }

  return { primary, region, script, full: tag };
}

/**
 * Normalize a language code to ISO 639-1 (2-letter) format
 * @param {string} code - Language code (BCP 47 or ISO 639-1)
 * @returns {string} Normalized 2-letter code
 * @example
 * normalizeLanguageCode('en-US') // 'en'
 * normalizeLanguageCode('zh-Hans') // 'zh'
 */
export function normalizeLanguageCode(code) {
  if (!code || typeof code !== 'string') {
    return 'en';
  }
  return parseBCP47(code).primary;
}

/**
 * Check if a language code is supported
 * @param {string} code - Language code to check
 * @returns {boolean}
 */
export function isLanguageSupported(code) {
  const primary = normalizeLanguageCode(code);
  return primary in SUPPORTED_LANGUAGES;
}

/**
 * Get the display name for a language code
 * @param {string} code - Language code
 * @returns {string} Display name or the code if not found
 */
export function getLanguageDisplayName(code) {
  const primary = normalizeLanguageCode(code);
  return SUPPORTED_LANGUAGES[primary] || code.toUpperCase();
}

/**
 * Get all supported languages as an array of { code, displayName }
 * @returns {Array<{ code: string, displayName: string }>}
 */
export function getSupportedLanguagesList() {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, displayName]) => ({
    code,
    displayName
  }));
}

export default {
  SUPPORTED_LANGUAGES,
  parseBCP47,
  normalizeLanguageCode,
  isLanguageSupported,
  getLanguageDisplayName,
  getSupportedLanguagesList
};
