/**
 * Language Message Handlers
 *
 * Hexagonal handlers for language detection and override operations.
 * Implements real language detection using franc-min instead of the
 * legacy stubs that returned hardcoded English defaults.
 *
 * @module handlers/language
 */

import type { HandlerRegistry } from './registry';

// ============================================
// Types
// ============================================

/**
 * Language detection source type.
 */
type LanguageSource = 'metadata' | 'detection' | 'override' | 'default';

/**
 * Language handler error type.
 */
export type LanguageHandlerError =
  | { type: 'invalid_params'; message: string }
  | { type: 'detection_failed'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response for language.detect handler.
 */
export interface LanguageDetectResponse {
  code: string;
  confidence: number;
  source: LanguageSource;
  isReliable: boolean;
}

/**
 * Response for language.getState handler.
 */
export interface LanguageStateResponse {
  detected: {
    code: string;
    confidence: number;
    source: LanguageSource;
  } | null;
  override: string | null;
  effective: string;
  autoDetect: boolean;
}

/**
 * Response for language.setOverride handler.
 */
export interface LanguageSetOverrideResponse {
  success: boolean;
  languageCode: string;
}

/**
 * Response for language.clearOverride handler.
 */
export interface LanguageClearOverrideResponse {
  success: boolean;
}

// ============================================
// Handler Parameters
// ============================================

interface LanguageDetectParams {
  textSample?: string;
  metadata?: string;
  url?: string;
}

interface LanguageGetStateParams {
  tabId?: number;
}

interface LanguageSetOverrideParams {
  languageCode: string;
}

// ============================================
// State
// ============================================

/**
 * Per-tab language state.
 */
interface TabLanguageState {
  detected: {
    code: string;
    confidence: number;
    source: LanguageSource;
  } | null;
  override: string | null;
}

const tabLanguageStates = new Map<number, TabLanguageState>();
let globalOverride: string | null = null;

/**
 * Clear all language state (for testing).
 */
export function clearLanguageState(): void {
  tabLanguageStates.clear();
  globalOverride = null;
}

// ============================================
// Dependencies (injectable for testing)
// ============================================

export interface LanguageDependencies {
  detectLanguage: (text: string) => string;
}

let dependencies: LanguageDependencies | null = null;

/**
 * Set language dependencies.
 */
export function setLanguageDependencies(deps: LanguageDependencies): void {
  dependencies = deps;
}

/**
 * Get minimum confidence for reliable detection.
 */
const MIN_RELIABLE_CONFIDENCE = 0.7;
const MIN_DETECTION_TEXT_LENGTH = 20;

// ============================================
// Handlers
// ============================================

/**
 * Detect language from text sample or metadata.
 */
async function handleLanguageDetect(params: unknown): Promise<LanguageDetectResponse> {
  const p = params as LanguageDetectParams;

  // If metadata provides a language code, use it directly
  if (p.metadata && typeof p.metadata === 'string' && p.metadata.length >= 2) {
    const code = p.metadata.substring(0, 2).toLowerCase();
    return {
      code,
      confidence: 0.9,
      source: 'metadata',
      isReliable: true,
    };
  }

  // Use text sample for detection
  if (
    p.textSample &&
    typeof p.textSample === 'string' &&
    p.textSample.length >= MIN_DETECTION_TEXT_LENGTH
  ) {
    if (dependencies) {
      const detectedCode = dependencies.detectLanguage(p.textSample);

      // franc returns 'und' for undetermined
      if (detectedCode && detectedCode !== 'und') {
        const confidence = Math.min(0.95, 0.5 + (p.textSample.length / 1000) * 0.45);
        return {
          code: detectedCode,
          confidence,
          source: 'detection',
          isReliable: confidence >= MIN_RELIABLE_CONFIDENCE,
        };
      }
    }
  }

  // Default to English
  return {
    code: 'en',
    confidence: 0.5,
    source: 'default',
    isReliable: false,
  };
}

/**
 * Get language state for a tab.
 */
async function handleLanguageGetState(params: unknown): Promise<LanguageStateResponse> {
  const p = params as LanguageGetStateParams;
  const tabId = p.tabId ?? 0;

  const state = tabLanguageStates.get(tabId);
  const override = globalOverride ?? state?.override ?? null;
  const detected = state?.detected ?? null;
  const effective = override ?? detected?.code ?? 'en';

  return {
    detected,
    override,
    effective,
    autoDetect: !override,
  };
}

/**
 * Set a language override.
 */
async function handleLanguageSetOverride(params: unknown): Promise<LanguageSetOverrideResponse> {
  const p = params as LanguageSetOverrideParams;

  if (!p.languageCode || typeof p.languageCode !== 'string' || p.languageCode.length < 2) {
    return { success: false, languageCode: '' };
  }

  const code = p.languageCode.substring(0, 2).toLowerCase();
  globalOverride = code;

  return { success: true, languageCode: code };
}

/**
 * Clear the language override.
 */
async function handleLanguageClearOverride(): Promise<LanguageClearOverrideResponse> {
  globalOverride = null;
  return { success: true };
}

// ============================================
// Registration
// ============================================

/**
 * Register all language handlers on the given registry.
 */
export function registerLanguageHandlers(registry: HandlerRegistry): void {
  registry.register('language.detect', handleLanguageDetect, 'Detect text language');
  registry.register('language.getState', handleLanguageGetState, 'Get language state for tab');
  registry.register('language.setOverride', handleLanguageSetOverride, 'Set language override');
  registry.register(
    'language.clearOverride',
    handleLanguageClearOverride,
    'Clear language override',
  );
}
