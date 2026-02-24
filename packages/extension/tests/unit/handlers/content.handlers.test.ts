// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for content message handlers.
 *
 * Tests all four content handlers registered via registerContentHandlers:
 *   - content.extract
 *   - content.extractWithScore
 *   - content.score
 *   - content.isAvailable
 *
 * @module tests/unit/handlers/content.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic imports)
// ---------------------------------------------------------------------------

const mockExtract = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockExtractWithScore = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockScoreContent = jest.fn<(...args: unknown[]) => unknown>();

const mockService = {
  extract: mockExtract,
  extractWithScore: mockExtractWithScore,
  scoreContent: mockScoreContent,
};

const mockGetContentExtractionService = jest.fn(() => mockService);
const mockIsContentExtractionServiceAvailable = jest.fn(() => true);

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getContentExtractionService: mockGetContentExtractionService,
  isContentExtractionServiceAvailable: mockIsContentExtractionServiceAvailable,
}));

// Dynamic imports after mocks are wired
const { registerContentHandlers } = await import('../../../src/handlers/content.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch a handler and unwrap the outer registry Result envelope. */
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

/** Sample paragraphs returned by the mock extraction service. */
const sampleParagraphs = [
  { index: 0, text: 'First paragraph of content.', wordCount: 4 },
  { index: 1, text: 'Second paragraph with more words here.', wordCount: 6 },
];

/** Sample extraction result from the mock service. */
const sampleExtractionResult = {
  title: 'Test Article',
  paragraphs: sampleParagraphs,
  extractorId: 'readability',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('content.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerContentHandlers(registry);

    // Reset all mocks to defaults
    jest.clearAllMocks();
    mockIsContentExtractionServiceAvailable.mockReturnValue(true);
    mockGetContentExtractionService.mockReturnValue(mockService);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all four content handlers', () => {
      expect(registry.has('content.extract')).toBe(true);
      expect(registry.has('content.extractWithScore')).toBe(true);
      expect(registry.has('content.score')).toBe(true);
      expect(registry.has('content.isAvailable')).toBe(true);
    });

    it('should register exactly 4 handlers', () => {
      expect(registry.size).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // content.extract
  // -----------------------------------------------------------------------

  describe('content.extract', () => {
    it('should extract content successfully with default article mode', async () => {
      mockExtract.mockResolvedValue({
        ok: true,
        value: sampleExtractionResult,
      });

      const result = (await dispatchOk(registry, 'content.extract', {
        html: '<p>Hello world</p>',
      })) as { ok: boolean; value?: Record<string, unknown> };

      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(true);
      expect(result.value!.title).toBe('Test Article');
      expect(result.value!.paragraphs).toHaveLength(2);
      expect(result.value!.totalParagraphs).toBe(2);
      expect(result.value!.totalWordCount).toBe(10); // 4 + 6
      expect(result.value!.extractorId).toBe('readability');
      expect(result.value!.error).toBeUndefined();
      expect(mockExtract).toHaveBeenCalledWith('<p>Hello world</p>', { mode: 'article' });
    });

    it('should pass explicit mode through to the service', async () => {
      mockExtract.mockResolvedValue({
        ok: true,
        value: sampleExtractionResult,
      });

      await dispatchOk(registry, 'content.extract', {
        html: '<p>text</p>',
        mode: 'full',
      });

      expect(mockExtract).toHaveBeenCalledWith('<p>text</p>', { mode: 'full' });
    });

    it('should return service_unavailable when service is not initialized', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'content.extract', {
        html: '<p>Hello</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('service_unavailable');
      expect(result.error!.message).toContain('not initialized');
    });

    it('should return invalid_params when html is missing', async () => {
      const result = (await dispatchOk(registry, 'content.extract', {})) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return invalid_params when html is not a string', async () => {
      const result = (await dispatchOk(registry, 'content.extract', {
        html: 42,
      })) as { ok: boolean; error?: { type: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return Ok with success=false when service extraction fails', async () => {
      mockExtract.mockResolvedValue({
        ok: false,
        error: { type: 'no_readable_content', message: 'No content found' },
      });

      const result = (await dispatchOk(registry, 'content.extract', {
        html: '<div></div>',
      })) as { ok: boolean; value?: Record<string, unknown> };

      // The handler wraps service errors in Ok({ success: false, ... })
      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(false);
      expect(result.value!.title).toBe('');
      expect(result.value!.paragraphs).toEqual([]);
      expect(result.value!.totalParagraphs).toBe(0);
      expect(result.value!.totalWordCount).toBe(0);
      expect(result.value!.extractorId).toBe('');
      expect(result.value!.error).toBe('No content found');
    });

    it('should return extraction_failed when service throws', async () => {
      mockExtract.mockRejectedValue(new Error('Unexpected parse error'));

      const result = (await dispatchOk(registry, 'content.extract', {
        html: '<p>bad</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('extraction_failed');
      expect(result.error!.message).toBe('Unexpected parse error');
    });

    it('should handle non-Error thrown values', async () => {
      mockExtract.mockRejectedValue('string error');

      const result = (await dispatchOk(registry, 'content.extract', {
        html: '<p>bad</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('extraction_failed');
      expect(result.error!.message).toBe('string error');
    });
  });

  // -----------------------------------------------------------------------
  // content.extractWithScore
  // -----------------------------------------------------------------------

  describe('content.extractWithScore', () => {
    const scoredResult = {
      content: sampleExtractionResult,
      score: 85,
      confidence: 0.92,
    };

    it('should extract content with score successfully', async () => {
      mockExtractWithScore.mockResolvedValue({
        ok: true,
        value: scoredResult,
      });

      const result = (await dispatchOk(registry, 'content.extractWithScore', {
        html: '<article>Good content</article>',
      })) as { ok: boolean; value?: Record<string, unknown> };

      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(true);
      expect(result.value!.title).toBe('Test Article');
      expect(result.value!.paragraphs).toHaveLength(2);
      expect(result.value!.totalParagraphs).toBe(2);
      expect(result.value!.totalWordCount).toBe(10);
      expect(result.value!.extractorId).toBe('readability');
      expect(result.value!.score).toBe(85);
      expect(result.value!.confidence).toBe(0.92);
      expect(result.value!.error).toBeUndefined();
    });

    it('should pass explicit mode through to the service', async () => {
      mockExtractWithScore.mockResolvedValue({
        ok: true,
        value: scoredResult,
      });

      await dispatchOk(registry, 'content.extractWithScore', {
        html: '<p>text</p>',
        mode: 'selection',
      });

      expect(mockExtractWithScore).toHaveBeenCalledWith('<p>text</p>', { mode: 'selection' });
    });

    it('should use default article mode when mode is omitted', async () => {
      mockExtractWithScore.mockResolvedValue({
        ok: true,
        value: scoredResult,
      });

      await dispatchOk(registry, 'content.extractWithScore', {
        html: '<p>text</p>',
      });

      expect(mockExtractWithScore).toHaveBeenCalledWith('<p>text</p>', { mode: 'article' });
    });

    it('should return service_unavailable when service is not initialized', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'content.extractWithScore', {
        html: '<p>Hello</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('service_unavailable');
      expect(result.error!.message).toContain('not initialized');
    });

    it('should return invalid_params when html is missing', async () => {
      const result = (await dispatchOk(
        registry,
        'content.extractWithScore',
        {},
      )) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return Ok with success=false when service extraction fails', async () => {
      mockExtractWithScore.mockResolvedValue({
        ok: false,
        error: { type: 'no_readable_content', message: 'Empty page' },
      });

      const result = (await dispatchOk(registry, 'content.extractWithScore', {
        html: '<div></div>',
      })) as { ok: boolean; value?: Record<string, unknown> };

      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(false);
      expect(result.value!.score).toBe(0);
      expect(result.value!.confidence).toBe(0);
      expect(result.value!.error).toBe('Empty page');
    });

    it('should return extraction_failed when service throws', async () => {
      mockExtractWithScore.mockRejectedValue(new Error('Score computation failed'));

      const result = (await dispatchOk(registry, 'content.extractWithScore', {
        html: '<p>bad</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('extraction_failed');
      expect(result.error!.message).toBe('Score computation failed');
    });
  });

  // -----------------------------------------------------------------------
  // content.score
  // -----------------------------------------------------------------------

  describe('content.score', () => {
    it('should score content successfully', async () => {
      mockScoreContent.mockReturnValue({ score: 72, confidence: 0.88 });

      const result = (await dispatchOk(registry, 'content.score', {
        html: '<article><p>Quality content here.</p></article>',
      })) as { ok: boolean; value?: { success: boolean; score: number; confidence: number } };

      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(true);
      expect(result.value!.score).toBe(72);
      expect(result.value!.confidence).toBe(0.88);
    });

    it('should return service_unavailable when service is not initialized', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'content.score', {
        html: '<p>Hello</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('service_unavailable');
      expect(result.error!.message).toContain('not initialized');
    });

    it('should return invalid_params when html is missing', async () => {
      const result = (await dispatchOk(registry, 'content.score', {})) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return invalid_params when html is empty string', async () => {
      const result = (await dispatchOk(registry, 'content.score', {
        html: '',
      })) as { ok: boolean; error?: { type: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return extraction_failed when scoreContent throws', async () => {
      mockScoreContent.mockImplementation(() => {
        throw new Error('DOM parsing failure');
      });

      const result = (await dispatchOk(registry, 'content.score', {
        html: '<p>broken</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('extraction_failed');
      expect(result.error!.message).toBe('DOM parsing failure');
    });

    it('should handle non-Error thrown values in scoreContent', async () => {
      mockScoreContent.mockImplementation(() => {
        throw 'unexpected failure';
      });

      const result = (await dispatchOk(registry, 'content.score', {
        html: '<p>broken</p>',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('extraction_failed');
      expect(result.error!.message).toBe('unexpected failure');
    });
  });

  // -----------------------------------------------------------------------
  // content.isAvailable
  // -----------------------------------------------------------------------

  describe('content.isAvailable', () => {
    it('should return available=true when service is initialized', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(true);

      const result = (await dispatchOk(
        registry,
        'content.isAvailable',
        undefined,
      )) as { ok: boolean; value?: { available: boolean } };

      expect(result.ok).toBe(true);
      expect(result.value!.available).toBe(true);
    });

    it('should return available=false when service is not initialized', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = (await dispatchOk(
        registry,
        'content.isAvailable',
        undefined,
      )) as { ok: boolean; value?: { available: boolean } };

      expect(result.ok).toBe(true);
      expect(result.value!.available).toBe(false);
    });

    it('should not require any parameters', async () => {
      mockIsContentExtractionServiceAvailable.mockReturnValue(true);

      const outer = await registry.dispatch('content.isAvailable', undefined);
      expect(outer.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Dispatch integration
  // -----------------------------------------------------------------------

  describe('dispatch integration', () => {
    it('should return not_found for unregistered handler', async () => {
      const result = await registry.dispatch('content.nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
      }
    });

    it('should isolate handler registrations per registry instance', () => {
      const freshRegistry = new HandlerRegistry();
      expect(freshRegistry.has('content.extract')).toBe(false);

      registerContentHandlers(freshRegistry);
      expect(freshRegistry.has('content.extract')).toBe(true);
    });
  });
});
