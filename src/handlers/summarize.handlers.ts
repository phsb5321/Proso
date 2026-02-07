/**
 * Summarize Message Handlers
 *
 * Hexagonal handlers for AI summarization operations.
 * Wraps the existing summarize logic from utils/messaging/handlers/summarize.ts
 * into the hexagonal handler registry pattern.
 *
 * @module handlers/summarize
 */

import type { HandlerRegistry } from './registry';

// ============================================
// Types
// ============================================

/**
 * Summarize handler error type.
 */
export type SummarizeHandlerError =
  | { type: 'invalid_params'; message: string }
  | { type: 'provider_not_available'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Summary bullet item.
 */
export interface SummaryBulletItem {
  text: string;
  importance?: number;
}

/**
 * Response for summarize.article handler.
 */
export interface SummarizeArticleResponse {
  success: boolean;
  bullets: SummaryBulletItem[];
  provider: string;
  model?: string;
  tokensUsed?: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Response for summarize.readSummary handler.
 */
export interface SummarizeReadSummaryResponse {
  success: boolean;
  error?: string;
}

/**
 * Response for summarize.getProviderStatus handler.
 */
export interface SummarizeProviderStatusResponse {
  available: boolean;
  hasApiKey: boolean;
  model?: string;
  error?: string;
}

// ============================================
// Handler Parameters
// ============================================

interface SummarizeArticleParams {
  text: string;
  title?: string;
  url?: string;
  provider: string;
  bulletCount?: number;
  outputLanguage?: string;
}

interface SummarizeReadSummaryParams {
  bullets: SummaryBulletItem[];
  provider?: string;
  voice?: string;
  speed?: number;
}

interface SummarizeGetProviderStatusParams {
  provider: string;
}

// ============================================
// Dependencies (injectable for testing)
// ============================================

export interface SummarizeDependencies {
  summarize: (request: {
    text: string;
    title?: string;
    url?: string;
    provider: string;
    bulletCount?: number;
    outputLanguage?: string;
  }) => Promise<{
    success: boolean;
    bullets: SummaryBulletItem[];
    provider: string;
    model?: string;
    tokensUsed?: number;
    processingTimeMs: number;
    error?: string;
  }>;
  sendMessage: (message: { type: string; request: unknown }) => Promise<unknown>;
  getProviderConfig: (provider: string) => {
    model: string;
    apiKeyStorageKey: string;
  } | null;
  getApiKey: (storageKey: string) => Promise<string | null>;
}

let dependencies: SummarizeDependencies | null = null;

/**
 * Set the summarize dependencies.
 */
export function setSummarizeDependencies(deps: SummarizeDependencies): void {
  dependencies = deps;
}

function getDependencies(): SummarizeDependencies {
  if (!dependencies) {
    throw new Error(
      'Summarize dependencies not initialized. Call setSummarizeDependencies() first.',
    );
  }
  return dependencies;
}

// ============================================
// Handlers
// ============================================

/**
 * Summarize an article's text.
 */
async function handleSummarizeArticle(params: unknown): Promise<SummarizeArticleResponse> {
  const p = params as SummarizeArticleParams;

  if (!p.text || typeof p.text !== 'string' || p.text.trim().length === 0) {
    return {
      success: false,
      bullets: [],
      provider: p.provider ?? '',
      processingTimeMs: 0,
      error: 'text is required',
    };
  }

  if (!p.provider || typeof p.provider !== 'string') {
    return {
      success: false,
      bullets: [],
      provider: '',
      processingTimeMs: 0,
      error: 'provider is required',
    };
  }

  try {
    const deps = getDependencies();
    const result = await deps.summarize({
      text: p.text,
      title: p.title,
      url: p.url,
      provider: p.provider,
      bulletCount: p.bulletCount,
      outputLanguage: p.outputLanguage,
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
      provider: p.provider,
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Read summary bullets aloud using TTS.
 */
async function handleSummarizeReadSummary(params: unknown): Promise<SummarizeReadSummaryResponse> {
  const p = params as SummarizeReadSummaryParams;

  if (!p.bullets || !Array.isArray(p.bullets) || p.bullets.length === 0) {
    return { success: false, error: 'bullets array is required and must not be empty' };
  }

  try {
    const deps = getDependencies();

    // Combine bullets into readable text
    const text = p.bullets.map((bullet, index) => `Point ${index + 1}: ${bullet.text}`).join('. ');

    // Generate audio
    const audioResponse = (await deps.sendMessage({
      type: 'audio.generate',
      request: {
        text,
        provider: p.provider,
        voice: p.voice,
        speed: p.speed ?? 1.0,
      },
    })) as { success?: boolean; error?: string } | null;

    if (!audioResponse?.success) {
      return {
        success: false,
        error: audioResponse?.error || 'Failed to generate audio',
      };
    }

    // Start playback
    await deps.sendMessage({
      type: 'playback.start',
      request: {
        mode: 'selection',
        provider: p.provider,
        voice: p.voice,
        speed: p.speed ?? 1.0,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if an AI provider is configured and available.
 */
async function handleSummarizeGetProviderStatus(
  params: unknown,
): Promise<SummarizeProviderStatusResponse> {
  const p = params as SummarizeGetProviderStatusParams;

  if (!p.provider || typeof p.provider !== 'string') {
    return {
      available: false,
      hasApiKey: false,
      error: 'provider is required',
    };
  }

  try {
    const deps = getDependencies();
    const config = deps.getProviderConfig(p.provider);

    if (!config) {
      return {
        available: false,
        hasApiKey: false,
        error: `Unknown provider: ${p.provider}`,
      };
    }

    const apiKey = await deps.getApiKey(config.apiKeyStorageKey);
    const hasApiKey = !!apiKey;

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

// ============================================
// Registration
// ============================================

/**
 * Register all summarize handlers on the given registry.
 */
export function registerSummarizeHandlers(registry: HandlerRegistry): void {
  registry.register('summarize.article', handleSummarizeArticle, 'Summarize article text');
  registry.register(
    'summarize.readSummary',
    handleSummarizeReadSummary,
    'Read summary bullets aloud',
  );
  registry.register(
    'summarize.getProviderStatus',
    handleSummarizeGetProviderStatus,
    'Check AI provider availability',
  );
}
