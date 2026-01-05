/**
 * Unit tests for OCRProcessor
 * Tests for text extraction from images using tesseract-wasm
 *
 * @module tests/unit/ocr.test.ts
 */

import { describe, it, expect, beforeEach, jest, afterEach, beforeAll } from '@jest/globals';

// Mock tesseract-wasm types
interface MockTextRect {
  text: string;
  confidence: number;
  rect: { left: number; top: number; right: number; bottom: number };
}

// Mock tesseract-wasm
const mockTextRects: MockTextRect[] = [
  {
    text: 'Hello',
    confidence: 0.95,
    rect: { left: 10, top: 10, right: 60, bottom: 30 },
  },
  {
    text: 'World',
    confidence: 0.92,
    rect: { left: 70, top: 10, right: 130, bottom: 30 },
  },
  {
    text: 'Test',
    confidence: 0.88,
    rect: { left: 10, top: 50, right: 50, bottom: 70 },
  },
  {
    text: 'Line',
    confidence: 0.90,
    rect: { left: 60, top: 50, right: 100, bottom: 70 },
  },
];

// Use explicit function type for each mock
const mockLoadImage = jest.fn<(data: ImageData) => void>();
const mockLoadModel = jest.fn<(model: string) => Promise<void>>().mockResolvedValue(undefined);
const mockGetTextBoxes = jest.fn<(level: string) => MockTextRect[]>().mockReturnValue(mockTextRects);

const mockEngine = {
  loadImage: mockLoadImage,
  loadModel: mockLoadModel,
  getTextBoxes: mockGetTextBoxes,
};

type MockEngine = typeof mockEngine;
const mockCreateOCREngine = jest.fn<() => Promise<MockEngine>>().mockResolvedValue(mockEngine);

jest.unstable_mockModule('tesseract-wasm', () => ({
  createOCREngine: mockCreateOCREngine,
}));

// Mock Image and OffscreenCanvas for Node.js environment
// @ts-expect-error - Mock Image for Node environment
globalThis.Image = class MockImage {
  width = 800;
  height = 600;
  private _src = '';
  onload: (() => void) | null = null;
  onerror: ((e: Error) => void) | null = null;

  set src(value: string) {
    this._src = value;
    // Simulate async load - use Promise.resolve for immediate microtask resolution
    Promise.resolve().then(() => {
      if (this.onload) this.onload();
    });
  }

  get src(): string {
    return this._src;
  }
};

const mockGetImageData = jest.fn().mockReturnValue({
  data: new Uint8ClampedArray(800 * 600 * 4),
  width: 800,
  height: 600,
});

const mockContext2D = {
  drawImage: jest.fn(),
  getImageData: mockGetImageData,
};

// @ts-expect-error - Mock OffscreenCanvas for Node environment
globalThis.OffscreenCanvas = class {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return mockContext2D;
  }
};

// Import the module at the top level after mocks are set up
const ocrModulePromise = import('../../src/utils/content/ocr');

describe('OCRProcessor', () => {
  // Import module once at top level
  let OCRProcessor: typeof import('../../src/utils/content/ocr').OCRProcessor;
  let createOCRProcessor: typeof import('../../src/utils/content/ocr').createOCRProcessor;

  beforeAll(async () => {
    // Import module once before all tests
    try {
      const ocrModule = await ocrModulePromise;
      OCRProcessor = ocrModule.OCRProcessor;
      createOCRProcessor = ocrModule.createOCRProcessor;
    } catch (error) {
      console.error('Failed to import OCR module:', error);
      throw error;
    }
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockLoadImage.mockClear();
    mockLoadModel.mockClear().mockResolvedValue(undefined);
    mockGetTextBoxes.mockClear().mockReturnValue(mockTextRects);
    mockCreateOCREngine.mockClear();
    mockCreateOCREngine.mockResolvedValue(mockEngine);
    mockContext2D.drawImage.mockClear();
    mockGetImageData.mockClear().mockReturnValue({
      data: new Uint8ClampedArray(800 * 600 * 4),
      width: 800,
      height: 600,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create instance with OCRProcessor class', () => {
      const processor = new OCRProcessor();
      expect(processor).toBeInstanceOf(OCRProcessor);
      expect(processor.isInitialized()).toBe(false);
    });

    it('should create instance with createOCRProcessor factory', () => {
      const processor = createOCRProcessor();
      expect(processor).toBeInstanceOf(OCRProcessor);
    });

    it('should start with no loaded languages', () => {
      const processor = new OCRProcessor();
      expect(processor.getLoadedLanguages()).toEqual([]);
    });
  });

  describe('initialization', () => {
    it('should initialize OCR engine on first call', async () => {
      const processor = new OCRProcessor();

      await processor.initialize();

      expect(processor.isInitialized()).toBe(true);
      expect(mockCreateOCREngine).toHaveBeenCalledTimes(1);
    });

    it('should not reinitialize if already initialized', async () => {
      const processor = new OCRProcessor();

      await processor.initialize();
      await processor.initialize();

      expect(mockCreateOCREngine).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors gracefully', async () => {
      const error = new Error('WASM load failed');
      mockCreateOCREngine.mockRejectedValueOnce(error);

      const processor = new OCRProcessor();

      await expect(processor.initialize()).rejects.toThrow(
        'Failed to initialize OCR engine: WASM load failed'
      );
      expect(processor.isInitialized()).toBe(false);
    });

    it('should retry initialization after failure', async () => {
      const error = new Error('Network error');
      mockCreateOCREngine.mockRejectedValueOnce(error);
      mockCreateOCREngine.mockResolvedValueOnce(mockEngine);

      const processor = new OCRProcessor();

      // First attempt fails
      await expect(processor.initialize()).rejects.toThrow();
      expect(processor.isInitialized()).toBe(false);

      // Second attempt succeeds
      await processor.initialize();
      expect(processor.isInitialized()).toBe(true);
    });
  });

  describe('processImage', () => {
    it('should process base64 image and extract text', async () => {
      const processor = new OCRProcessor();
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await processor.processImage(base64Image);

      expect(result.success).toBe(true);
      expect(result.text).toContain('Hello');
      expect(result.text).toContain('World');
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process data URL image', async () => {
      const processor = new OCRProcessor();
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await processor.processImage(dataUrl);

      expect(result.success).toBe(true);
      expect(mockLoadImage).toHaveBeenCalled();
      expect(mockGetTextBoxes).toHaveBeenCalledWith('word');
    });

    it('should use default language (eng) when not specified', async () => {
      const processor = new OCRProcessor();

      await processor.processImage('fake_base64_data');

      expect(mockLoadModel).toHaveBeenCalledWith('eng.traineddata');
    });

    it('should load custom languages when specified', async () => {
      const processor = new OCRProcessor();

      await processor.processImage('fake_base64_data', {
        languages: ['fra', 'deu'],
      });

      expect(mockLoadModel).toHaveBeenCalledWith('fra.traineddata');
      expect(mockLoadModel).toHaveBeenCalledWith('deu.traineddata');
    });

    it('should crop image when region is specified', async () => {
      const processor = new OCRProcessor();
      const region = { x: 100, y: 100, width: 200, height: 200 };

      await processor.processImage('fake_base64_data', { region });

      expect(mockContext2D.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height
      );
    });

    it('should return error result on processing failure', async () => {
      mockGetTextBoxes.mockImplementationOnce(() => {
        throw new Error('OCR processing failed');
      });

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.success).toBe(false);
      expect(result.error).toBe('OCR processing failed');
      expect(result.text).toBe('');
      expect(result.lines).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('should track processing time', async () => {
      const processor = new OCRProcessor();

      const result = await processor.processImage('fake_base64_data');

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });
  });

  describe('line building', () => {
    it('should group words into lines by Y position', async () => {
      const processor = new OCRProcessor();

      const result = await processor.processImage('fake_base64_data');

      // Words at y=10 should be grouped: "Hello World"
      // Words at y=50 should be grouped: "Test Line"
      expect(result.lines.length).toBe(2);
      expect(result.lines[0].text).toBe('Hello World');
      expect(result.lines[1].text).toBe('Test Line');
    });

    it('should sort words within line by X position', async () => {
      // Reverse the word order in mock
      mockGetTextBoxes.mockReturnValueOnce([
        { text: 'World', confidence: 0.92, rect: { left: 70, top: 10, right: 130, bottom: 30 } },
        { text: 'Hello', confidence: 0.95, rect: { left: 10, top: 10, right: 60, bottom: 30 } },
      ]);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      // Should still be "Hello World" after sorting by X
      expect(result.lines[0].text).toBe('Hello World');
    });

    it('should include word-level bounding boxes', async () => {
      const processor = new OCRProcessor();

      const result = await processor.processImage('fake_base64_data');

      const firstWord = result.lines[0].words[0];
      expect(firstWord.bbox).toEqual({
        x0: 10,
        y0: 10,
        x1: 60,
        y1: 30,
      });
    });

    it('should calculate line confidence as average of word confidences', async () => {
      const processor = new OCRProcessor();

      const result = await processor.processImage('fake_base64_data');

      // First line has words with confidence 0.95 and 0.92
      // Average = (95 + 92) / 2 = 93.5
      const expectedConfidence = ((0.95 + 0.92) / 2) * 100;
      expect(result.lines[0].confidence).toBeCloseTo(expectedConfidence, 1);
    });
  });

  describe('confidence calculation', () => {
    it('should calculate overall confidence as average of line confidences', async () => {
      const processor = new OCRProcessor();

      const result = await processor.processImage('fake_base64_data');

      // Line 1: (95 + 92) / 2 = 93.5
      // Line 2: (88 + 90) / 2 = 89
      // Overall: (93.5 + 89) / 2 = 91.25
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should return 0 confidence for empty results', async () => {
      mockGetTextBoxes.mockReturnValueOnce([]);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.confidence).toBe(0);
      expect(result.lines).toEqual([]);
    });
  });

  describe('language management', () => {
    it('should load language and track it', async () => {
      const processor = new OCRProcessor();
      await processor.initialize();

      await processor.loadLanguage('fra');

      expect(mockLoadModel).toHaveBeenCalledWith('fra.traineddata');
      expect(processor.getLoadedLanguages()).toContain('fra');
    });

    it('should not reload already loaded language', async () => {
      const processor = new OCRProcessor();
      await processor.initialize();

      // Use a unique language for this test to avoid interference from other tests
      await processor.loadLanguage('spa');
      await processor.loadLanguage('spa');

      // Should only be called once for 'spa'
      const spaCallCount = mockLoadModel.mock.calls.filter(
        (call) => call[0] === 'spa.traineddata'
      ).length;
      expect(spaCallCount).toBe(1);
    });

    it('should throw error if loading language before initialization', async () => {
      const processor = new OCRProcessor();

      await expect(processor.loadLanguage('fra')).rejects.toThrow(
        'OCR engine not initialized'
      );
    });

    it('should handle language load errors', async () => {
      mockLoadModel.mockRejectedValueOnce(new Error('Language not found'));

      const processor = new OCRProcessor();
      await processor.initialize();

      await expect(processor.loadLanguage('xyz')).rejects.toThrow(
        "Failed to load language 'xyz': Language not found"
      );
    });
  });

  describe('destroy', () => {
    it('should destroy processor and clear state', async () => {
      const processor = new OCRProcessor();
      await processor.initialize();
      await processor.loadLanguage('eng');

      processor.destroy();

      expect(processor.isInitialized()).toBe(false);
      expect(processor.getLoadedLanguages()).toEqual([]);
    });

    it('should allow reinitialization after destroy', async () => {
      const processor = new OCRProcessor();
      await processor.initialize();
      processor.destroy();

      await processor.initialize();

      expect(processor.isInitialized()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle single word result', async () => {
      mockGetTextBoxes.mockReturnValueOnce([
        { text: 'Single', confidence: 0.99, rect: { left: 10, top: 10, right: 60, bottom: 30 } },
      ]);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Single');
      expect(result.lines.length).toBe(1);
    });

    it('should handle very long text', async () => {
      const manyWords = Array.from({ length: 100 }, (_, i) => ({
        text: `Word${i}`,
        confidence: 0.90,
        rect: { left: (i % 10) * 50, top: Math.floor(i / 10) * 30, right: (i % 10) * 50 + 40, bottom: Math.floor(i / 10) * 30 + 20 },
      }));
      mockGetTextBoxes.mockReturnValueOnce(manyWords);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.success).toBe(true);
      expect(result.lines.length).toBe(10);
    });

    it('should handle special characters in text', async () => {
      mockGetTextBoxes.mockReturnValueOnce([
        { text: 'Héllo', confidence: 0.90, rect: { left: 10, top: 10, right: 60, bottom: 30 } },
        { text: 'Wörld!', confidence: 0.85, rect: { left: 70, top: 10, right: 130, bottom: 30 } },
        { text: '日本語', confidence: 0.80, rect: { left: 140, top: 10, right: 200, bottom: 30 } },
      ]);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Héllo');
      expect(result.text).toContain('Wörld!');
      expect(result.text).toContain('日本語');
    });

    it('should handle zero confidence words', async () => {
      mockGetTextBoxes.mockReturnValueOnce([
        { text: 'Maybe', confidence: 0, rect: { left: 10, top: 10, right: 60, bottom: 30 } },
      ]);

      const processor = new OCRProcessor();
      const result = await processor.processImage('fake_base64_data');

      expect(result.success).toBe(true);
      expect(result.lines[0].words[0].confidence).toBe(0);
    });
  });

  describe('concurrent processing', () => {
    it('should handle concurrent initialization calls', async () => {
      const processor = new OCRProcessor();

      await Promise.all([
        processor.initialize(),
        processor.initialize(),
      ]);

      expect(mockCreateOCREngine).toHaveBeenCalledTimes(1);
      expect(processor.isInitialized()).toBe(true);
    });

    it('should handle concurrent processImage calls', async () => {
      const processor = new OCRProcessor();

      const [result1, result2] = await Promise.all([
        processor.processImage('data1'),
        processor.processImage('data2'),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});
