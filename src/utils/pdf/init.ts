/**
 * PDF.js Initialization Helper
 *
 * Feature: 033-pdf-reading-support
 *
 * Initializes pdfjs-dist library with the correct worker configuration
 * for use within a browser extension context.
 *
 * Uses dynamic imports to avoid loading pdfjs-dist during build time,
 * as it requires DOM APIs (DOMMatrix) not available in Node.js.
 */

import type * as PDFJSLib from 'pdfjs-dist';

/**
 * Cached pdfjs-dist module
 */
let pdfjsModule: typeof PDFJSLib | null = null;

/**
 * Whether PDF.js has been initialized
 */
let initialized = false;

/**
 * Initialize PDF.js with the worker script.
 * Must be called before any PDF operations.
 *
 * This function is idempotent - calling it multiple times is safe.
 *
 * @throws {Error} If browser runtime is not available
 */
export async function initPDFJS(): Promise<void> {
  if (initialized && pdfjsModule) {
    return;
  }

  // Dynamic import to avoid build-time evaluation
  pdfjsModule = await import('pdfjs-dist');

  // Get the URL to the worker file from the extension
  // The worker is copied to public/ and made accessible via web_accessible_resources
  const workerUrl = browser.runtime.getURL('pdf.worker.min.js');

  // Configure the worker source
  pdfjsModule.GlobalWorkerOptions.workerSrc = workerUrl;

  initialized = true;
  console.log('VoxPage: PDF.js initialized with worker:', workerUrl);
}

/**
 * Check if PDF.js has been initialized
 */
export function isPDFJSInitialized(): boolean {
  return initialized;
}

/**
 * Get the PDF.js library instance.
 * Automatically initializes if not already done.
 *
 * @returns Promise resolving to the pdfjs-dist module
 */
export async function getPDFJS(): Promise<typeof PDFJSLib> {
  if (!initialized || !pdfjsModule) {
    await initPDFJS();
  }
  return pdfjsModule!;
}

/**
 * Reset initialization state (for testing)
 */
export function resetPDFJSInit(): void {
  initialized = false;
  pdfjsModule = null;
}
