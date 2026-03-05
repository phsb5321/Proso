/**
 * Language Message Handlers
 *
 * Hexagonal handlers for language detection and override operations.
 * Implements real language detection using franc-min instead of the
 * legacy stubs that returned hardcoded English defaults.
 *
 * @module handlers/language
 */

import { browser } from 'wxt/browser';
import type { HandlerRegistry } from './registry';
import {
  languageDetectParamsSchema,
  languageGetStateParamsSchema,
  languageSetOverrideParamsSchema,
} from './schemas/language.schemas';

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

export const tabLanguageStates = new Map<number, TabLanguageState>();
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
  const parsed = languageDetectParamsSchema.safeParse(params ?? {});
  if (!parsed.success) {
    // Default to English on validation failure (non-breaking)
    return { code: 'en', confidence: 0.5, source: 'default', isReliable: false };
  }
  const p = parsed.data;

  let result: LanguageDetectResponse;

  // If metadata provides a language code, use it directly
  if (p.metadata && p.metadata.length >= 2) {
    const code = p.metadata.substring(0, 2).toLowerCase();
    result = { code, confidence: 0.9, source: 'metadata', isReliable: true };
  } else if (p.textSample && p.textSample.length >= MIN_DETECTION_TEXT_LENGTH && dependencies) {
    const detectedCode = dependencies.detectLanguage(p.textSample);

    // franc returns 'und' for undetermined
    if (detectedCode && detectedCode !== 'und') {
      const confidence = Math.min(0.95, 0.5 + (p.textSample.length / 1000) * 0.45);
      result = {
        code: detectedCode,
        confidence,
        source: 'detection',
        isReliable: confidence >= MIN_RELIABLE_CONFIDENCE,
      };
    } else {
      result = { code: 'en', confidence: 0.5, source: 'default', isReliable: false };
    }
  } else {
    // Default to English
    result = { code: 'en', confidence: 0.5, source: 'default', isReliable: false };
  }

  // T022: Store detection result in per-tab state
  if (p.__tabId != null) {
    tabLanguageStates.set(p.__tabId, {
      detected: { code: result.code, confidence: result.confidence, source: result.source },
      override: tabLanguageStates.get(p.__tabId)?.override ?? null,
    });
  }

  return result;
}

/**
 * Get language state for a tab.
 */
async function handleLanguageGetState(params: unknown): Promise<LanguageStateResponse> {
  const parsed = languageGetStateParamsSchema.safeParse(params ?? {});
  const tabId = parsed.success ? (parsed.data.tabId ?? 0) : 0;

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
 * Broadcast language state to the active tab's footer.
 */
async function broadcastLanguageToFooter(
  languageCode: string,
  isAutoDetected: boolean,
): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, {
        type: 'FOOTER_LANGUAGE_UPDATE',
        languageCode,
        isAutoDetected,
      });
    }
  } catch {
    // Tab may not have content script — ignore
  }
}

/**
 * Set a language override.
 */
async function handleLanguageSetOverride(params: unknown): Promise<LanguageSetOverrideResponse> {
  const parsed = languageSetOverrideParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, languageCode: '' };
  }

  const code = parsed.data.languageCode.substring(0, 2).toLowerCase();
  globalOverride = code;

  broadcastLanguageToFooter(code, false);

  return { success: true, languageCode: code };
}

/**
 * Clear the language override.
 */
async function handleLanguageClearOverride(): Promise<LanguageClearOverrideResponse> {
  globalOverride = null;

  // Determine effective language from detected state
  let effectiveCode = 'en';
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id) {
      const tabState = tabLanguageStates.get(tab.id);
      effectiveCode = tabState?.detected?.code ?? 'en';
    }
  } catch {
    // Ignore — use default
  }

  broadcastLanguageToFooter(effectiveCode, true);

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
