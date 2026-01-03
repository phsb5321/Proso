/**
 * VoxPage Configuration Schema
 * Plain JavaScript validation (no npm dependencies for browser extension)
 *
 * @module shared/config/schema
 * @description Validates configuration values against defined constraints.
 * Invalid values are reset to defaults with console warning (FR-005a).
 */

import { defaults, constraints, MODES, PROVIDERS } from './defaults.js';

/**
 * Validate a mode value
 * @param {*} value
 * @returns {string} Valid mode or default
 */
function validateMode(value) {
  if (MODES.includes(value)) {
    return value;
  }
  console.warn(`Invalid mode "${value}", using default: ${defaults.mode}`);
  return defaults.mode;
}

/**
 * Validate a provider value
 * @param {*} value
 * @returns {string} Valid provider or default
 */
function validateProvider(value) {
  if (PROVIDERS.includes(value)) {
    return value;
  }
  console.warn(`Invalid provider "${value}", using default: ${defaults.provider}`);
  return defaults.provider;
}

/**
 * Validate speed value
 * @param {*} value
 * @returns {number} Valid speed or default
 */
function validateSpeed(value) {
  const num = parseFloat(value);
  if (!isNaN(num) && num >= constraints.speed.min && num <= constraints.speed.max) {
    return num;
  }
  console.warn(`Invalid speed "${value}", using default: ${defaults.speed}`);
  return defaults.speed;
}

/**
 * Validate boolean value
 * @param {*} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function validateBoolean(value, defaultValue) {
  if (typeof value === 'boolean') {
    return value;
  }
  return defaultValue;
}

/**
 * Validate voice value (string or null)
 * @param {*} value
 * @returns {string|null}
 */
function validateVoice(value) {
  if (value === null || typeof value === 'string') {
    return value;
  }
  return defaults.voice;
}

/**
 * Validate max cache size
 * @param {*} value
 * @returns {number}
 */
function validateMaxCacheSize(value) {
  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= constraints.maxCacheSize.min && num <= constraints.maxCacheSize.max) {
    return num;
  }
  return defaults.maxCacheSize;
}

/**
 * Validate and parse settings with defaults
 * @param {Object} data - Raw settings object
 * @returns {{ success: boolean, data: Object }}
 */
export function validateSettings(data) {
  const input = data || {};

  const validated = {
    mode: validateMode(input.mode),
    provider: validateProvider(input.provider),
    voice: validateVoice(input.voice),
    speed: validateSpeed(input.speed),
    showCostEstimate: validateBoolean(input.showCostEstimate, defaults.showCostEstimate),
    cacheEnabled: validateBoolean(input.cacheEnabled, defaults.cacheEnabled),
    maxCacheSize: validateMaxCacheSize(input.maxCacheSize),
    wordSyncEnabled: validateBoolean(input.wordSyncEnabled, defaults.wordSyncEnabled),
    autoDetectLanguage: validateBoolean(input.autoDetectLanguage, defaults.autoDetectLanguage),
  };

  return { success: true, data: validated };
}

/**
 * Validate a single setting value
 * @param {string} key - Setting key
 * @param {*} value - Value to validate
 * @returns {{ success: boolean, data?: *, error?: Error }}
 */
export function validateSetting(key, value) {
  const validators = {
    mode: validateMode,
    provider: validateProvider,
    voice: validateVoice,
    speed: validateSpeed,
    showCostEstimate: (v) => validateBoolean(v, defaults.showCostEstimate),
    cacheEnabled: (v) => validateBoolean(v, defaults.cacheEnabled),
    maxCacheSize: validateMaxCacheSize,
    wordSyncEnabled: (v) => validateBoolean(v, defaults.wordSyncEnabled),
    autoDetectLanguage: (v) => validateBoolean(v, defaults.autoDetectLanguage),
  };

  if (!(key in validators)) {
    return { success: false, error: new Error(`Unknown setting: ${key}`) };
  }

  return { success: true, data: validators[key](value) };
}

/**
 * Get the default value for a setting key
 * @param {string} key - Setting key
 * @returns {*} Default value
 */
export function getDefaultForKey(key) {
  if (key in defaults) {
    return defaults[key];
  }
  return undefined;
}

/**
 * Valid detection source values for language detection
 */
const DETECTION_SOURCES = ['metadata', 'text', 'user'];

/**
 * Validate DetectedLanguage object (019-multilingual-tts)
 * @param {Object} data - Raw detected language object
 * @returns {{ success: boolean, data?: Object, error?: Error }}
 */
export function validateDetectedLanguage(data) {
  if (!data || typeof data !== 'object') {
    return { success: false, error: new Error('DetectedLanguage must be an object') };
  }

  // Validate required fields
  if (typeof data.code !== 'string' || data.code.length < 2 || data.code.length > 10) {
    return { success: false, error: new Error('Invalid language code') };
  }

  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    return { success: false, error: new Error('Confidence must be between 0 and 1') };
  }

  if (!DETECTION_SOURCES.includes(data.source)) {
    return { success: false, error: new Error('Invalid detection source') };
  }

  if (typeof data.isReliable !== 'boolean') {
    return { success: false, error: new Error('isReliable must be boolean') };
  }

  if (typeof data.primaryCode !== 'string' || data.primaryCode.length < 2 || data.primaryCode.length > 3) {
    return { success: false, error: new Error('Invalid primary language code') };
  }

  if (typeof data.detectedAt !== 'number') {
    return { success: false, error: new Error('detectedAt must be a timestamp') };
  }

  return {
    success: true,
    data: {
      code: data.code,
      confidence: data.confidence,
      source: data.source,
      isReliable: data.isReliable,
      primaryCode: data.primaryCode,
      detectedAt: data.detectedAt
    }
  };
}

/**
 * Validate LanguagePreference object (019-multilingual-tts)
 * @param {Object} data - Raw language preference object
 * @returns {{ success: boolean, data: Object }}
 */
export function validateLanguagePreference(data) {
  const input = data || {};

  const validated = {
    autoDetect: typeof input.autoDetect === 'boolean' ? input.autoDetect : true,
    currentOverride: typeof input.currentOverride === 'string' ? input.currentOverride : null,
    voicePreferences: typeof input.voicePreferences === 'object' && input.voicePreferences !== null
      ? input.voicePreferences
      : {}
  };

  return { success: true, data: validated };
}

export default { validateSettings, validateSetting, getDefaultForKey, validateDetectedLanguage, validateLanguagePreference };
