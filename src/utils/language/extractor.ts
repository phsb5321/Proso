// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Language Extractor
 * Extracts page language from DOM metadata and text content
 *
 * @module utils/language/extractor
 */

import { type PageLanguage } from './types';

/**
 * Extract language information from the current page
 * Combines HTML lang attribute with text sample for detection
 *
 * @returns Language extraction result with metadata and text sample
 */
export function extractPageLanguage(): PageLanguage {
  // Get HTML lang attribute
  const htmlLang = document.documentElement.lang || null;

  // Check meta tags for language
  let metaLang: string | null = null;
  const metaElements = document.querySelectorAll<HTMLMetaElement>(
    'meta[http-equiv="content-language"], meta[name="language"]'
  );

  for (const meta of metaElements) {
    const content = meta.getAttribute('content');
    if (content) {
      metaLang = content;
      break;
    }
  }

  // Use HTML lang or meta lang
  const metadata = htmlLang || metaLang;

  // Extract text sample from main content
  const textSample = extractTextSample();

  return {
    metadata,
    textSample,
    url: window.location.href,
  };
}

/**
 * Extract a text sample from the page for language detection
 * Prioritizes main content areas over navigation/footer
 *
 * @returns Text sample (up to 1000 chars from main content)
 */
function extractTextSample(): string {
  // Priority selectors for main content
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '#content',
    '#main-content',
    '.content',
    '.article-content',
    '.post-content',
    '.entry-content',
    // Wiki-specific
    '#mw-content-text',
    '.mw-parser-output',
    '#wiki-content-block',
    '.wiki-content',
  ];

  let container: Element | null = null;

  // Find the first matching content container
  for (const selector of contentSelectors) {
    container = document.querySelector(selector);
    if (container) break;
  }

  // Fallback to body
  if (!container) {
    container = document.body;
  }

  // Get text from paragraphs
  const paragraphs = container.querySelectorAll('p');
  const textParts: string[] = [];
  let totalLength = 0;

  for (const p of paragraphs) {
    // Skip hidden paragraphs
    const style = window.getComputedStyle(p);
    if (style.display === 'none' || style.visibility === 'hidden') {
      continue;
    }

    // Skip very short paragraphs (likely navigation)
    const text = p.textContent?.trim() || '';
    if (text.length < 30) {
      continue;
    }

    textParts.push(text);
    totalLength += text.length;

    // Stop when we have enough text
    if (totalLength >= 1000) {
      break;
    }
  }

  // Fallback to any visible text if no paragraphs found
  if (textParts.length === 0) {
    const text = container.textContent?.trim() || '';
    return text.slice(0, 1000);
  }

  return textParts.join(' ').slice(0, 1000);
}

/**
 * Send extracted language info to background for detection
 */
export async function sendLanguageDetectionRequest(): Promise<void> {
  const languageInfo = extractPageLanguage();

  try {
    await browser.runtime.sendMessage({
      type: 'languageDetected',
      payload: languageInfo,
    });
  } catch (error) {
    console.warn('VoxPage: Failed to send language detection request:', error);
  }
}
