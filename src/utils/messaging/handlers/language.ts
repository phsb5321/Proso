// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Language Message Handlers
 * Handles language detection and override messages
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

/**
 * Detect language handler
 */
export async function handleLanguageDetect(
  params: LanguageDetectParams,
): Promise<VoxPageProtocol['language.detect']['response']> {
  const validated = languageDetectParamsSchema.parse(params);

  // TODO Phase 4: Delegate to detectLanguage()

  return {
    code: 'en',
    confidence: 0.95,
    source: 'metadata',
    isReliable: true,
  };
}

/**
 * Get language state handler
 */
export async function handleLanguageGetState(
  params: LanguageGetStateParams,
): Promise<VoxPageProtocol['language.getState']['response']> {
  const validated = languageGetStateParamsSchema.parse(params);

  // TODO Phase 4: Delegate to getLanguageState()

  return {
    detected: {
      code: 'en',
      confidence: 0.95,
      source: 'metadata',
    },
    override: null,
    effective: 'en',
    autoDetect: true,
  };
}

/**
 * Set language override handler
 */
export async function handleLanguageSetOverride(
  params: LanguageSetOverrideParams,
): Promise<VoxPageProtocol['language.setOverride']['response']> {
  const validated = languageSetOverrideParamsSchema.parse(params);

  // TODO Phase 4: Delegate to setLanguageOverride()

  return {
    success: true,
    languageCode: validated.languageCode,
  };
}

/**
 * Clear language override handler
 */
export async function handleLanguageClearOverride(): Promise<
  VoxPageProtocol['language.clearOverride']['response']
> {
  // TODO Phase 4: Delegate to clearLanguageOverride()

  return {
    success: true,
  };
}
