/**
 * VoxPage Language Extractor
 * Extracts page language from DOM metadata and text content
 *
 * @module content/language-extractor
 * @description Content script module for extracting language information
 * from the current page to send to background for detection.
 */

/**
 * Extract language information from the current page
 * Combines HTML lang attribute with text sample for detection
 *
 * @returns {Object} Language extraction result
 * @property {string|null} metadata - HTML lang attribute value
 * @property {string} textSample - Text sample for detection (500-1000 chars)
 * @property {string} url - Current page URL
 */
export function extractPageLanguage() {
  // Get HTML lang attribute
  const htmlLang = document.documentElement.lang || null;

  // Check meta tags for language
  let metaLang = null;
  const metaElements = document.querySelectorAll('meta[http-equiv="content-language"], meta[name="language"]');
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
    url: window.location.href
  };
}

/**
 * Extract a text sample from the page for language detection
 * Prioritizes main content areas over navigation/footer
 *
 * @returns {string} Text sample (up to 1000 chars from main content)
 */
function extractTextSample() {
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
    '.wiki-content'
  ];

  let container = null;

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
  const textParts = [];
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
 * @returns {Promise<void>}
 */
export async function sendLanguageDetectionRequest() {
  const languageInfo = extractPageLanguage();

  try {
    await browser.runtime.sendMessage({
      type: 'languageDetected',
      payload: languageInfo
    });
  } catch (error) {
    console.warn('VoxPage: Failed to send language detection request:', error);
  }
}

// Export for window.VoxPage namespace in content scripts
if (typeof window !== 'undefined') {
  window.VoxPage = window.VoxPage || {};
  window.VoxPage.extractPageLanguage = extractPageLanguage;
  window.VoxPage.sendLanguageDetectionRequest = sendLanguageDetectionRequest;
}

export default {
  extractPageLanguage,
  sendLanguageDetectionRequest
};
