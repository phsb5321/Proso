// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Provider Message Handlers
 * Handles TTS provider management messages
 *
 * @module utils/messaging/handlers/provider
 */

import type { VoxPageProtocol } from '../protocol';
import type { ProviderSelectParams, ProviderValidateLanguageSupportParams } from '../types';
import {
  providerSelectParamsSchema,
  providerValidateLanguageSupportParamsSchema,
} from '../schemas';

/**
 * Select provider handler
 */
export async function handleProviderSelect(
  params: ProviderSelectParams,
): Promise<VoxPageProtocol['provider.select']['response']> {
  const validated = providerSelectParamsSchema.parse(params);

  // TODO Phase 4: Delegate to ProviderRegistry.setCurrentProvider()

  return {
    success: true,
    providerId: validated.providerId,
  };
}

/**
 * Get provider list handler
 */
export async function handleProviderGetList(): Promise<
  VoxPageProtocol['provider.getList']['response']
> {
  // TODO Phase 4: Delegate to ProviderRegistry.getAllProviders()

  return {
    providers: [
      { id: 'elevenlabs', name: 'ElevenLabs', requiresApiKey: true, supportsWordTiming: true },
      { id: 'browser', name: 'Browser TTS', requiresApiKey: false, supportsWordTiming: false },
    ],
  };
}

/**
 * Validate language support handler
 */
export async function handleProviderValidateLanguageSupport(
  params: ProviderValidateLanguageSupportParams,
): Promise<VoxPageProtocol['provider.validateLanguageSupport']['response']> {
  const validated = providerValidateLanguageSupportParamsSchema.parse(params);

  // TODO Phase 4: Delegate to providerSupportsLanguage()

  return {
    supported: true,
    alternativeProviders: [],
  };
}
