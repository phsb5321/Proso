// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Language Detector
 * Detects page language from metadata and text content using franc-min
 *
 * @module utils/language/detector
 */

import { franc } from 'franc-min';
import { createLogger } from '../logging/logger';
import { isLanguageSupported, normalizeLanguageCode } from './codes';
import type { LanguageDetectionResult, PageLanguage } from './types';

const log = createLogger('service');

/**
 * Storage keys for language detection
 */
const STORAGE_KEYS = {
  LANGUAGE_CACHE: 'languageCache',
  DETECTED_LANGUAGE: 'detectedLanguage',
  LANGUAGE_PREFERENCE: 'languagePreference',
} as const;

/**
 * Detected language with metadata
 */
export interface DetectedLanguage extends LanguageDetectionResult {
  isReliable: boolean;
  primaryCode: string;
  detectedAt: number;
}

/**
 * Language preference state
 */
export interface LanguagePreference {
  autoDetect: boolean;
  currentOverride: string | null;
  voicePreferences: Record<string, string>;
}

/**
 * Language state for a tab
 */
export interface LanguageState {
  detected: DetectedLanguage | null;
  override: string | null;
  effective: string;
  autoDetect: boolean;
}

/**
 * Detect language from text content using franc-min
 * franc-min supports 82 languages with pure JavaScript (no WASM)
 *
 * @param text - Text to analyze (ideally 100-500 chars)
 * @returns Detection result or null if failed
 */
export function detectLanguageFromText(text: string): { code: string; confidence: number } | null {
  if (!text || text.trim().length < 20) {
    return null;
  }

  try {
    // Use first 500 characters for detection
    const sample = text.slice(0, 500);

    // franc returns ISO 639-3 (3-letter) codes
    // Returns 'und' for undetermined
    const iso6393 = franc(sample, { minLength: 20 });

    if (!iso6393 || iso6393 === 'und') {
      return null;
    }

    // Map ISO 639-3 to ISO 639-1 (2-letter) codes
    // franc-min returns 3-letter codes, we need to map them to 2-letter
    const iso6391 = mapISO6393toISO6391(iso6393);

    // franc doesn't provide confidence scores, estimate based on text length
    // Longer text = higher confidence, max 0.95
    const confidence = Math.min(0.7 + (sample.length / 1000) * 0.25, 0.95);

    return {
      code: iso6391,
      confidence,
    };
  } catch (error) {
    log.error('Proso: Text language detection failed', { error });
    return null;
  }
}

/**
 * Map ISO 639-3 (3-letter) to ISO 639-1 (2-letter) codes
 * franc-min returns ISO 639-3, we need ISO 639-1
 */
function mapISO6393toISO6391(iso6393: string): string {
  const mapping: Record<string, string> = {
    eng: 'en',
    spa: 'es',
    fra: 'fr',
    deu: 'de',
    ita: 'it',
    por: 'pt',
    pol: 'pl',
    tur: 'tr',
    rus: 'ru',
    nld: 'nl',
    ces: 'cs',
    arb: 'ar',
    cmn: 'zh',
    hun: 'hu',
    kor: 'ko',
    jpn: 'ja',
    hin: 'hi',
    swe: 'sv',
    ind: 'id',
    ukr: 'uk',
    ell: 'el',
    fin: 'fi',
    ron: 'ro',
    dan: 'da',
    bul: 'bg',
    zsm: 'ms',
    slk: 'sk',
    hrv: 'hr',
    tam: 'ta',
    fil: 'fil',
  };

  return mapping[iso6393] || iso6393.slice(0, 2);
}

/**
 * Create a DetectedLanguage object
 */
function createDetectedLanguage(
  code: string,
  confidence: number,
  source: 'metadata' | 'text' | 'fallback',
): DetectedLanguage {
  const primaryCode = normalizeLanguageCode(code);
  const isReliable = confidence >= 0.9 || source === 'metadata';

  return {
    code,
    confidence,
    source,
    isReliable,
    primaryCode,
    detectedAt: Date.now(),
  };
}

/**
 * Detect language combining metadata and text analysis
 * Priority: text detection (if confident) > metadata > text (low confidence) > fallback
 *
 * @param params - Detection parameters
 * @returns Detected language object
 */
export async function detectLanguage(params: PageLanguage): Promise<DetectedLanguage> {
  const { metadata, textSample, url } = params;

  // Check cache first
  const cached = await getCachedLanguage(url);
  if (cached) {
    log.info(`Proso: Using cached language for ${url}: ${cached.code}`);
    return cached;
  }

  let detected: DetectedLanguage | null = null;

  // Try text detection first (prefer text if confidence > 90%)
  if (textSample && textSample.length >= 50) {
    const textResult = detectLanguageFromText(textSample);
    if (textResult && textResult.confidence >= 0.9) {
      detected = createDetectedLanguage(textResult.code, textResult.confidence, 'text');
      log.info(
        `Proso: Detected language from text: ${detected.code} (confidence: ${detected.confidence.toFixed(2)})`,
      );
    }
  }

  // Use metadata if text detection failed or was not confident
  if (!detected && metadata) {
    const primary = normalizeLanguageCode(metadata);
    if (isLanguageSupported(primary)) {
      detected = createDetectedLanguage(metadata, 1.0, 'metadata');
      log.info(`Proso: Using metadata language: ${detected.code}`);
    }
  }

  // Try text detection even if not highly confident
  if (!detected && textSample && textSample.length >= 50) {
    const textResult = detectLanguageFromText(textSample);
    if (textResult && textResult.confidence >= 0.5) {
      detected = createDetectedLanguage(textResult.code, textResult.confidence, 'text');
      log.info(
        `Proso: Detected language from text (low confidence): ${detected.code} (confidence: ${detected.confidence.toFixed(2)})`,
      );
    }
  }

  // Fallback to English
  if (!detected) {
    detected = createDetectedLanguage('en', 0.5, 'fallback');
    log.info('Proso: Fallback to English');
  }

  // Cache the result
  await cacheLanguage(url, detected);

  return detected;
}

/** Read the persisted language-detection cache (or an empty map). */
async function readLanguageCache(): Promise<Record<string, DetectedLanguage>> {
  const result = await browser.storage.local.get(STORAGE_KEYS.LANGUAGE_CACHE);
  return (
    (result[STORAGE_KEYS.LANGUAGE_CACHE] as Record<string, DetectedLanguage> | undefined) || {}
  );
}

/**
 * Get cached language detection result for a URL
 */
async function getCachedLanguage(url: string): Promise<DetectedLanguage | null> {
  try {
    const cache = await readLanguageCache();
    const cached = cache[url];

    if (!cached) return null;

    // Check if cache is fresh (1 hour TTL)
    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - cached.detectedAt > ONE_HOUR) {
      return null;
    }

    return cached;
  } catch (error) {
    log.warn('Proso: Failed to read language cache', { error });
    return null;
  }
}

/**
 * Cache a language detection result
 */
async function cacheLanguage(url: string, detected: DetectedLanguage): Promise<void> {
  try {
    const cache = await readLanguageCache();

    // Limit cache size (max 100 entries)
    const urls = Object.keys(cache);
    if (urls.length >= 100) {
      // Remove oldest 20 entries
      const sorted = urls.sort((a, b) => (cache[a].detectedAt || 0) - (cache[b].detectedAt || 0));
      sorted.slice(0, 20).forEach((oldUrl) => delete cache[oldUrl]);
    }

    cache[url] = detected;
    await browser.storage.local.set({ [STORAGE_KEYS.LANGUAGE_CACHE]: cache });
  } catch (error) {
    log.warn('Proso: Failed to cache language', { error });
  }
}

/**
 * Get current language state for a tab
 */
async function getLanguageState(_tabId: number): Promise<LanguageState> {
  const result = await browser.storage.local.get([
    STORAGE_KEYS.DETECTED_LANGUAGE,
    STORAGE_KEYS.LANGUAGE_PREFERENCE,
  ]);

  const detected: DetectedLanguage | null =
    (result[STORAGE_KEYS.DETECTED_LANGUAGE] as DetectedLanguage | undefined) || null;
  const preference: LanguagePreference = (result[STORAGE_KEYS.LANGUAGE_PREFERENCE] as
    | LanguagePreference
    | undefined) || {
    autoDetect: true,
    currentOverride: null,
    voicePreferences: {},
  };

  const effective = preference.currentOverride || detected?.primaryCode || 'en';

  return {
    detected,
    override: preference.currentOverride,
    effective,
    autoDetect: preference.autoDetect,
  };
}

/**
 * Read the persisted language preference (auto-detect + overrides), or the
 * default shape when nothing is stored yet.
 */
async function readLanguagePreference(): Promise<LanguagePreference> {
  const result = await browser.storage.local.get(STORAGE_KEYS.LANGUAGE_PREFERENCE);
  return (
    (result[STORAGE_KEYS.LANGUAGE_PREFERENCE] as LanguagePreference | undefined) || {
      autoDetect: true,
      currentOverride: null,
      voicePreferences: {},
    }
  );
}

/**
 * Set language override for current session
 */
async function setLanguageOverride(languageCode: string): Promise<void> {
  const preference = await readLanguagePreference();

  preference.currentOverride = languageCode;

  await browser.storage.local.set({
    [STORAGE_KEYS.LANGUAGE_PREFERENCE]: preference,
  });

  log.info(`Proso: Language override set to: ${languageCode}`);
}

/**
 * Clear language override (return to auto-detect)
 */
async function clearLanguageOverride(): Promise<void> {
  const preference = await readLanguagePreference();

  preference.currentOverride = null;

  await browser.storage.local.set({
    [STORAGE_KEYS.LANGUAGE_PREFERENCE]: preference,
  });

  log.info('Proso: Language override cleared');
}

/**
 * Store detected language for the current page
 */
async function storeDetectedLanguage(detected: DetectedLanguage): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.DETECTED_LANGUAGE]: detected,
  });
}

/**
 * Setup tab navigation listener to clear override on cross-domain URL change
 * Only clears language override when navigating to a different domain
 */
function setupNavigationListener(): void {
  // Track previous URLs per tab for hostname comparison
  const tabUrls = new Map<number, string>();

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
    // Only process URL changes (actual navigation)
    if (changeInfo.url) {
      try {
        const newUrl = new URL(changeInfo.url);
        const previousUrl = tabUrls.get(tabId);

        // Update tracked URL for this tab
        tabUrls.set(tabId, changeInfo.url);

        // Same-domain navigation preserves override
        if (previousUrl) {
          try {
            const oldUrl = new URL(previousUrl);
            if (newUrl.hostname === oldUrl.hostname) {
              // Same domain - don't clear override
              return;
            }
          } catch {
            // Previous URL parse failed - treat as cross-domain
          }
        }

        // Cross-domain navigation - clear override if exists
        const result = await browser.storage.local.get(STORAGE_KEYS.LANGUAGE_PREFERENCE);
        const preference: LanguagePreference | undefined = result[
          STORAGE_KEYS.LANGUAGE_PREFERENCE
        ] as LanguagePreference | undefined;

        if (preference?.currentOverride) {
          log.info('Proso: Cross-domain navigation, clearing language override');
          await clearLanguageOverride();
        }
      } catch (error) {
        // URL parsing failed - log but don't clear
        log.warn('Proso: URL parsing failed in navigation listener', { error });
      }
    }
  });

  // Clean up tracked URLs when tabs are closed
  browser.tabs.onRemoved.addListener((tabId) => {
    tabUrls.delete(tabId);
  });

  log.info('Proso: Language navigation listener registered');
}
