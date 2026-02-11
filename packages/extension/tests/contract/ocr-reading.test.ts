/**
 * OCR Reading Contract Tests for VoxPage
 * Verifies message contracts for OCR/screenshot reading feature
 *
 * @module tests/contract/ocr-reading.test.ts
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

// ========== Schema Definitions ==========
// These schemas define the message contracts for OCR functionality

// Bounding box schema for word positions
const bboxSchema = z.object({
  x0: z.number().int().nonnegative(),
  y0: z.number().int().nonnegative(),
  x1: z.number().int().nonnegative(),
  y1: z.number().int().nonnegative(),
});

// OCR word result schema
const ocrWordSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(100),
  bbox: bboxSchema,
});

// OCR line result schema
const ocrLineSchema = z.object({
  text: z.string(),
  words: z.array(ocrWordSchema),
  confidence: z.number().min(0).max(100).optional(),
});

// Region selection schema
const regionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

// Language code schema (ISO 639-3)
const languageCodeSchema = z.string().length(3);

// ========== Request Schemas ==========

// ocr.captureAndRead request
const captureAndReadRequestSchema = z.object({
  tabId: z.number().int().positive().optional(),
  region: regionSchema.optional(),
  languages: z.array(languageCodeSchema).default(['eng']),
});

// ocr.processImage request
const processImageRequestSchema = z.object({
  imageData: z.string().min(1),
  format: z.enum(['png', 'jpeg', 'webp']),
  languages: z.array(languageCodeSchema).default(['eng']),
});

// ocr.readExtractedText request
const readExtractedTextRequestSchema = z.object({
  text: z.string().min(1),
  provider: z.enum(['openai', 'elevenlabs', 'groq', 'cartesia', 'browser']),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
});

// ocr.selectRegion request
const selectRegionRequestSchema = z.object({
  tabId: z.number().int().positive(),
});

// ocr.downloadLanguagePack request
const downloadLanguagePackRequestSchema = z.object({
  languageCode: languageCodeSchema,
});

// ========== Response Schemas ==========

// ocr.captureAndRead response
const captureAndReadResponseSchema = z.object({
  success: z.boolean(),
  text: z.string(),
  confidence: z.number().min(0).max(100),
  lines: z.array(ocrLineSchema),
  processingTimeMs: z.number().nonnegative(),
  detectedLanguage: z.string().optional(),
  error: z.string().optional(),
});

// ocr.processImage response (same as captureAndRead)
const processImageResponseSchema = captureAndReadResponseSchema;

// ocr.readExtractedText response
const readExtractedTextResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ocr.selectRegion response
const selectRegionResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ocr.getLanguagePacks response
const languagePackInfoSchema = z.object({
  code: z.string(),
  name: z.string(),
  size: z.number().positive(),
});

const getLanguagePacksResponseSchema = z.object({
  available: z.array(languagePackInfoSchema),
  downloaded: z.array(z.string()),
});

// ocr.downloadLanguagePack response
const downloadLanguagePackResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ========== Storage Schema ==========

const ocrSettingsSchema = z.object({
  defaultLanguages: z.array(z.string()),
  autoDetect: z.boolean(),
  showConfidence: z.boolean(),
});

// ========== Contract Tests ==========

describe('OCR Reading Message Contract', () => {
  describe('ocr.captureAndRead', () => {
    describe('request', () => {
      it('accepts request with no optional fields', () => {
        const request = {
          languages: ['eng'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts request with tabId', () => {
        const request = {
          tabId: 123,
          languages: ['eng'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts request with region', () => {
        const request = {
          region: { x: 100, y: 100, width: 200, height: 150 },
          languages: ['eng'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts multiple languages', () => {
        const request = {
          languages: ['eng', 'fra', 'deu'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(true);
      });

      it('rejects invalid tabId (non-positive)', () => {
        const request = {
          tabId: 0,
          languages: ['eng'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects invalid region (zero width)', () => {
        const request = {
          region: { x: 100, y: 100, width: 0, height: 150 },
          languages: ['eng'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects invalid language code (not 3 chars)', () => {
        const request = {
          languages: ['en'],
        };
        expect(captureAndReadRequestSchema.safeParse(request).success).toBe(false);
      });
    });

    describe('response', () => {
      it('accepts successful response with text', () => {
        const response = {
          success: true,
          text: 'Hello World',
          confidence: 95.5,
          lines: [
            {
              text: 'Hello World',
              words: [
                { text: 'Hello', confidence: 96, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
                { text: 'World', confidence: 95, bbox: { x0: 70, y0: 10, x1: 130, y1: 30 } },
              ],
            },
          ],
          processingTimeMs: 250,
          detectedLanguage: 'eng',
        };
        expect(captureAndReadResponseSchema.safeParse(response).success).toBe(true);
      });

      it('accepts failed response with error', () => {
        const response = {
          success: false,
          text: '',
          confidence: 0,
          lines: [],
          processingTimeMs: 10,
          error: 'Screenshot capture failed',
        };
        expect(captureAndReadResponseSchema.safeParse(response).success).toBe(true);
      });

      it('accepts response with empty text (no OCR results)', () => {
        const response = {
          success: true,
          text: '',
          confidence: 0,
          lines: [],
          processingTimeMs: 500,
        };
        expect(captureAndReadResponseSchema.safeParse(response).success).toBe(true);
      });

      it('rejects confidence > 100', () => {
        const response = {
          success: true,
          text: 'Test',
          confidence: 150,
          lines: [],
          processingTimeMs: 100,
        };
        expect(captureAndReadResponseSchema.safeParse(response).success).toBe(false);
      });

      it('rejects negative processingTimeMs', () => {
        const response = {
          success: true,
          text: 'Test',
          confidence: 80,
          lines: [],
          processingTimeMs: -1,
        };
        expect(captureAndReadResponseSchema.safeParse(response).success).toBe(false);
      });
    });
  });

  describe('ocr.processImage', () => {
    describe('request', () => {
      it('accepts valid PNG image request', () => {
        const request = {
          imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
          format: 'png',
          languages: ['eng'],
        };
        expect(processImageRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts valid JPEG image request', () => {
        const request = {
          imageData: '/9j/4AAQSkZJRgABAQAAAQABAAD...',
          format: 'jpeg',
          languages: ['eng'],
        };
        expect(processImageRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts valid WebP image request', () => {
        const request = {
          imageData: 'UklGRhwAAABXRUJQVlA4TA...',
          format: 'webp',
          languages: ['eng'],
        };
        expect(processImageRequestSchema.safeParse(request).success).toBe(true);
      });

      it('rejects empty imageData', () => {
        const request = {
          imageData: '',
          format: 'png',
          languages: ['eng'],
        };
        expect(processImageRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects invalid format', () => {
        const request = {
          imageData: 'somedata',
          format: 'gif',
          languages: ['eng'],
        };
        expect(processImageRequestSchema.safeParse(request).success).toBe(false);
      });
    });

    describe('response', () => {
      it('response matches captureAndRead response schema', () => {
        const response = {
          success: true,
          text: 'Extracted text',
          confidence: 88.5,
          lines: [],
          processingTimeMs: 300,
        };
        expect(processImageResponseSchema.safeParse(response).success).toBe(true);
      });
    });
  });

  describe('ocr.readExtractedText', () => {
    describe('request', () => {
      it('accepts valid request with required fields', () => {
        const request = {
          text: 'Text to read aloud',
          provider: 'openai',
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts request with all optional fields', () => {
        const request = {
          text: 'Text to read aloud',
          provider: 'elevenlabs',
          voice: 'Rachel',
          speed: 1.2,
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(true);
      });

      it('accepts all valid providers', () => {
        const providers = ['openai', 'elevenlabs', 'groq', 'cartesia', 'browser'];
        providers.forEach((provider) => {
          const request = { text: 'Test', provider };
          expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(true);
        });
      });

      it('rejects empty text', () => {
        const request = {
          text: '',
          provider: 'browser',
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects invalid provider', () => {
        const request = {
          text: 'Test',
          provider: 'invalid_provider',
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects speed below 0.5', () => {
        const request = {
          text: 'Test',
          provider: 'browser',
          speed: 0.3,
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(false);
      });

      it('rejects speed above 2.0', () => {
        const request = {
          text: 'Test',
          provider: 'browser',
          speed: 2.5,
        };
        expect(readExtractedTextRequestSchema.safeParse(request).success).toBe(false);
      });
    });

    describe('response', () => {
      it('accepts successful response', () => {
        const response = { success: true };
        expect(readExtractedTextResponseSchema.safeParse(response).success).toBe(true);
      });

      it('accepts failed response with error', () => {
        const response = {
          success: false,
          error: 'TTS provider unavailable',
        };
        expect(readExtractedTextResponseSchema.safeParse(response).success).toBe(true);
      });
    });
  });

  describe('ocr.selectRegion', () => {
    describe('request', () => {
      it('accepts valid tabId', () => {
        const request = { tabId: 123 };
        expect(selectRegionRequestSchema.safeParse(request).success).toBe(true);
      });

      it('rejects non-positive tabId', () => {
        expect(selectRegionRequestSchema.safeParse({ tabId: 0 }).success).toBe(false);
        expect(selectRegionRequestSchema.safeParse({ tabId: -1 }).success).toBe(false);
      });

      it('rejects non-integer tabId', () => {
        expect(selectRegionRequestSchema.safeParse({ tabId: 1.5 }).success).toBe(false);
      });
    });

    describe('response', () => {
      it('accepts successful response', () => {
        expect(selectRegionResponseSchema.safeParse({ success: true }).success).toBe(true);
      });

      it('accepts failed response with error', () => {
        const response = {
          success: false,
          error: 'Content script not loaded',
        };
        expect(selectRegionResponseSchema.safeParse(response).success).toBe(true);
      });
    });
  });

  describe('ocr.getLanguagePacks', () => {
    describe('response', () => {
      it('accepts valid response with available and downloaded packs', () => {
        const response = {
          available: [
            { code: 'eng', name: 'English', size: 4500000 },
            { code: 'fra', name: 'French', size: 4200000 },
            { code: 'deu', name: 'German', size: 4300000 },
          ],
          downloaded: ['eng'],
        };
        expect(getLanguagePacksResponseSchema.safeParse(response).success).toBe(true);
      });

      it('accepts empty downloaded list', () => {
        const response = {
          available: [
            { code: 'eng', name: 'English', size: 4500000 },
          ],
          downloaded: [],
        };
        expect(getLanguagePacksResponseSchema.safeParse(response).success).toBe(true);
      });

      it('accepts multiple downloaded languages', () => {
        const response = {
          available: [],
          downloaded: ['eng', 'fra', 'deu'],
        };
        expect(getLanguagePacksResponseSchema.safeParse(response).success).toBe(true);
      });

      it('rejects invalid size (zero)', () => {
        const response = {
          available: [
            { code: 'eng', name: 'English', size: 0 },
          ],
          downloaded: [],
        };
        expect(getLanguagePacksResponseSchema.safeParse(response).success).toBe(false);
      });

      it('rejects missing code in available pack', () => {
        const response = {
          available: [
            { name: 'English', size: 4500000 },
          ],
          downloaded: [],
        };
        expect(getLanguagePacksResponseSchema.safeParse(response).success).toBe(false);
      });
    });
  });

  describe('ocr.downloadLanguagePack', () => {
    describe('request', () => {
      it('accepts valid 3-letter language code', () => {
        expect(downloadLanguagePackRequestSchema.safeParse({ languageCode: 'fra' }).success).toBe(true);
        expect(downloadLanguagePackRequestSchema.safeParse({ languageCode: 'deu' }).success).toBe(true);
        expect(downloadLanguagePackRequestSchema.safeParse({ languageCode: 'jpn' }).success).toBe(true);
      });

      it('rejects 2-letter language code', () => {
        expect(downloadLanguagePackRequestSchema.safeParse({ languageCode: 'en' }).success).toBe(false);
      });

      it('rejects 4-letter language code', () => {
        expect(downloadLanguagePackRequestSchema.safeParse({ languageCode: 'engl' }).success).toBe(false);
      });
    });

    describe('response', () => {
      it('accepts successful response', () => {
        expect(downloadLanguagePackResponseSchema.safeParse({ success: true }).success).toBe(true);
      });

      it('accepts failed response with error', () => {
        const response = {
          success: false,
          error: 'Network error: Failed to download',
        };
        expect(downloadLanguagePackResponseSchema.safeParse(response).success).toBe(true);
      });
    });
  });
});

describe('OCR Storage Contract', () => {
  describe('ocr:languagePacks', () => {
    it('stores array of language codes', () => {
      const languagePacksSchema = z.array(z.string());
      const data = ['eng', 'fra', 'deu'];
      expect(languagePacksSchema.safeParse(data).success).toBe(true);
    });

    it('default value is ["eng"]', () => {
      const defaultValue = ['eng'];
      expect(Array.isArray(defaultValue)).toBe(true);
      expect(defaultValue).toContain('eng');
    });
  });

  describe('ocr:settings', () => {
    it('accepts valid settings object', () => {
      const settings = {
        defaultLanguages: ['eng', 'fra'],
        autoDetect: true,
        showConfidence: false,
      };
      expect(ocrSettingsSchema.safeParse(settings).success).toBe(true);
    });

    it('requires all fields', () => {
      const incomplete = {
        defaultLanguages: ['eng'],
        autoDetect: true,
        // missing showConfidence
      };
      expect(ocrSettingsSchema.safeParse(incomplete).success).toBe(false);
    });

    it('accepts empty defaultLanguages array', () => {
      const settings = {
        defaultLanguages: [],
        autoDetect: true,
        showConfidence: true,
      };
      expect(ocrSettingsSchema.safeParse(settings).success).toBe(true);
    });
  });
});

describe('OCR Bounding Box Contract', () => {
  it('accepts valid bounding box', () => {
    const bbox = { x0: 10, y0: 20, x1: 100, y1: 50 };
    expect(bboxSchema.safeParse(bbox).success).toBe(true);
  });

  it('accepts zero coordinates', () => {
    const bbox = { x0: 0, y0: 0, x1: 100, y1: 50 };
    expect(bboxSchema.safeParse(bbox).success).toBe(true);
  });

  it('rejects negative coordinates', () => {
    const bbox = { x0: -10, y0: 20, x1: 100, y1: 50 };
    expect(bboxSchema.safeParse(bbox).success).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    const bbox = { x0: 10.5, y0: 20, x1: 100, y1: 50 };
    expect(bboxSchema.safeParse(bbox).success).toBe(false);
  });

  it('x0 can be greater than x1 (allows for RTL text)', () => {
    // Note: This is allowed by the schema - application logic handles RTL
    const bbox = { x0: 100, y0: 20, x1: 10, y1: 50 };
    expect(bboxSchema.safeParse(bbox).success).toBe(true);
  });
});

describe('OCR Word Contract', () => {
  it('accepts valid word with full data', () => {
    const word = {
      text: 'Hello',
      confidence: 95.5,
      bbox: { x0: 10, y0: 10, x1: 60, y1: 30 },
    };
    expect(ocrWordSchema.safeParse(word).success).toBe(true);
  });

  it('accepts empty text (whitespace detected by OCR)', () => {
    const word = {
      text: '',
      confidence: 50,
      bbox: { x0: 10, y0: 10, x1: 20, y1: 30 },
    };
    expect(ocrWordSchema.safeParse(word).success).toBe(true);
  });

  it('accepts confidence at boundaries (0 and 100)', () => {
    const word0 = {
      text: 'Test',
      confidence: 0,
      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    };
    const word100 = {
      text: 'Test',
      confidence: 100,
      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    };
    expect(ocrWordSchema.safeParse(word0).success).toBe(true);
    expect(ocrWordSchema.safeParse(word100).success).toBe(true);
  });

  it('rejects confidence outside 0-100', () => {
    const wordNeg = {
      text: 'Test',
      confidence: -10,
      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    };
    const wordOver = {
      text: 'Test',
      confidence: 101,
      bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    };
    expect(ocrWordSchema.safeParse(wordNeg).success).toBe(false);
    expect(ocrWordSchema.safeParse(wordOver).success).toBe(false);
  });
});

describe('OCR Region Contract', () => {
  it('accepts valid region', () => {
    const region = { x: 100, y: 100, width: 200, height: 150 };
    expect(regionSchema.safeParse(region).success).toBe(true);
  });

  it('accepts region starting at origin', () => {
    const region = { x: 0, y: 0, width: 800, height: 600 };
    expect(regionSchema.safeParse(region).success).toBe(true);
  });

  it('rejects zero width', () => {
    const region = { x: 100, y: 100, width: 0, height: 150 };
    expect(regionSchema.safeParse(region).success).toBe(false);
  });

  it('rejects zero height', () => {
    const region = { x: 100, y: 100, width: 200, height: 0 };
    expect(regionSchema.safeParse(region).success).toBe(false);
  });

  it('rejects negative dimensions', () => {
    const region = { x: 100, y: 100, width: -200, height: 150 };
    expect(regionSchema.safeParse(region).success).toBe(false);
  });

  it('rejects negative position', () => {
    const region = { x: -100, y: 100, width: 200, height: 150 };
    expect(regionSchema.safeParse(region).success).toBe(false);
  });
});
