// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * OCR Message Handlers for VoxPage
 * Handles OCR/screenshot reading requests from popup/content
 *
 * @module utils/messaging/handlers/ocr
 */

import type { VoxPageProtocol } from '../protocol';
import { OCRProcessor } from '../../content/ocr';
import { ROADMAP_STORAGE_KEYS } from '../../config/schema';

// Singleton OCR processor instance
let ocrProcessor: OCRProcessor | null = null;

/**
 * Get or create OCR processor instance
 */
function getOCRProcessor(): OCRProcessor {
  if (!ocrProcessor) {
    ocrProcessor = new OCRProcessor();
  }
  return ocrProcessor;
}

/**
 * Handle ocr.captureAndRead message
 * Captures screenshot and extracts text via OCR
 */
export async function handleOCRCaptureAndRead(
  request: VoxPageProtocol['ocr.captureAndRead']['request'],
): Promise<VoxPageProtocol['ocr.captureAndRead']['response']> {
  const { tabId, region, languages } = request;

  try {
    // Get the active window ID
    const window = await browser.windows.getCurrent();
    if (!window.id) {
      throw new Error('No active window');
    }

    // Capture visible tab
    const dataUrl = await browser.tabs.captureVisibleTab(window.id, {
      format: 'png',
    });

    // Process with OCR
    const result = await getOCRProcessor().processImage(dataUrl, {
      languages,
      region,
    });

    return {
      success: result.success,
      text: result.text,
      confidence: result.confidence,
      lines: result.lines,
      processingTimeMs: result.processingTimeMs,
      detectedLanguage: result.detectedLanguage,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      confidence: 0,
      lines: [],
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle ocr.processImage message
 * Processes provided image data with OCR
 */
export async function handleOCRProcessImage(
  request: VoxPageProtocol['ocr.processImage']['request'],
): Promise<VoxPageProtocol['ocr.processImage']['response']> {
  const { imageData, languages } = request;

  try {
    const result = await getOCRProcessor().processImage(imageData, {
      languages,
    });

    return {
      success: result.success,
      text: result.text,
      confidence: result.confidence,
      lines: result.lines,
      processingTimeMs: result.processingTimeMs,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      confidence: 0,
      lines: [],
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle ocr.readExtractedText message
 * Reads OCR-extracted text using TTS
 */
export async function handleOCRReadExtractedText(
  request: VoxPageProtocol['ocr.readExtractedText']['request'],
): Promise<VoxPageProtocol['ocr.readExtractedText']['response']> {
  const { text, provider, voice, speed } = request;

  try {
    // Send to audio generation
    const response = await browser.runtime.sendMessage({
      type: 'audio.generate',
      request: {
        text,
        provider,
        voice,
        speed,
      },
    });

    if (!response?.success) {
      return {
        success: false,
        error: response?.error || 'Failed to generate audio',
      };
    }

    // Start playback
    await browser.runtime.sendMessage({
      type: 'playback.start',
      request: {
        mode: 'selection',
        provider,
        voice,
        speed,
      },
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle ocr.selectRegion message
 * Enables region selection mode on page
 */
export async function handleOCRSelectRegion(
  request: VoxPageProtocol['ocr.selectRegion']['request'],
): Promise<VoxPageProtocol['ocr.selectRegion']['response']> {
  const { tabId } = request;

  try {
    // Send message to content script to enable region selection
    await browser.tabs.sendMessage(tabId, {
      type: 'ocr.enableRegionSelection',
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get list of available and downloaded language packs
 */
export async function getLanguagePacks(): Promise<{
  available: Array<{ code: string; name: string; size: number }>;
  downloaded: string[];
}> {
  // Available language packs (subset of common languages)
  const available = [
    { code: 'eng', name: 'English', size: 4500000 },
    { code: 'fra', name: 'French', size: 4200000 },
    { code: 'deu', name: 'German', size: 4300000 },
    { code: 'spa', name: 'Spanish', size: 4100000 },
    { code: 'ita', name: 'Italian', size: 4000000 },
    { code: 'por', name: 'Portuguese', size: 4100000 },
    { code: 'nld', name: 'Dutch', size: 3900000 },
    { code: 'rus', name: 'Russian', size: 4800000 },
    { code: 'jpn', name: 'Japanese', size: 5200000 },
    { code: 'chi_sim', name: 'Chinese (Simplified)', size: 5500000 },
    { code: 'chi_tra', name: 'Chinese (Traditional)', size: 5600000 },
    { code: 'kor', name: 'Korean', size: 5100000 },
    { code: 'ara', name: 'Arabic', size: 4700000 },
  ];

  // Get downloaded packs from storage
  const result = await browser.storage.local.get(ROADMAP_STORAGE_KEYS.OCR_LANGUAGE_PACKS);
  const downloaded = (result[ROADMAP_STORAGE_KEYS.OCR_LANGUAGE_PACKS] as string[]) || ['eng'];

  return { available, downloaded };
}

/**
 * Download a language pack
 */
export async function downloadLanguagePack(languageCode: string): Promise<void> {
  // Load the language in the processor
  await getOCRProcessor().loadLanguage(languageCode);

  // Save to storage
  const result = await browser.storage.local.get(ROADMAP_STORAGE_KEYS.OCR_LANGUAGE_PACKS);
  const downloaded = (result[ROADMAP_STORAGE_KEYS.OCR_LANGUAGE_PACKS] as string[]) || ['eng'];

  if (!downloaded.includes(languageCode)) {
    downloaded.push(languageCode);
    await browser.storage.local.set({
      [ROADMAP_STORAGE_KEYS.OCR_LANGUAGE_PACKS]: downloaded,
    });
  }
}

/**
 * Destroy the OCR processor and free resources
 */
export function destroyOCRProcessor(): void {
  if (ocrProcessor) {
    ocrProcessor.destroy();
    ocrProcessor = null;
  }
}

/**
 * OCR handlers object for registration
 */
export const ocrHandlers = {
  'ocr.captureAndRead': handleOCRCaptureAndRead,
  'ocr.processImage': handleOCRProcessImage,
  'ocr.readExtractedText': handleOCRReadExtractedText,
  'ocr.selectRegion': handleOCRSelectRegion,
};
