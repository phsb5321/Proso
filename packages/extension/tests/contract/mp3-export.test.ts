/**
 * Contract tests for MP3 Export Message Protocol
 * Verifies message format matches ProsoProtocol specification
 *
 * @module tests/contract/mp3-export.test
 * @description API contract tests for MP3 export feature (US2)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ProsoProtocol } from '../../src/utils/messaging/protocol';
import { ROADMAP_STORAGE_KEYS } from '../../src/utils/config/schema';

// Mock browser APIs before importing handlers
const mockBrowser = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true, audioUrl: 'blob:test' } as never),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({} as never),
      set: jest.fn().mockResolvedValue(undefined as never),
    },
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1 as never),
  },
};

(globalThis as unknown as { browser: typeof mockBrowser }).browser = mockBrowser;

// Mock URL
const mockURL = {
  createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
  revokeObjectURL: jest.fn(),
};
(globalThis as unknown as { URL: typeof mockURL }).URL = mockURL;

// Mock fetch
const mockFetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    blob: () => Promise.resolve(new Blob([], { type: 'audio/mpeg' })),
  })
);
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// Mock lamejs
const mockEncodeBuffer = jest.fn().mockReturnValue(new Int8Array([0x49, 0x44, 0x33]));
const mockFlush = jest.fn().mockReturnValue(new Int8Array([0xff, 0xfb]));
jest.mock('lamejs', () => ({
  Mp3Encoder: jest.fn().mockImplementation(() => ({
    encodeBuffer: mockEncodeBuffer,
    flush: mockFlush,
  })),
}));

import {
  handleExportStart,
  handleExportCancel,
  handleExportGetProgress,
  handleExportDownload,
} from '../../src/utils/messaging/handlers/export';

describe('MP3 Export Message Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('export.start', () => {
    it('request must have required fields', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'export-123',
        paragraphs: [
          { index: 0, text: 'First paragraph' },
          { index: 1, text: 'Second paragraph' },
        ],
        provider: 'elevenlabs',
        voice: 'alloy',
        speed: 1.0,
        quality: '192',
      };

      expect(request.jobId).toBeDefined();
      expect(typeof request.jobId).toBe('string');
      expect(request.paragraphs).toBeDefined();
      expect(Array.isArray(request.paragraphs)).toBe(true);
      expect(request.provider).toBeDefined();
      expect(request.quality).toBeDefined();
    });

    it('paragraphs must have index and text', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'export-123',
        paragraphs: [
          { index: 0, text: 'First paragraph' },
          { index: 1, text: 'Second paragraph' },
        ],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '128',
      };

      request.paragraphs.forEach((p) => {
        expect(typeof p.index).toBe('number');
        expect(typeof p.text).toBe('string');
        expect(p.text.length).toBeGreaterThan(0);
      });
    });

    it('quality must be valid option', () => {
      const validQualities = ['128', '192', '256'];
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'export-123',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      expect(validQualities).toContain(request.quality);
    });

    it('response must have success and jobId', async () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: `export-unique-${Date.now()}`,
        paragraphs: [{ index: 0, text: 'Test paragraph' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      const response = await handleExportStart(request);

      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
      expect(response).toHaveProperty('jobId');
      expect(typeof response.jobId).toBe('string');
    });

    it('response should include error on failure', async () => {
      const jobId = `duplicate-job-${Date.now()}`;
      const request: ProsoProtocol['export.start']['request'] = {
        jobId,
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      // First call succeeds
      await handleExportStart(request);

      // Second call with same ID should fail
      const response = await handleExportStart(request);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
    });
  });

  describe('export.cancel', () => {
    it('request must have jobId', () => {
      const request: ProsoProtocol['export.cancel']['request'] = {
        jobId: 'export-123',
      };

      expect(request.jobId).toBeDefined();
      expect(typeof request.jobId).toBe('string');
    });

    it('response must have success and wasCancelled', async () => {
      const jobId = `cancel-test-${Date.now()}`;

      // First start a job
      await handleExportStart({
        jobId,
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportCancel({ jobId });

      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
      expect(response).toHaveProperty('wasCancelled');
      expect(typeof response.wasCancelled).toBe('boolean');
    });

    it('should return wasCancelled false for non-existent job', async () => {
      const response = await handleExportCancel({
        jobId: 'non-existent-job',
      });

      expect(response.success).toBe(false);
      expect(response.wasCancelled).toBe(false);
    });
  });

  describe('export.getProgress', () => {
    it('request must have jobId', () => {
      const request: ProsoProtocol['export.getProgress']['request'] = {
        jobId: 'export-123',
      };

      expect(request.jobId).toBeDefined();
      expect(typeof request.jobId).toBe('string');
    });

    it('response must have required progress fields', async () => {
      const jobId = `progress-test-${Date.now()}`;

      // Start a job first
      await handleExportStart({
        jobId,
        paragraphs: [
          { index: 0, text: 'First' },
          { index: 1, text: 'Second' },
        ],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportGetProgress({ jobId });

      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('currentParagraph');
      expect(response).toHaveProperty('totalParagraphs');
      expect(response).toHaveProperty('percentComplete');
    });

    it('status must be valid ExportJobStatus', async () => {
      const jobId = `status-test-${Date.now()}`;

      await handleExportStart({
        jobId,
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportGetProgress({ jobId });

      const validStatuses = ['pending', 'generating', 'encoding', 'complete', 'error'];
      expect(validStatuses).toContain(response.status);
    });

    it('percentComplete must be 0-100', async () => {
      const jobId = `percent-test-${Date.now()}`;

      await handleExportStart({
        jobId,
        paragraphs: [
          { index: 0, text: 'First' },
          { index: 1, text: 'Second' },
        ],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportGetProgress({ jobId });

      expect(response.percentComplete).toBeGreaterThanOrEqual(0);
      expect(response.percentComplete).toBeLessThanOrEqual(100);
    });

    it('should return error status for non-existent job', async () => {
      const response = await handleExportGetProgress({
        jobId: 'non-existent-job',
      });

      expect(response.status).toBe('error');
      expect(response.error).toBeDefined();
    });

    it('paragraph counts must be non-negative integers', async () => {
      const jobId = `counts-test-${Date.now()}`;

      await handleExportStart({
        jobId,
        paragraphs: [
          { index: 0, text: 'First' },
          { index: 1, text: 'Second' },
          { index: 2, text: 'Third' },
        ],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportGetProgress({ jobId });

      expect(Number.isInteger(response.currentParagraph)).toBe(true);
      expect(Number.isInteger(response.totalParagraphs)).toBe(true);
      expect(response.currentParagraph).toBeGreaterThanOrEqual(0);
      expect(response.totalParagraphs).toBeGreaterThanOrEqual(0);
      expect(response.currentParagraph).toBeLessThanOrEqual(response.totalParagraphs);
    });
  });

  describe('export.download', () => {
    it('request must have jobId', () => {
      const request: ProsoProtocol['export.download']['request'] = {
        jobId: 'export-123',
      };

      expect(request.jobId).toBeDefined();
      expect(typeof request.jobId).toBe('string');
    });

    it('request may have optional filename', () => {
      const request: ProsoProtocol['export.download']['request'] = {
        jobId: 'export-123',
        filename: 'my-article.mp3',
      };

      expect(request.filename).toBeDefined();
      expect(typeof request.filename).toBe('string');
      expect(request.filename?.endsWith('.mp3')).toBe(true);
    });

    it('response must have success', async () => {
      const response = await handleExportDownload({
        jobId: 'non-existent-job',
      });

      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
    });

    it('should return error when job not complete', async () => {
      const jobId = `incomplete-download-${Date.now()}`;

      // Start a job but don't wait for completion
      await handleExportStart({
        jobId,
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      });

      const response = await handleExportDownload({ jobId });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Export History Storage Contract', () => {
    it('export history key must match schema', () => {
      expect(ROADMAP_STORAGE_KEYS.EXPORT_HISTORY).toBe('export:history');
    });

    it('export history entry must have required fields', () => {
      const historyEntry = {
        jobId: 'export-123',
        completedAt: Date.now(),
        fileSize: 1048576,
        durationMs: 60000,
        filename: 'article.mp3',
      };

      expect(historyEntry).toHaveProperty('jobId');
      expect(historyEntry).toHaveProperty('completedAt');
      expect(historyEntry).toHaveProperty('fileSize');
      expect(historyEntry).toHaveProperty('durationMs');
      expect(historyEntry).toHaveProperty('filename');

      expect(typeof historyEntry.jobId).toBe('string');
      expect(typeof historyEntry.completedAt).toBe('number');
      expect(typeof historyEntry.fileSize).toBe('number');
      expect(typeof historyEntry.durationMs).toBe('number');
      expect(typeof historyEntry.filename).toBe('string');
    });

    it('completedAt must be valid timestamp', () => {
      const now = Date.now();
      const historyEntry = {
        jobId: 'export-123',
        completedAt: now,
        fileSize: 1048576,
        durationMs: 60000,
        filename: 'article.mp3',
      };

      // Should be after year 2020
      expect(historyEntry.completedAt).toBeGreaterThan(1577836800000);
      // Should be before year 2100
      expect(historyEntry.completedAt).toBeLessThan(4102444800000);
    });

    it('fileSize must be positive', () => {
      const historyEntry = {
        jobId: 'export-123',
        completedAt: Date.now(),
        fileSize: 1048576,
        durationMs: 60000,
        filename: 'article.mp3',
      };

      expect(historyEntry.fileSize).toBeGreaterThan(0);
    });

    it('durationMs must be non-negative', () => {
      const historyEntry = {
        jobId: 'export-123',
        completedAt: Date.now(),
        fileSize: 1048576,
        durationMs: 60000,
        filename: 'article.mp3',
      };

      expect(historyEntry.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Quality Settings Contract', () => {
    it('128 kbps is valid quality', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'quality-128',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '128',
      };

      expect(request.quality).toBe('128');
    });

    it('192 kbps is valid quality', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'quality-192',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      expect(request.quality).toBe('192');
    });

    it('256 kbps is valid quality', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'quality-256',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '256',
      };

      expect(request.quality).toBe('256');
    });
  });

  describe('Speed Settings Contract', () => {
    it('speed must be a number', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'speed-test',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.5,
        quality: '192',
      };

      expect(typeof request.speed).toBe('number');
    });

    it('speed should be reasonable range (0.5-2.0)', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'speed-range',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      expect(request.speed).toBeGreaterThanOrEqual(0.5);
      expect(request.speed).toBeLessThanOrEqual(2.0);
    });
  });

  describe('Provider Settings Contract', () => {
    it('provider must be a string', () => {
      const request: ProsoProtocol['export.start']['request'] = {
        jobId: 'provider-test',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      expect(typeof request.provider).toBe('string');
    });

    it('voice is optional', () => {
      const requestWithVoice: ProsoProtocol['export.start']['request'] = {
        jobId: 'voice-test-1',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        voice: 'alloy',
        speed: 1.0,
        quality: '192',
      };

      const requestWithoutVoice: ProsoProtocol['export.start']['request'] = {
        jobId: 'voice-test-2',
        paragraphs: [{ index: 0, text: 'Test' }],
        provider: 'elevenlabs',
        speed: 1.0,
        quality: '192',
      };

      expect(requestWithVoice.voice).toBe('alloy');
      expect(requestWithoutVoice.voice).toBeUndefined();
    });
  });
});
