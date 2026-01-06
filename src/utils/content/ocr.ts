// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * OCR Processor for VoxPage
 * Text extraction from images using tesseract-wasm
 *
 * @module utils/content/ocr
 */

import { createOCREngine, type OCREngine, type TextRect } from 'tesseract-wasm';

/**
 * OCR word result with bounding box
 */
export interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * OCR line result with words
 */
export interface OCRLine {
  text: string;
  words: OCRWord[];
  confidence: number;
}

/**
 * OCR processing result
 */
export interface OCRResult {
  success: boolean;
  /** Full extracted text */
  text: string;
  /** Lines with word-level detail */
  lines: OCRLine[];
  /** Overall confidence (0-100) */
  confidence: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Language detected */
  detectedLanguage?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * OCR processing options
 */
export interface OCROptions {
  /** Language codes for OCR (ISO 639-3) */
  languages: string[];
  /** Region of interest (optional crop) */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Default OCR options
 */
const DEFAULT_OPTIONS: OCROptions = {
  languages: ['eng'],
};

/**
 * OCR Processor class
 * Handles text extraction from images using tesseract-wasm
 */
export class OCRProcessor {
  private engine: OCREngine | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private loadedLanguages: Set<string> = new Set();

  /**
   * Initialize the OCR engine
   * Lazy initialization - only called when first processing an image
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Create OCR engine
      // Note: tesseract-wasm loads WASM and model data from CDN by default
      this.engine = await createOCREngine({
        // Use CDN for WASM and model files
        wasmBinary: undefined, // Will load from CDN
      });

      this.initialized = true;
    } catch (error) {
      this.initPromise = null;
      throw new Error(
        `Failed to initialize OCR engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Process an image and extract text
   * @param imageData - Image data as base64 string or data URL
   * @param options - OCR processing options
   * @returns Promise resolving to OCR result
   */
  async processImage(imageData: string, options: Partial<OCROptions> = {}): Promise<OCRResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      // Ensure engine is initialized
      await this.initialize();

      if (!this.engine) {
        throw new Error('OCR engine not initialized');
      }

      // Load required language data if not already loaded
      for (const lang of opts.languages) {
        if (!this.loadedLanguages.has(lang)) {
          await this.loadLanguage(lang);
        }
      }

      // Convert base64/data URL to ImageData
      const imageDataObj = await this.decodeImage(imageData, opts.region);

      // Load image into engine
      this.engine.loadImage(imageDataObj);

      // Get text rectangles
      const textRects = this.engine.getTextBoxes('word');

      // Build result structure
      const lines = this.buildLines(textRects);
      const fullText = lines.map((l) => l.text).join('\n');
      const avgConfidence = this.calculateAverageConfidence(lines);

      return {
        success: true,
        text: fullText,
        lines,
        confidence: avgConfidence,
        processingTimeMs: Date.now() - startTime,
        detectedLanguage: opts.languages[0], // TODO: Implement language detection
      };
    } catch (error) {
      return {
        success: false,
        text: '',
        lines: [],
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load language data for OCR
   * @param languageCode - ISO 639-3 language code (e.g., 'eng', 'fra', 'deu')
   */
  async loadLanguage(languageCode: string): Promise<void> {
    if (!this.engine) {
      throw new Error('OCR engine not initialized');
    }

    // Skip if already loaded
    if (this.loadedLanguages.has(languageCode)) {
      return;
    }

    try {
      // Load trained data from CDN
      // tesseract-wasm loads from GitHub releases by default
      await this.engine.loadModel(`${languageCode}.traineddata`);
      this.loadedLanguages.add(languageCode);
    } catch (error) {
      throw new Error(
        `Failed to load language '${languageCode}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Decode image from base64/data URL to ImageData
   */
  private async decodeImage(imageData: string, region?: OCROptions['region']): Promise<ImageData> {
    // Create an image element
    const img = new Image();

    // Load image from data URL
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));

      // Handle both raw base64 and data URLs
      if (imageData.startsWith('data:')) {
        img.src = imageData;
      } else {
        img.src = `data:image/png;base64,${imageData}`;
      }
    });

    // Create canvas and draw image
    const canvas = new OffscreenCanvas(region?.width || img.width, region?.height || img.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    if (region) {
      ctx.drawImage(
        img,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
    } else {
      ctx.drawImage(img, 0, 0);
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * Build line structures from text rectangles
   */
  private buildLines(textRects: TextRect[]): OCRLine[] {
    // Group words by approximate Y position (same line)
    const lineMap = new Map<number, TextRect[]>();
    const lineThreshold = 10; // pixels

    for (const rect of textRects) {
      const y = Math.round(rect.rect.top / lineThreshold) * lineThreshold;
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y)!.push(rect);
    }

    // Sort lines by Y position and words by X position
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);

    return sortedYs.map((y) => {
      const rects = lineMap.get(y)!;
      rects.sort((a, b) => a.rect.left - b.rect.left);

      const words: OCRWord[] = rects.map((r) => ({
        text: r.text,
        confidence: r.confidence * 100,
        bbox: {
          x0: r.rect.left,
          y0: r.rect.top,
          x1: r.rect.right,
          y1: r.rect.bottom,
        },
      }));

      const lineText = words.map((w) => w.text).join(' ');
      const lineConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;

      return {
        text: lineText,
        words,
        confidence: lineConfidence,
      };
    });
  }

  /**
   * Calculate average confidence across all lines
   */
  private calculateAverageConfidence(lines: OCRLine[]): number {
    if (lines.length === 0) return 0;
    const total = lines.reduce((sum, line) => sum + line.confidence, 0);
    return total / lines.length;
  }

  /**
   * Destroy the OCR engine and free resources
   */
  destroy(): void {
    if (this.engine) {
      // tesseract-wasm doesn't have explicit destroy method
      // but we can clear our reference
      this.engine = null;
    }
    this.initialized = false;
    this.initPromise = null;
    this.loadedLanguages.clear();
  }

  /**
   * Get list of loaded languages
   */
  getLoadedLanguages(): string[] {
    return Array.from(this.loadedLanguages);
  }

  /**
   * Check if engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create a new OCR processor instance
 */
export function createOCRProcessor(): OCRProcessor {
  return new OCRProcessor();
}
