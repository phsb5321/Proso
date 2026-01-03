/**
 * VoxPage Language Detector
 * Detects page language from metadata and text content using CLD3
 *
 * @module background/language-detector
 * @description Core language detection infrastructure for multilingual TTS.
 * Combines HTML lang attribute with CLD3 text detection for accuracy.
 */

import { StorageKey } from './constants.js';
import { normalizeLanguageCode, isLanguageSupported } from '../shared/language-codes.js';
import { validateDetectedLanguage } from '../shared/config/schema.js';

/**
 * CLD3 instance (lazy-loaded)
 * @type {Object|null}
 */
let cldInstance = null;

/**
 * CLD3 loading state
 * @type {Promise|null}
 */
let cldLoadPromise = null;

/**
 * Initialize CLD3 language detector
 * Lazy-loads the WASM module on first use
 * @returns {Promise<Object>} CLD3 instance
 */
export async function initCLD() {
  if (cldInstance) {
    return cldInstance;
  }

  if (cldLoadPromise) {
    return cldLoadPromise;
  }

  cldLoadPromise = (async () => {
    try {
      const { CLD3 } = await import('cld3-asm');
      cldInstance = await CLD3.create();
      console.log('VoxPage: CLD3 language detector initialized');
      return cldInstance;
    } catch (error) {
      console.error('VoxPage: Failed to initialize CLD3:', error);
      cldLoadPromise = null;
      throw error;
    }
  })();

  return cldLoadPromise;
}

/**
 * Detect language from text content using CLD3
 * @param {string} text - Text to analyze (ideally 100-500 chars)
 * @returns {Promise<{code: string, confidence: number, isReliable: boolean}|null>}
 */
export async function detectLanguageFromText(text) {
  if (!text || text.trim().length < 20) {
    return null;
  }

  try {
    const cld = await initCLD();
    // Use first 500 characters for detection
    const sample = text.slice(0, 500);
    const result = cld.findLanguage(sample);

    if (!result || !result.language || result.language === 'und') {
      return null;
    }

    return {
      code: result.language,
      confidence: result.probability || 0,
      isReliable: result.is_reliable || result.probability >= 0.9
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
 * T034: Setup tab navigation listener to clear override on URL change
 * (019-multilingual-tts)
 */
export function setupNavigationListener() {
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only clear on URL changes (actual navigation)
    if (changeInfo.url) {
      try {
        const result = await browser.storage.local.get(StorageKey.LANGUAGE_PREFERENCE);
        const preference = result[StorageKey.LANGUAGE_PREFERENCE];

        // Only clear if there's an active override
        if (preference?.currentOverride) {
          console.log('VoxPage: Navigation detected, clearing language override');
          await clearLanguageOverride();
        }
      } catch (error) {
        console.warn('VoxPage: Failed to clear language override on navigation:', error);
      }
    }
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
