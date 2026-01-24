// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Language Message Handlers
 * Handles language detection and override messages
 * 048-multilingual-tts-pillar: Implemented handlers with delegation to detector.ts
 *
 * @module utils/messaging/handlers/language
 */

import type { VoxPageProtocol } from '../protocol';
import type {
  LanguageDetectParams,
  LanguageGetStateParams,
  LanguageSetOverrideParams,
} from '../types';
import {
  languageDetectParamsSchema,
  languageGetStateParamsSchema,
  languageSetOverrideParamsSchema,
} from '../schemas';
import {
  detectLanguage,
  getLanguageState,
  setLanguageOverride,
  clearLanguageOverride,
  clearLanguageCache,
  storeDetectedLanguage,
} from '../../language/detector';
import type { HandlerRegistry } from '../../../handlers/registry';

/**
 * Detect language handler
 * Delegates to detectLanguage() from detector.ts
 */
export async function handleLanguageDetect(
  params: LanguageDetectParams,
): Promise<VoxPageProtocol['language.detect']['response']> {
  const validated = languageDetectParamsSchema.parse(params);

  const detected = await detectLanguage({
    metadata: validated.metadata ?? null,
    textSample: validated.textSample ?? '',
    url: validated.url,
  });

  // Store the detected language for future reference
  await storeDetectedLanguage(detected);

  return {
    code: detected.primaryCode,
    confidence: detected.confidence,
    source: detected.source,
    isReliable: detected.isReliable,
  };
}

/**
 * Get language state handler
 * Delegates to getLanguageState() from detector.ts
 */
export async function handleLanguageGetState(
  params: LanguageGetStateParams,
): Promise<VoxPageProtocol['language.getState']['response']> {
  const validated = languageGetStateParamsSchema.parse(params);

  const state = await getLanguageState(validated.tabId);

  return {
    detected: state.detected
      ? {
          code: state.detected.primaryCode,
          confidence: state.detected.confidence,
          source: state.detected.source,
        }
      : null,
    override: state.override,
    effective: state.effective,
    autoDetect: state.autoDetect,
  };
}

/**
 * Set language override handler
 * Delegates to setLanguageOverride() from detector.ts
 */
export async function handleLanguageSetOverride(
  params: LanguageSetOverrideParams,
): Promise<VoxPageProtocol['language.setOverride']['response']> {
  const validated = languageSetOverrideParamsSchema.parse(params);

  await setLanguageOverride(validated.languageCode);

  return {
    success: true,
    languageCode: validated.languageCode,
  };
}

/**
 * Clear language override handler
 * Delegates to clearLanguageOverride() from detector.ts
 */
export async function handleLanguageClearOverride(): Promise<
  VoxPageProtocol['language.clearOverride']['response']
> {
  await clearLanguageOverride();

  return {
    success: true,
  };
}

/**
 * Re-detect language handler
 * Clears cache and override, then triggers fresh detection from content script
 */
export async function handleLanguageRedetect(): Promise<
  VoxPageProtocol['language.redetect']['response']
> {
  try {
    // Clear all language cache and override
    await clearLanguageCache();
    await clearLanguageOverride();

    // Clear stored detected language
    await browser.storage.local.remove('detectedLanguage');

    console.log('VoxPage: Language cache cleared, triggering re-detection');

    // Send message to active tab's content script to re-detect language
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      try {
        await browser.tabs.sendMessage(activeTab.id, { action: 'extractLanguage' });
        console.log('VoxPage: Sent extractLanguage to content script');

        // Wait for detection to complete
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Get the new detected language
        const result = await browser.storage.local.get('detectedLanguage');
        const detected = result.detectedLanguage as
          | {
              primaryCode?: string;
              code?: string;
              confidence?: number;
              source?: 'metadata' | 'text' | 'fallback';
            }
          | undefined;

        return {
          success: true,
          code: detected?.primaryCode || detected?.code,
          confidence: detected?.confidence,
          source: detected?.source,
        };
      } catch (err) {
        console.warn('VoxPage: Could not send to content script:', err);
        // Still return success - cache was cleared
        return { success: true };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('VoxPage: Re-detect language failed:', error);
    return { success: false };
  }
}

/**
 * Register all language handlers on the given registry
 * 048-multilingual-tts-pillar: Handler registration function
 */
export function registerLanguageHandlers(registry: HandlerRegistry): void {
  registry.register(
    'language.detect',
    handleLanguageDetect,
    'Detect page language from metadata and text content',
  );

  registry.register(
    'language.getState',
    handleLanguageGetState,
    'Get current language state for a tab',
  );

  registry.register(
    'language.setOverride',
    handleLanguageSetOverride,
    'Set manual language override',
  );

  registry.register(
    'language.clearOverride',
    handleLanguageClearOverride,
    'Clear language override and return to auto-detect',
  );

  registry.register(
    'language.redetect',
    handleLanguageRedetect,
    'Clear language cache and re-detect page language',
  );

  console.log('VoxPage: Language handlers registered');
}
