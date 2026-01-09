/**
 * VoxPage Offscreen Document Script
 *
 * This script runs in an offscreen document context where DOM APIs are available.
 * Used for:
 * - Running PDF.js which requires window/document
 * - Playing audio (Chrome MV3 service workers don't have Audio API)
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/offscreen
 */

import { browser } from 'wxt/browser';
import type * as PDFJSLib from 'pdfjs-dist';

// Cached pdfjs-dist module
let pdfjsModule: typeof PDFJSLib | null = null;
let initialized = false;

/**
 * Initialize PDF.js with the worker script.
 */
async function initPDFJS(): Promise<void> {
  if (initialized && pdfjsModule) {
    return;
  }

  // Dynamic import to load pdfjs-dist
  pdfjsModule = await import('pdfjs-dist');

  // Get the URL to the worker file from the extension
  // Use globalThis.chrome for Chrome-specific APIs
  const workerUrl = globalThis.chrome?.runtime?.getURL?.('pdf.worker.min.js') ?? '';

  // Configure the worker source
  pdfjsModule.GlobalWorkerOptions.workerSrc = workerUrl;

  initialized = true;
  console.log('[Offscreen] PDF.js initialized with worker:', workerUrl);
}

/**
 * Extract text from a PDF document.
 */
async function extractPDFText(
  source: string | ArrayBuffer,
  options: { password?: string } = {},
): Promise<{
  success: boolean;
  paragraphs?: string[];
  meta?: {
    title?: string;
    pageCount?: number;
    isScanned?: boolean;
  };
  error?: string;
  requiresPassword?: boolean;
}> {
  try {
    await initPDFJS();

    if (!pdfjsModule) {
      return { success: false, error: 'PDF.js failed to initialize' };
    }

    // Prepare loading task parameters
    const loadingParams: { data?: ArrayBuffer; url?: string; password?: string } = {};

    if (source instanceof ArrayBuffer) {
      loadingParams.data = source;
    } else {
      loadingParams.url = source;
    }

    if (options.password) {
      loadingParams.password = options.password;
    }

    // Load the PDF
    const loadingTask = pdfjsModule.getDocument(loadingParams);
    const pdf = await loadingTask.promise;

    console.log('[Offscreen] PDF loaded, pages:', pdf.numPages);

    // Extract text from all pages
    const paragraphs: string[] = [];
    let totalChars = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items into paragraphs (simplified version)
      let currentParagraph = '';

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          const text = item.str;
          totalChars += text.length;

          if (text.trim()) {
            currentParagraph += text + ' ';
          }

          // Check for end of line that might indicate paragraph break
          if ('hasEOL' in item && item.hasEOL && currentParagraph.trim()) {
            // Check if this looks like a sentence end
            const trimmed = currentParagraph.trim();
            if (trimmed.match(/[.!?]$/)) {
              paragraphs.push(trimmed);
              currentParagraph = '';
            }
          }
        }
      }

      // Add remaining text as paragraph
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }

      page.cleanup();
    }

    // Detect if scanned (low text content)
    const charsPerPage = totalChars / pdf.numPages;
    const isScanned = charsPerPage < 100;

    // Get metadata
    let title: string | undefined;
    try {
      const metadata = await pdf.getMetadata();
      const info = metadata.info as Record<string, unknown> | undefined;
      title = typeof info?.Title === 'string' ? info.Title : undefined;
    } catch {
      // Ignore metadata errors
    }

    // Cleanup
    await pdf.cleanup();
    await pdf.destroy();

    console.log('[Offscreen] Extracted', paragraphs.length, 'paragraphs');

    return {
      success: true,
      paragraphs,
      meta: {
        title,
        pageCount: pdf.numPages,
        isScanned,
      },
    };
  } catch (error) {
    // Handle password-protected PDFs
    if (error instanceof Error) {
      if (error.name === 'PasswordException' || error.message.includes('password')) {
        return {
          success: false,
          requiresPassword: true,
          error: options.password ? 'Incorrect password' : 'PDF requires a password',
        };
      }

      // Handle access errors
      if (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('CORS')
      ) {
        return {
          success: false,
          error: `Cannot access PDF: ${error.message}`,
        };
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Audio Playback (Chrome MV3 Service Worker Workaround)
// ============================================

/**
 * Current audio element for playback.
 * Service workers don't have access to Audio API, so we play audio here.
 */
let currentAudio: HTMLAudioElement | null = null;
let audioPlaybackResolve: ((result: { success: boolean; ended: boolean }) => void) | null = null;

/**
 * Play audio from a data URL or blob URL.
 * Returns when audio ends or is stopped.
 */
async function playAudio(
  audioUrl: string,
  speed: number,
): Promise<{ success: boolean; ended: boolean; duration?: number }> {
  return new Promise((resolve) => {
    // Stop any existing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute('src');
      currentAudio.load();
      currentAudio = null;
    }

    // Store resolve for external stop
    audioPlaybackResolve = resolve;

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

    audio.onended = () => {
      console.log('[Offscreen] Audio playback ended naturally');
      const duration = audio.duration;
      currentAudio = null;
      audioPlaybackResolve = null;
      resolve({ success: true, ended: true, duration });
    };

    audio.onerror = (event) => {
      console.error('[Offscreen] Audio playback error:', event);
      currentAudio = null;
      audioPlaybackResolve = null;
      resolve({ success: false, ended: false });
    };

    console.log('[Offscreen] Playing audio, speed:', speed);
    audio
      .play()
      .then(() => {
        console.log('[Offscreen] Audio play() started successfully');
        // Send initial duration update
        if (audio.duration && isFinite(audio.duration)) {
          browser.runtime
            .sendMessage({
              type: 'offscreen.audioProgress',
              currentTime: 0,
              duration: audio.duration,
            })
            .catch(() => {
              // Ignore - background might not be listening
            });
        }
      })
      .catch((err) => {
        console.error('[Offscreen] Audio play() failed:', err);
        currentAudio = null;
        audioPlaybackResolve = null;
        resolve({ success: false, ended: false });
      });

    // Send progress updates
    audio.ontimeupdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        browser.runtime
          .sendMessage({
            type: 'offscreen.audioProgress',
            currentTime: audio.currentTime,
            duration: audio.duration,
          })
          .catch(() => {
            // Ignore - background might not be listening
          });
      }
    };
  });
}

/**
 * Stop current audio playback.
 */
function stopAudio(): { success: boolean } {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute('src');
    currentAudio.load();
    currentAudio = null;
    console.log('[Offscreen] Audio stopped');

    // Resolve pending promise
    if (audioPlaybackResolve) {
      audioPlaybackResolve({ success: true, ended: false });
      audioPlaybackResolve = null;
    }

    return { success: true };
  }
  return { success: false };
}

/**
 * Pause current audio playback.
 */
function pauseAudio(): { success: boolean } {
  if (currentAudio) {
    currentAudio.pause();
    console.log('[Offscreen] Audio paused');
    return { success: true };
  }
  return { success: false };
}

/**
 * Resume current audio playback.
 */
function resumeAudio(): { success: boolean } {
  if (currentAudio) {
    currentAudio.play().catch((err) => {
      console.error('[Offscreen] Failed to resume audio:', err);
    });
    console.log('[Offscreen] Audio resumed');
    return { success: true };
  }
  return { success: false };
}

/**
 * Set playback speed.
 */
function setAudioSpeed(speed: number): { success: boolean } {
  if (currentAudio) {
    currentAudio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
    console.log('[Offscreen] Audio speed set to:', speed);
    return { success: true };
  }
  return { success: false };
}

// Listen for messages from the service worker
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // PDF extraction
  if (message.type === 'offscreen.extractPDF') {
    const { url, password } = message;

    extractPDFText(url, { password })
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    // Return true to indicate async response
    return true;
  }

  // Audio playback
  if (message.type === 'offscreen.playAudio') {
    const { audioUrl, speed } = message;

    playAudio(audioUrl, speed ?? 1.0)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          ended: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    // Return true to indicate async response
    return true;
  }

  // Audio control messages (synchronous)
  if (message.type === 'offscreen.stopAudio') {
    sendResponse(stopAudio());
    return true;
  }

  if (message.type === 'offscreen.pauseAudio') {
    sendResponse(pauseAudio());
    return true;
  }

  if (message.type === 'offscreen.resumeAudio') {
    sendResponse(resumeAudio());
    return true;
  }

  if (message.type === 'offscreen.setAudioSpeed') {
    sendResponse(setAudioSpeed(message.speed ?? 1.0));
    return true;
  }

  return undefined;
});

console.log('[Offscreen] VoxPage offscreen document loaded (with audio support)');
