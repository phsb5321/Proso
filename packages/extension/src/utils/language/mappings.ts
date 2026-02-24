// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Proso Language Mappings
 * BCP 47 to provider-specific language code mappings
 *
 * @module utils/language/mappings
 */

import { normalizeLanguageCode } from './codes';

/**
 * Provider ID type
 */
export type ProviderId = 'elevenlabs' | 'browser';

/**
 * Language mapping entry with provider-specific codes
 */
export interface LanguageMapping {
  bcp47: string;
  providers: {
    elevenlabs: string | null; // null = use default/English
    browser: string | null; // BCP 47 code used by speechSynthesis
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
  en: {
    bcp47: 'en',
    providers: { elevenlabs: null, browser: 'en' },
    displayName: 'English',
    iso639_1: 'en',
  },
  es: {
    bcp47: 'es',
    providers: { elevenlabs: 'es', browser: 'es' },
    displayName: 'Spanish',
    iso639_1: 'es',
  },
  fr: {
    bcp47: 'fr',
    providers: { elevenlabs: 'fr', browser: 'fr' },
    displayName: 'French',
    iso639_1: 'fr',
  },
  de: {
    bcp47: 'de',
    providers: { elevenlabs: 'de', browser: 'de' },
    displayName: 'German',
    iso639_1: 'de',
  },
  it: {
    bcp47: 'it',
    providers: { elevenlabs: 'it', browser: 'it' },
    displayName: 'Italian',
    iso639_1: 'it',
  },
  pt: {
    bcp47: 'pt',
    providers: { elevenlabs: 'pt', browser: 'pt' },
    displayName: 'Portuguese',
    iso639_1: 'pt',
  },
  pl: {
    bcp47: 'pl',
    providers: { elevenlabs: 'pl', browser: 'pl' },
    displayName: 'Polish',
    iso639_1: 'pl',
  },
  tr: {
    bcp47: 'tr',
    providers: { elevenlabs: 'tr', browser: 'tr' },
    displayName: 'Turkish',
    iso639_1: 'tr',
  },
  ru: {
    bcp47: 'ru',
    providers: { elevenlabs: 'ru', browser: 'ru' },
    displayName: 'Russian',
    iso639_1: 'ru',
  },
  nl: {
    bcp47: 'nl',
    providers: { elevenlabs: 'nl', browser: 'nl' },
    displayName: 'Dutch',
    iso639_1: 'nl',
  },
  cs: {
    bcp47: 'cs',
    providers: { elevenlabs: 'cs', browser: 'cs' },
    displayName: 'Czech',
    iso639_1: 'cs',
  },
  ar: {
    bcp47: 'ar',
    providers: { elevenlabs: 'ar', browser: 'ar' },
    displayName: 'Arabic',
    iso639_1: 'ar',
  },
  zh: {
    bcp47: 'zh',
    providers: { elevenlabs: 'zh-cn', browser: 'zh' },
    displayName: 'Chinese',
    iso639_1: 'zh',
  },
  hu: {
    bcp47: 'hu',
    providers: { elevenlabs: 'hu', browser: 'hu' },
    displayName: 'Hungarian',
    iso639_1: 'hu',
  },
  ko: {
    bcp47: 'ko',
    providers: { elevenlabs: 'ko', browser: 'ko' },
    displayName: 'Korean',
    iso639_1: 'ko',
  },
  ja: {
    bcp47: 'ja',
    providers: { elevenlabs: 'ja', browser: 'ja' },
    displayName: 'Japanese',
    iso639_1: 'ja',
  },
  hi: {
    bcp47: 'hi',
    providers: { elevenlabs: 'hi', browser: 'hi' },
    displayName: 'Hindi',
    iso639_1: 'hi',
  },
  sv: {
    bcp47: 'sv',
    providers: { elevenlabs: 'sv', browser: 'sv' },
    displayName: 'Swedish',
    iso639_1: 'sv',
  },
  id: {
    bcp47: 'id',
    providers: { elevenlabs: 'id', browser: 'id' },
    displayName: 'Indonesian',
    iso639_1: 'id',
  },
  uk: {
    bcp47: 'uk',
    providers: { elevenlabs: 'uk', browser: 'uk' },
    displayName: 'Ukrainian',
    iso639_1: 'uk',
  },
  el: {
    bcp47: 'el',
    providers: { elevenlabs: 'el', browser: 'el' },
    displayName: 'Greek',
    iso639_1: 'el',
  },
  fi: {
    bcp47: 'fi',
    providers: { elevenlabs: 'fi', browser: 'fi' },
    displayName: 'Finnish',
    iso639_1: 'fi',
  },
  ro: {
    bcp47: 'ro',
    providers: { elevenlabs: 'ro', browser: 'ro' },
    displayName: 'Romanian',
    iso639_1: 'ro',
  },
  da: {
    bcp47: 'da',
    providers: { elevenlabs: 'da', browser: 'da' },
    displayName: 'Danish',
    iso639_1: 'da',
  },
  bg: {
    bcp47: 'bg',
    providers: { elevenlabs: 'bg', browser: 'bg' },
    displayName: 'Bulgarian',
    iso639_1: 'bg',
  },
  ms: {
    bcp47: 'ms',
    providers: { elevenlabs: 'ms', browser: 'ms' },
    displayName: 'Malay',
    iso639_1: 'ms',
  },
  sk: {
    bcp47: 'sk',
    providers: { elevenlabs: 'sk', browser: 'sk' },
    displayName: 'Slovak',
    iso639_1: 'sk',
  },
  hr: {
    bcp47: 'hr',
    providers: { elevenlabs: 'hr', browser: 'hr' },
    displayName: 'Croatian',
    iso639_1: 'hr',
  },
  ta: {
    bcp47: 'ta',
    providers: { elevenlabs: 'ta', browser: 'ta' },
    displayName: 'Tamil',
    iso639_1: 'ta',
  },
  fil: {
    bcp47: 'fil',
    providers: { elevenlabs: 'fil', browser: 'fil' },
    displayName: 'Filipino',
    iso639_1: 'fil',
  },
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
export function getProviderLanguageCode(
  languageCode: string,
  providerId: ProviderId,
): string | null {
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
export function providerSupportsLanguage(_providerId: ProviderId, languageCode: string): boolean {
  const mapping = getLanguageMapping(languageCode);
  if (!mapping) return false;

  return true;
}

/**
 * Get all providers that support a language
 *
 * @param languageCode - Language code to check
 * @returns Array of provider IDs
 */
export function getProvidersForLanguage(languageCode: string): ProviderId[] {
  const providers: ProviderId[] = ['elevenlabs', 'browser'];
  return providers.filter((providerId) => providerSupportsLanguage(providerId, languageCode));
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
export function getVoicesForLanguage(
  voices: Voice[],
  languageCode: string,
  _providerId: ProviderId,
): Voice[] {
  if (!voices || !Array.isArray(voices) || voices.length === 0) {
    return [];
  }

  if (!languageCode) {
    return voices;
  }

  const mapping = getLanguageMapping(languageCode);
  return mapping ? voices : [];
}
