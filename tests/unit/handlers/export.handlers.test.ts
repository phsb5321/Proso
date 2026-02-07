// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for export message handlers.
 *
 * Tests all four export handlers registered via registerExportHandlers:
 *   - export.start
 *   - export.cancel
 *   - export.getProgress
 *   - export.download
 *
 * @module tests/unit/handlers/export.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Dynamic imports (no mocks needed — handlers use injectable dependencies)
// ---------------------------------------------------------------------------

const {
  registerExportHandlers,
  setExportDependencies,
  clearActiveJobs,
  getActiveJobs,
} = await import('../../../src/handlers/export.handlers');
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

function createMockDependencies() {
  return {
    generateAudio: jest.fn<
      (req: { text: string; provider: string; voice?: string; speed: number }) => Promise<{
        audioUrl?: string;
        success?: boolean;
        error?: string;
      }>
    >(),
    downloadFile: jest.fn<(url: string, filename: string) => Promise<void>>(),
    encodeToMp3: jest.fn<
      (blobs: Blob[]) => Promise<{ blob: Blob; durationMs: number; sizeBytes: number }>
    >(),
    createAudioUrl: jest.fn<(blob: Blob) => Promise<string>>(),
    revokeAudioUrl: jest.fn<(url: string | null) => void>(),
    saveExportHistory: jest.fn<
      (entry: {
        jobId: string;
        completedAt: number;
        fileSize: number;
        durationMs: number;
        filename: string;
      }) => Promise<void>
    >(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('export.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockDeps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerExportHandlers(registry);
    clearActiveJobs();
    mockDeps = createMockDependencies();
    setExportDependencies(mockDeps);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all four export handlers', () => {
      expect(registry.has('export.start')).toBe(true);
      expect(registry.has('export.cancel')).toBe(true);
      expect(registry.has('export.getProgress')).toBe(true);
      expect(registry.has('export.download')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // export.start
  // -----------------------------------------------------------------------

  describe('export.start', () => {
    it('should start a new export job successfully', async () => {
      const result = (await dispatchOk(registry, 'export.start', {
        jobId: 'job-1',
        paragraphs: [{ index: 0, text: 'Hello world' }],
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean; jobId: string };

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-1');
      expect(getActiveJobs().has('job-1')).toBe(true);
    });

    it('should reject duplicate job IDs', async () => {
      await dispatchOk(registry, 'export.start', {
        jobId: 'job-dup',
        paragraphs: [{ index: 0, text: 'Hello' }],
        provider: 'elevenlabs',
        speed: 1.0,
      });

      const result = (await dispatchOk(registry, 'export.start', {
        jobId: 'job-dup',
        paragraphs: [{ index: 0, text: 'Hello again' }],
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should reject missing jobId', async () => {
      const result = (await dispatchOk(registry, 'export.start', {
        paragraphs: [{ index: 0, text: 'Hello' }],
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('jobId');
    });

    it('should reject empty paragraphs array', async () => {
      const result = (await dispatchOk(registry, 'export.start', {
        jobId: 'job-empty',
        paragraphs: [],
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('paragraphs');
    });

    it('should reject missing paragraphs', async () => {
      const result = (await dispatchOk(registry, 'export.start', {
        jobId: 'job-no-para',
        provider: 'elevenlabs',
        speed: 1.0,
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // export.cancel
  // -----------------------------------------------------------------------

  describe('export.cancel', () => {
    it('should cancel an existing job', async () => {
      await dispatchOk(registry, 'export.start', {
        jobId: 'job-cancel',
        paragraphs: [{ index: 0, text: 'Hello' }],
        provider: 'elevenlabs',
        speed: 1.0,
      });

      const result = (await dispatchOk(registry, 'export.cancel', {
        jobId: 'job-cancel',
      })) as { success: boolean; wasCancelled: boolean };

      expect(result.success).toBe(true);
      expect(result.wasCancelled).toBe(true);
      expect(getActiveJobs().has('job-cancel')).toBe(false);
    });

    it('should return false for non-existent job', async () => {
      const result = (await dispatchOk(registry, 'export.cancel', {
        jobId: 'non-existent',
      })) as { success: boolean; wasCancelled: boolean };

      expect(result.success).toBe(false);
      expect(result.wasCancelled).toBe(false);
    });

    it('should return false for missing jobId', async () => {
      const result = (await dispatchOk(registry, 'export.cancel', {})) as {
        success: boolean;
        wasCancelled: boolean;
      };

      expect(result.success).toBe(false);
      expect(result.wasCancelled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // export.getProgress
  // -----------------------------------------------------------------------

  describe('export.getProgress', () => {
    it('should return progress for an existing job', async () => {
      await dispatchOk(registry, 'export.start', {
        jobId: 'job-progress',
        paragraphs: [
          { index: 0, text: 'P1' },
          { index: 1, text: 'P2' },
        ],
        provider: 'elevenlabs',
        speed: 1.0,
      });

      const result = (await dispatchOk(registry, 'export.getProgress', {
        jobId: 'job-progress',
      })) as {
        status: string;
        totalParagraphs: number;
        percentComplete: number;
      };

      expect(result.totalParagraphs).toBe(2);
      expect(typeof result.percentComplete).toBe('number');
    });

    it('should return error for non-existent job', async () => {
      const result = (await dispatchOk(registry, 'export.getProgress', {
        jobId: 'non-existent',
      })) as { status: string; error?: string };

      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    });

    it('should return error for missing jobId', async () => {
      const result = (await dispatchOk(registry, 'export.getProgress', {})) as {
        status: string;
        error?: string;
      };

      expect(result.status).toBe('error');
      expect(result.error).toContain('jobId');
    });
  });

  // -----------------------------------------------------------------------
  // export.download
  // -----------------------------------------------------------------------

  describe('export.download', () => {
    it('should return error for non-existent job', async () => {
      const result = (await dispatchOk(registry, 'export.download', {
        jobId: 'non-existent',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('not ready');
    });

    it('should return error for pending job (not complete)', async () => {
      await dispatchOk(registry, 'export.start', {
        jobId: 'job-pending',
        paragraphs: [{ index: 0, text: 'Hello' }],
        provider: 'elevenlabs',
        speed: 1.0,
      });

      const result = (await dispatchOk(registry, 'export.download', {
        jobId: 'job-pending',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('not ready');
    });

    it('should download a completed job', async () => {
      // Manually set up a completed job
      const jobs = getActiveJobs();
      jobs.set('job-done', {
        id: 'job-done',
        status: 'complete',
        currentParagraph: 1,
        totalParagraphs: 1,
        blobUrl: 'blob:mock-url',
        cancelled: false,
      });

      mockDeps.downloadFile.mockResolvedValue(undefined);
      mockDeps.saveExportHistory.mockResolvedValue(undefined);

      const result = (await dispatchOk(registry, 'export.download', {
        jobId: 'job-done',
        filename: 'test.mp3',
      })) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockDeps.downloadFile).toHaveBeenCalledWith('blob:mock-url', 'test.mp3');
      expect(mockDeps.saveExportHistory).toHaveBeenCalled();
    });

    it('should handle download failure', async () => {
      const jobs = getActiveJobs();
      jobs.set('job-fail', {
        id: 'job-fail',
        status: 'complete',
        currentParagraph: 1,
        totalParagraphs: 1,
        blobUrl: 'blob:mock-url',
        cancelled: false,
      });

      mockDeps.downloadFile.mockRejectedValue(new Error('Download failed'));

      const result = (await dispatchOk(registry, 'export.download', {
        jobId: 'job-fail',
      })) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });

    it('should return error for missing jobId', async () => {
      const result = (await dispatchOk(registry, 'export.download', {})) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('jobId');
    });
  });
});
