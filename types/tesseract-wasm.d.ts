/**
 * Type definitions for tesseract-wasm
 * OCR engine using Tesseract compiled to WebAssembly
 */

declare module 'tesseract-wasm' {
  /**
   * Text bounding rectangle returned by OCR
   */
  export interface TextRect {
    text: string;
    confidence: number;
    rect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    };
  }

  /**
   * Options for creating OCR engine
   */
  export interface OCREngineOptions {
    /** Custom WASM binary to use instead of loading from CDN */
    wasmBinary?: ArrayBuffer;
  }

  /**
   * OCR Engine interface
   */
  export interface OCREngine {
    /**
     * Load an image for OCR processing
     * @param imageData - ImageData from canvas
     */
    loadImage(imageData: ImageData): void;

    /**
     * Load a trained model for a language
     * @param modelPath - Path to the trained data file (e.g., 'eng.traineddata')
     */
    loadModel(modelPath: string): Promise<void>;

    /**
     * Get text boxes at the specified level
     * @param level - Level of text boxes ('word', 'line', 'paragraph', etc.)
     * @returns Array of text rectangles
     */
    getTextBoxes(level: 'word' | 'line' | 'paragraph' | 'block'): TextRect[];

    /**
     * Get all recognized text
     * @returns Full recognized text as string
     */
    getText(): string;

    /**
     * Clear loaded image and free resources
     */
    clearImage(): void;
  }

  /**
   * OCR Client for high-level OCR operations
   */
  export class OCRClient {
    constructor();

    /**
     * Load a model from a URL
     */
    loadModel(url: string): Promise<void>;

    /**
     * Perform OCR on an image
     */
    getText(image: ImageBitmap | ImageData): Promise<string>;

    /**
     * Destroy the client and free resources
     */
    destroy(): void;
  }

  /**
   * Layout analysis flags
   */
  export const layoutFlags: {
    readonly SINGLE_BLOCK: number;
    readonly SINGLE_LINE: number;
    readonly SINGLE_WORD: number;
    readonly SINGLE_CHAR: number;
  };

  /**
   * Check if fast build is supported
   */
  export function supportsFastBuild(): boolean;

  /**
   * Create a new OCR engine
   * @param options - Engine options
   * @returns Promise resolving to OCR engine
   */
  export function createOCREngine(options?: OCREngineOptions): Promise<OCREngine>;
}
