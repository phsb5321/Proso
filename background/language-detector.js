/**
 * VoxPage Language Detector
 * Detects page language from metadata and text content using franc-min
 *
 * @module background/language-detector
 * @description Core language detection infrastructure for multilingual TTS.
 * Combines HTML lang attribute with franc-min text detection for accuracy.
 * Updated to use franc-min (pure JavaScript) instead of CLD3 (WASM).
 */

import { StorageKey } from './constants.js';
import { normalizeLanguageCode, isLanguageSupported } from '../shared/language-codes.js';
import { validateDetectedLanguage } from '../shared/config/schema.js';

// franc-min is imported dynamically to match the existing lazy-load pattern
let francModule = null;
let francLoadPromise = null;

/**
 * ISO 639-3 to ISO 639-1 mapping
 * franc-min returns 3-letter codes, we need 2-letter codes
 */
const ISO6393_TO_ISO6391 = {
  eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it',
  por: 'pt', pol: 'pl', tur: 'tr', rus: 'ru', nld: 'nl',
  ces: 'cs', arb: 'ar', cmn: 'zh', hun: 'hu', kor: 'ko',
  jpn: 'ja', hin: 'hi', swe: 'sv', ind: 'id', ukr: 'uk',
  ell: 'el', fin: 'fi', ron: 'ro', dan: 'da', bul: 'bg',
  zsm: 'ms', slk: 'sk', hrv: 'hr', tam: 'ta', fil: 'fil',
};

/**
 * Initialize franc-min language detector
 * Lazy-loads the module on first use
 * @returns {Promise<Function>} franc function
 */
export async function initCLD() {
  if (francModule) {
    return francModule;
  }

  if (francLoadPromise) {
    return francLoadPromise;
  }

  francLoadPromise = (async () => {
    try {
      const mod = await import('franc-min');
      francModule = mod.franc;
      console.log('VoxPage: franc-min language detector initialized');
      return francModule;
    } catch (error) {
      console.error('VoxPage: Failed to initialize franc-min:', error);
      francLoadPromise = null;
      throw error;
    }
  })();

  return francLoadPromise;
}

/**
 * Detect language from text content using franc-min
 * @param {string} text - Text to analyze (ideally 100-500 chars)
 * @returns {Promise<{code: string, confidence: number, isReliable: boolean}|null>}
 */
export async function detectLanguageFromText(text) {
  if (!text || text.trim().length < 20) {
    return null;
  }

  try {
    const franc = await initCLD();
    // Use first 500 characters for detection
    const sample = text.slice(0, 500);

    // franc returns ISO 639-3 (3-letter) codes
    // Returns 'und' for undetermined
    const iso6393 = franc(sample, { minLength: 20 });

    if (!iso6393 || iso6393 === 'und') {
      return null;
    }

    // Map ISO 639-3 to ISO 639-1 (2-letter) codes
    const iso6391 = ISO6393_TO_ISO6391[iso6393] || iso6393.slice(0, 2);

    // franc doesn't provide confidence scores, estimate based on text length
    // Longer text = higher confidence, max 0.95
    const confidence = Math.min(0.7 + (sample.length / 1000) * 0.25, 0.95);

    return {
      code: iso6391,
      confidence,
      isReliable: confidence >= 0.9
    };
  } catch (error) {
    console.error('VoxPage: Text language detection failed:', error);
    return null;
  }
}

/**
 * Create a DetectedLanguage object
 * @param {string} code - Language code
 * @param {number} confidence - Confidence score (0-1)
 * @param {'metadata'|'text'|'user'} source - Detection source
 * @returns {Object} DetectedLanguage object
 */
function createDetectedLanguage(code, confidence, source) {
  const primaryCode = normalizeLanguageCode(code);
  const isReliable = confidence >= 0.9 || source === 'metadata' || source === 'user';

  return {
    code,
    confidence,
    source,
    isReliable,
    primaryCode,
    detectedAt: Date.now()
  };
}

/**
 * Detect language combining metadata and text analysis (FR-011)
 * Priority: user override > text detection (if confident) > metadata > fallback
 *
 * @param {Object} params - Detection parameters
 * @param {string|null} params.metadata - HTML lang attribute value
 * @param {string} params.textSample - Text sample for detection
 * @param {string} params.url - Page URL for caching
 * @returns {Promise<Object>} DetectedLanguage object
 */
export async function detectLanguage({ metadata, textSample, url }) {
  // Check cache first
  const cached = await getCachedLanguage(url);
  if (cached) {
    console.log(`VoxPage: Using cached language for ${url}: ${cached.code}`);
    return cached;
  }

  let detected = null;

  // Try text detection first (FR-011: prefer text if confidence > 90%)
  if (textSample && textSample.length >= 50) {
    const textResult = await detectLanguageFromText(textSample);
    if (textResult && textResult.confidence >= 0.9) {
      detected = createDetectedLanguage(
        textResult.code,
        textResult.confidence,
        'text'
      );
      console.log(`VoxPage: Detected language from text: ${detected.code} (confidence: ${detected.confidence.toFixed(2)})`);
    }
  }

  // Use metadata if text detection failed or was not confident
  if (!detected && metadata) {
    const primary = normalizeLanguageCode(metadata);
    if (isLanguageSupported(primary)) {
      detected = createDetectedLanguage(metadata, 1.0, 'metadata');
      console.log(`VoxPage: Using metadata language: ${detected.code}`);
    }
  }

  // Try text detection even if not highly confident
  if (!detected && textSample && textSample.length >= 50) {
    const textResult = await detectLanguageFromText(textSample);
    if (textResult && textResult.confidence >= 0.5) {
      detected = createDetectedLanguage(
        textResult.code,
        textResult.confidence,
        'text'
      );
      console.log(`VoxPage: Detected language from text (low confidence): ${detected.code} (confidence: ${detected.confidence.toFixed(2)})`);
    }
  }

  // Fallback to English (FR-009)
  if (!detected) {
    detected = createDetectedLanguage('en', 0.5, 'text');
    console.log('VoxPage: Fallback to English');
  }

  // Cache the result
  await cacheLanguage(url, detected);

  return detected;
}

/**
 * Get cached language detection result for a URL
 * @param {string} url - Page URL
 * @returns {Promise<Object|null>}
 */
async function getCachedLanguage(url) {
  try {
    const result = await browser.storage.local.get(StorageKey.LANGUAGE_CACHE);
    const cache = result[StorageKey.LANGUAGE_CACHE] || {};
    const cached = cache[url];

    if (!cached) return null;

    // Check if cache is fresh (1 hour TTL)
    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - cached.detectedAt > ONE_HOUR) {
      return null;
    }

    // Validate the cached data
    const validation = validateDetectedLanguage(cached);
    return validation.success ? validation.data : null;
  } catch (error) {
    console.warn('VoxPage: Failed to read language cache:', error);
    return null;
  }
}

/**
 * Cache a language detection result
 * @param {string} url - Page URL
 * @param {Object} detected - DetectedLanguage object
 */
async function cacheLanguage(url, detected) {
  try {
    const result = await browser.storage.local.get(StorageKey.LANGUAGE_CACHE);
    const cache = result[StorageKey.LANGUAGE_CACHE] || {};

    // Limit cache size (max 100 entries)
    const urls = Object.keys(cache);
    if (urls.length >= 100) {
      // Remove oldest entries
      const sorted = urls.sort((a, b) =>
        (cache[a].detectedAt || 0) - (cache[b].detectedAt || 0)
      );
      sorted.slice(0, 20).forEach(oldUrl => delete cache[oldUrl]);
    }

    cache[url] = detected;
    await browser.storage.local.set({ [StorageKey.LANGUAGE_CACHE]: cache });
  } catch (error) {
    console.warn('VoxPage: Failed to cache language:', error);
  }
}

/**
 * Get current language state for a tab
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} Language state
 */
export async function getLanguageState(tabId) {
  const result = await browser.storage.local.get([
    StorageKey.DETECTED_LANGUAGE,
    StorageKey.LANGUAGE_PREFERENCE
  ]);

  const detected = result[StorageKey.DETECTED_LANGUAGE] || null;
  const preference = result[StorageKey.LANGUAGE_PREFERENCE] || {
    autoDetect: true,
    currentOverride: null,
    voicePreferences: {}
  };

  const effective = preference.currentOverride || detected?.primaryCode || 'en';

  return {
    detected,
    override: preference.currentOverride,
    effective,
    autoDetect: preference.autoDetect
  };
}

/**
 * Set language override for current session
 * @param {string} languageCode - ISO 639-1 language code
 */
export async function setLanguageOverride(languageCode) {
  const result = await browser.storage.local.get(StorageKey.LANGUAGE_PREFERENCE);
  const preference = result[StorageKey.LANGUAGE_PREFERENCE] || {
    autoDetect: true,
    currentOverride: null,
    voicePreferences: {}
  };

  preference.currentOverride = languageCode;

  await browser.storage.local.set({
    [StorageKey.LANGUAGE_PREFERENCE]: preference
  });

  console.log(`VoxPage: Language override set to: ${languageCode}`);
}

/**
 * Clear language override (return to auto-detect)
 */
export async function clearLanguageOverride() {
  const result = await browser.storage.local.get(StorageKey.LANGUAGE_PREFERENCE);
  const preference = result[StorageKey.LANGUAGE_PREFERENCE] || {
    autoDetect: true,
    currentOverride: null,
    voicePreferences: {}
  };

  preference.currentOverride = null;

  await browser.storage.local.set({
    [StorageKey.LANGUAGE_PREFERENCE]: preference
  });

  console.log('VoxPage: Language override cleared');
}

/**
 * Store detected language for the current page
 * @param {Object} detected - DetectedLanguage object
 */
export async function storeDetectedLanguage(detected) {
  await browser.storage.local.set({
    [StorageKey.DETECTED_LANGUAGE]: detected
  });
}

/**
 * T034: Setup tab navigation listener to clear override on cross-domain URL change
 * (019-multilingual-tts, 020-code-quality-fix)
 *
 * Only clears language override when navigating to a different domain.
 * Same-domain navigation (e.g., Wikipedia article to Wikipedia article) preserves override.
 */
export function setupNavigationListener() {
  // Track previous URLs per tab for hostname comparison
  const tabUrls = new Map();

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only process URL changes (actual navigation)
    if (changeInfo.url) {
      try {
        // 020-code-quality-fix: Only clear on cross-domain navigation
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
        const result = await browser.storage.local.get(StorageKey.LANGUAGE_PREFERENCE);
        const preference = result[StorageKey.LANGUAGE_PREFERENCE];

        if (preference?.currentOverride) {
          console.log('VoxPage: Cross-domain navigation, clearing language override');
          await clearLanguageOverride();
        }
      } catch (error) {
        // URL parsing failed - log but don't clear
        console.warn('VoxPage: URL parsing failed in navigation listener:', error);
      }
    }
  });

  // Clean up tracked URLs when tabs are closed
  browser.tabs.onRemoved.addListener((tabId) => {
    tabUrls.delete(tabId);
  });

  console.log('VoxPage: Language navigation listener registered');
}

export default {
  initCLD,
  detectLanguageFromText,
  detectLanguage,
  getLanguageState,
  setLanguageOverride,
  clearLanguageOverride,
  storeDetectedLanguage,
  setupNavigationListener
};
