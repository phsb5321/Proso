// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for summarize message handlers.
 *
 * Tests all three summarize handlers registered via registerSummarizeHandlers:
 *   - summarize.article
 *   - summarize.readSummary
 *   - summarize.getProviderStatus
 *
 * @module tests/unit/handlers/summarize.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const {
  registerSummarizeHandlers,
  setSummarizeDependencies,
} = await import('../../../src/handlers/summarize.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dispatchOk(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
): Promise<unknown> {
  const outer = await registry.dispatch(name, params);
  expect(outer.ok).toBe(true);
  if (!outer.ok) throw new Error('dispatch failed unexpectedly');
  return outer.value;
}

interface SummaryBulletItem {
  text: string;
  importance?: number;
}

function createMockDependencies() {
  return {
    summarize: jest.fn<
      (req: {
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
      }>
    >(),
    sendMessage: jest.fn<(message: { type: string; request: unknown }) => Promise<unknown>>(),
    getProviderConfig: jest.fn<
      (provider: string) => { model: string; apiKeyStorageKey: string } | null
    >(),
    getApiKey: jest.fn<(storageKey: string) => Promise<string | null>>(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('summarize.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockDeps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerSummarizeHandlers(registry);
    mockDeps = createMockDependencies();
    setSummarizeDependencies(mockDeps);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all three summarize handlers', () => {
      expect(registry.has('summarize.article')).toBe(true);
      expect(registry.has('summarize.readSummary')).toBe(true);
      expect(registry.has('summarize.getProviderStatus')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // summarize.article
  // -----------------------------------------------------------------------

  describe('summarize.article', () => {
    it('should summarize article text successfully', async () => {
      const bullets = [
        { text: 'Point 1', importance: 1 },
        { text: 'Point 2', importance: 2 },
      ];
      mockDeps.summarize.mockResolvedValue({
        success: true,
        bullets,
        provider: 'anthropic',
        model: 'claude-3-haiku',
        tokensUsed: 100,
        processingTimeMs: 500,
      });

      const result = (await dispatchOk(registry, 'summarize.article', {
        text: 'This is a long article text that needs summarizing.',
        title: 'Test Article',
        provider: 'anthropic',
        bulletCount: 3,
      })) as {
        success: boolean;
        bullets: SummaryBulletItem[];
        provider: string;
        model?: string;
        processingTimeMs: number;
      };

      expect(result.success).toBe(true);
      expect(result.bullets).toEqual(bullets);
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-haiku');
      expect(mockDeps.summarize).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'This is a long article text that needs summarizing.',
          provider: 'anthropic',
        }),
      );
    });

    it('should return error when text is empty', async () => {
      const result = (await dispatchOk(registry, 'summarize.article', {
        text: '',
        provider: 'anthropic',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('text');
    });

    it('should return error when text is missing', async () => {
      const result = (await dispatchOk(registry, 'summarize.article', {
        provider: 'anthropic',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('text');
    });

    it('should return error when provider is missing', async () => {
      const result = (await dispatchOk(registry, 'summarize.article', {
        text: 'Some text to summarize',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('provider');
    });

    it('should handle summarize failure', async () => {
      mockDeps.summarize.mockResolvedValue({
        success: false,
        bullets: [],
        provider: 'anthropic',
        processingTimeMs: 100,
        error: 'Rate limited',
      });

      const result = (await dispatchOk(registry, 'summarize.article', {
        text: 'Some text',
        provider: 'anthropic',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });

    it('should handle thrown exceptions', async () => {
      mockDeps.summarize.mockRejectedValue(new Error('Network timeout'));

      const result = (await dispatchOk(registry, 'summarize.article', {
        text: 'Some text',
        provider: 'anthropic',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  // -----------------------------------------------------------------------
  // summarize.readSummary
  // -----------------------------------------------------------------------

  describe('summarize.readSummary', () => {
    it('should read summary bullets aloud', async () => {
      mockDeps.sendMessage
        .mockResolvedValueOnce({ success: true }) // audio.generate
        .mockResolvedValueOnce({ success: true }); // playback.start

      const result = (await dispatchOk(registry, 'summarize.readSummary', {
        bullets: [{ text: 'First point' }, { text: 'Second point' }],
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockDeps.sendMessage).toHaveBeenCalledTimes(2);

      // First call: audio.generate
      const firstCall = mockDeps.sendMessage.mock.calls[0][0];
      expect(firstCall.type).toBe('audio.generate');

      // Second call: playback.start
      const secondCall = mockDeps.sendMessage.mock.calls[1][0];
      expect(secondCall.type).toBe('playback.start');
    });

    it('should return error when bullets is empty', async () => {
      const result = (await dispatchOk(registry, 'summarize.readSummary', {
        bullets: [],
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('bullets');
    });

    it('should return error when bullets is missing', async () => {
      const result = (await dispatchOk(registry, 'summarize.readSummary', {})) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
    });

    it('should return error when audio generation fails', async () => {
      mockDeps.sendMessage.mockResolvedValueOnce({
        success: false,
        error: 'TTS unavailable',
      });

      const result = (await dispatchOk(registry, 'summarize.readSummary', {
        bullets: [{ text: 'Test point' }],
        provider: 'elevenlabs',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('TTS unavailable');
    });

    it('should handle thrown exceptions', async () => {
      mockDeps.sendMessage.mockRejectedValue(new Error('Connection lost'));

      const result = (await dispatchOk(registry, 'summarize.readSummary', {
        bullets: [{ text: 'Test' }],
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection lost');
    });
  });

  // -----------------------------------------------------------------------
  // summarize.getProviderStatus
  // -----------------------------------------------------------------------

  describe('summarize.getProviderStatus', () => {
    it('should return available when API key is configured', async () => {
      mockDeps.getProviderConfig.mockReturnValue({
        model: 'claude-3-haiku',
        apiKeyStorageKey: 'anthropic:apiKey',
      });
      mockDeps.getApiKey.mockResolvedValue('sk_test_key');

      const result = (await dispatchOk(registry, 'summarize.getProviderStatus', {
        provider: 'anthropic',
      })) as {
        available: boolean;
        hasApiKey: boolean;
        model?: string;
      };

      expect(result.available).toBe(true);
      expect(result.hasApiKey).toBe(true);
      expect(result.model).toBe('claude-3-haiku');
    });

    it('should return not available when API key is missing', async () => {
      mockDeps.getProviderConfig.mockReturnValue({
        model: 'claude-3-haiku',
        apiKeyStorageKey: 'anthropic:apiKey',
      });
      mockDeps.getApiKey.mockResolvedValue(null);

      const result = (await dispatchOk(registry, 'summarize.getProviderStatus', {
        provider: 'anthropic',
      })) as {
        available: boolean;
        hasApiKey: boolean;
      };

      expect(result.available).toBe(false);
      expect(result.hasApiKey).toBe(false);
    });

    it('should return error for unknown provider', async () => {
      mockDeps.getProviderConfig.mockReturnValue(null);

      const result = (await dispatchOk(registry, 'summarize.getProviderStatus', {
        provider: 'unknown-provider',
      })) as {
        available: boolean;
        error?: string;
      };

      expect(result.available).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('should return error when provider is missing', async () => {
      const result = (await dispatchOk(
        registry,
        'summarize.getProviderStatus',
        {},
      )) as { available: boolean; error?: string };

      expect(result.available).toBe(false);
      expect(result.error).toContain('provider');
    });

    it('should handle thrown exceptions', async () => {
      mockDeps.getProviderConfig.mockImplementation(() => {
        throw new Error('Config read failed');
      });

      const result = (await dispatchOk(registry, 'summarize.getProviderStatus', {
        provider: 'anthropic',
      })) as {
        available: boolean;
        error?: string;
      };

      expect(result.available).toBe(false);
      expect(result.error).toBe('Config read failed');
    });
  });
});
