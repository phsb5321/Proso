// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Summarize Message Handlers for VoxPage
 * Handles AI summarization requests from popup/content
 *
 * @module utils/messaging/handlers/summarize
 */

import type { VoxPageProtocol } from '../protocol';
import { ArticleSummarizer } from '../../ai/summarizer';
import { AI_PROVIDER_CONFIGS } from '../../ai/types';

// Singleton summarizer instance
let summarizer: ArticleSummarizer | null = null;

/**
 * Get or create summarizer instance
 */
function getSummarizer(): ArticleSummarizer {
  if (!summarizer) {
    summarizer = new ArticleSummarizer();
  }
  return summarizer;
}

/**
 * Handle summarize.article message
 * Generates AI summary of article text
 */
export async function handleSummarizeArticle(
  request: VoxPageProtocol['summarize.article']['request'],
): Promise<VoxPageProtocol['summarize.article']['response']> {
  const { text, title, url, provider, bulletCount, outputLanguage } = request;

  try {
    const result = await getSummarizer().summarize({
      text,
      title,
      url,
      provider,
      bulletCount,
      outputLanguage,
    });

    return {
      success: result.success,
      bullets: result.bullets,
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed,
      processingTimeMs: result.processingTimeMs,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      bullets: [],
      provider,
      model: AI_PROVIDER_CONFIGS[provider].model,
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle summarize.readSummary message
 * Reads summary bullets aloud using TTS
 */
export async function handleSummarizeReadSummary(
  request: VoxPageProtocol['summarize.readSummary']['request'],
): Promise<VoxPageProtocol['summarize.readSummary']['response']> {
  const { bullets, provider, voice, speed } = request;

  try {
    // Combine bullets into readable text
    const text = bullets.map((bullet, index) => `Point ${index + 1}: ${bullet.text}`).join('. ');

    // Send to audio generation
    const response = await browser.runtime.sendMessage({
      type: 'audio.generate',
      request: {
        text,
        provider,
        voice,
        speed,
      },
    });

    if (!response?.success) {
      return {
        success: false,
        error: response?.error || 'Failed to generate audio',
      };
    }

    // Start playback
    await browser.runtime.sendMessage({
      type: 'playback.start',
      request: {
        mode: 'selection',
        provider,
        voice,
        speed,
      },
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle summarize.getProviderStatus message
 * Checks if AI provider is configured and available
 */
export async function handleSummarizeGetProviderStatus(
  request: VoxPageProtocol['summarize.getProviderStatus']['request'],
): Promise<VoxPageProtocol['summarize.getProviderStatus']['response']> {
  const { provider } = request;

  try {
    const config = AI_PROVIDER_CONFIGS[provider];
    if (!config) {
      return {
        available: false,
        hasApiKey: false,
        error: `Unknown provider: ${provider}`,
      };
    }

    // Check for API key
    const result = await browser.storage.local.get(config.apiKeyStorageKey);
    const hasApiKey = !!result[config.apiKeyStorageKey];

    return {
      available: hasApiKey,
      hasApiKey,
      model: config.model,
    };
  } catch (error) {
    return {
      available: false,
      hasApiKey: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear the summarizer cache
 */
export function clearSummarizerCache(): void {
  getSummarizer().clearCache();
}

/**
 * Summarize handlers object for registration
 */
export const summarizeHandlers = {
  'summarize.article': handleSummarizeArticle,
  'summarize.readSummary': handleSummarizeReadSummary,
  'summarize.getProviderStatus': handleSummarizeGetProviderStatus,
};
