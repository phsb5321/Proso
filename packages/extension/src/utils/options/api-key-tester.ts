// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * API Key Tester Utility
 * Tests API keys by making minimal validation requests to each provider
 *
 * @module utils/options/api-key-tester
 * @description FR-023 - API key validation with feedback
 */

import { browser } from 'wxt/browser';
import { createLogger } from '../logging/logger';

const log = createLogger('options');

export interface TestResult {
  success: boolean;
  provider: string;
  message: string;
  latencyMs?: number;
}

/**
 * Test an API key by sending a message to the background script
 * The actual API calls are made from the background context to avoid CORS issues
 */
export async function testApiKey(provider: string, apiKey: string): Promise<TestResult> {
  const startTime = performance.now();

  try {
    // Send test request to background script
    const response = await browser.runtime.sendMessage({
      type: 'settings.testApiKey',
      data: {
        provider,
        apiKey,
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);

    // Debug: trace the response from the background script
    log.debug('[ApiKeyTester] Response from background', {
      response: JSON.stringify(response, null, 2),
      responseType: typeof response,
      success: response?.success,
      keys: response ? Object.keys(response) : 'null/undefined',
    });

    if (response && response.success) {
      return {
        success: true,
        provider,
        message: response.message || `Valid! (${latencyMs}ms)`,
        latencyMs,
      };
    } else {
      return {
        success: false,
        provider,
        message: response?.error || 'Invalid API key',
        latencyMs,
      };
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : 'Test failed';
    return {
      success: false,
      provider,
      message,
      latencyMs,
    };
  }
}

/**
 * Test all configured API keys
 */
async function testAllApiKeys(keys: Record<string, string>): Promise<Record<string, TestResult>> {
  const results: Record<string, TestResult> = {};

  const testPromises = Object.entries(keys)
    .filter(([_, apiKey]) => apiKey && apiKey.trim().length > 0)
    .map(async ([provider, apiKey]) => {
      const result = await testApiKey(provider, apiKey);
      results[provider] = result;
    });

  await Promise.all(testPromises);

  return results;
}

/**
 * Storage key mappings for each provider
 */
const API_KEY_STORAGE_KEYS: Record<string, string> = {
  elevenlabs: 'elevenlabsApiKey',
  openai: 'openaiApiKey',
  groq: 'groqApiKey',
  cartesia: 'cartesiaApiKey',
  anthropic: 'anthropic:apiKey',
};

/**
 * Load all API keys from storage
 */
export async function loadApiKeys(): Promise<Record<string, string>> {
  const storageKeys = Object.values(API_KEY_STORAGE_KEYS);
  const result = await browser.storage.local.get(storageKeys);

  const keys: Record<string, string> = {};
  for (const [provider, storageKey] of Object.entries(API_KEY_STORAGE_KEYS)) {
    keys[provider] = (result[storageKey] as string) || '';
  }

  return keys;
}

/**
 * Save an API key to storage
 */
export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  const storageKey = API_KEY_STORAGE_KEYS[provider];
  if (!storageKey) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  await browser.storage.local.set({
    [storageKey]: apiKey.trim(),
  });
}
