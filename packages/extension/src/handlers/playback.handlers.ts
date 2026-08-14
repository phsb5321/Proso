/**
 * Playback Message Handlers
 *
 * Handlers for playback-related messages in the hexagonal architecture.
 * These handlers delegate to the PlaybackService in the composition root.
 *
 * @module handlers/playback
 */

import { browser } from 'wxt/browser';
import { getPlaybackService, isPlaybackServiceAvailable } from '../composition';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import { tabLanguageStates } from './language.handlers';
import type { HandlerRegistry } from './registry';
import {
  paragraphClickedParamsSchema,
  playbackResyncParamsSchema,
  playbackSeekParamsSchema,
  playbackSeekToParagraphParamsSchema,
  playbackSetSpeedParamsSchema,
  playbackStartParamsSchema,
} from './schemas/playback.schemas';

/**
 * Get the active tab in the current window.
 */
async function getActiveTab(): Promise<{ id?: number; url?: string } | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

/**
 * Split raw selected text into non-empty paragraphs.
 *
 * Used as a fallback when a text selection cannot be mapped to whole block
 * elements: the content script returns the raw selection string, which we split
 * on blank lines (falling back to the whole trimmed string) so it can be read.
 */
function splitSelectionText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const trimmed = text.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

/**
 * Send a message to a content script and get the response.
 */
async function sendToContentScript(
  tabId: number,
  message: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[PlaybackHandlers] Failed to send to content script:', error);
    return null;
  }
}

/**
 * Playback handler error type.
 */
export type PlaybackHandlerError =
  | { type: 'service_unavailable'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response types for playback handlers.
 * Note: status values mapped from PlaybackState.status:
 * - 'idle' and 'error' are mapped to 'stopped' for compatibility with legacy handlers
 */
export interface PlaybackStateResponse {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number;
  speed: number;
  provider: string;
  voice: string | null;
  currentTime: number;
  totalTime: number;
}

/**
 * Map PlaybackState.status to legacy status values.
 */
function mapStatusToLegacy(
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error',
): 'stopped' | 'loading' | 'playing' | 'paused' {
  switch (status) {
    case 'idle':
    case 'error':
    case 'stopped':
      return 'stopped';
    case 'loading':
      return 'loading';
    case 'playing':
      return 'playing';
    case 'paused':
      return 'paused';
  }
}

/**
 * Extract error message from PlaybackError.
 * PlaybackError is a discriminated union - different variants have different properties.
 */
function getPlaybackErrorMessage(error: {
  type: string;
  message?: string;
  reason?: string;
  mode?: string;
  provider?: string;
  index?: number;
  max?: number;
  tabId?: number;
}): string {
  switch (error.type) {
    case 'audio_generation':
      return error.message ?? `Audio generation failed for provider ${error.provider}`;
    case 'no_content':
      return `No content found for mode: ${error.mode}`;
    case 'invalid_paragraph_index':
      return `Invalid paragraph index ${error.index} (max: ${error.max})`;
    case 'tab_not_found':
      return `Tab not found: ${error.tabId}`;
    case 'invalid_credentials':
      return `Invalid API key for ${error.provider}`;
    case 'playback_failed':
      return error.reason ?? 'Playback failed';
    default:
      return `Unknown error: ${error.type}`;
  }
}

export interface PlaybackOperationResponse {
  success: boolean;
  error?: string;
  currentParagraph?: number;
}

/** The rejection for params this handler's schema would not accept. */
function invalidParams(error: { issues: { message: string }[] }): PlaybackHandlerError {
  return { type: 'invalid_params', message: error.issues.map((i) => i.message).join('; ') };
}

/** The rejection for a call that arrives before the service is wired up. */
function serviceUnavailable(): PlaybackHandlerError {
  return { type: 'service_unavailable', message: 'PlaybackService not yet initialized.' };
}

/**
 * Answer to a tab asking where the audio is.
 *
 * `resynced` is false, not an error, when there was nothing to send: another
 * tab asked, or no clip is loaded. Neither is a failure — the tab simply has
 * no position to catch up to.
 */
export interface PlaybackResyncResponse {
  success: boolean;
  resynced: boolean;
}

/**
 * Register playback message handlers on the registry.
 *
 * Note: During the transition period, these handlers provide a facade
 * over the existing background.ts implementation. Once the full hexagonal
 * architecture is in place, they will delegate to PlaybackService.
 *
 * @param registry - Handler registry to register on
 */
export function registerPlaybackHandlers(registry: HandlerRegistry): void {
  /**
   * Get current playback state.
   */
  registry.register<void, Result<PlaybackStateResponse, PlaybackHandlerError>>(
    'playback.getState',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        // During transition, return a stub response
        // This will be replaced with actual service call
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const state = service.getState();

        // Calculate progress percentage for the overall article
        const overallProgress =
          state.totalParagraphs > 0
            ? (state.currentParagraphIndex / state.totalParagraphs) * 100
            : 0;

        // Note: currentTime and totalTime are approximations since PlaybackState
        // doesn't track audio duration. These will be 0 until audio is playing.
        return Ok({
          status: mapStatusToLegacy(state.status),
          currentParagraph: state.currentParagraphIndex,
          totalParagraphs: state.totalParagraphs,
          progress: overallProgress,
          speed: state.speed,
          provider: state.provider,
          voice: state.voice,
          currentTime: 0, // Audio timing tracked by audio element in PlaybackService
          totalTime: 0, // Audio timing tracked by audio element in PlaybackService
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get current playback state',
  );

  /**
   * Start playback.
   *
   * This handler orchestrates playback start:
   * 1. Gets active tab if not provided
   * 2. Extracts text from content script if paragraphs not provided
   * 3. Shows footer UI
   * 4. Starts PlaybackService
   */
  registry.register<
    { paragraphs?: string[]; tabId?: number; pageUrl?: string },
    Result<PlaybackOperationResponse, PlaybackHandlerError>
  >(
    'playback.start',
    async (params) => {
      const parsed = playbackStartParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized.',
        });
      }

      try {
        // Step 1: Get active tab if not provided
        let tabId = parsed.data.tabId;
        let pageUrl = parsed.data.pageUrl;

        if (!tabId || !pageUrl) {
          const tab = await getActiveTab();
          if (!tab?.id) {
            return Ok({ success: false, error: 'No active tab' });
          }
          tabId = tab.id;
          pageUrl = tab.url ?? '';
        }

        // Step 2: Extract paragraphs if not provided.
        // `mode` selects the content-script extraction strategy; it defaults to
        // 'article'. The "Read with Proso" context menu passes 'selection' to
        // read the user's highlighted text via the same extraction path.
        let paragraphs = parsed.data.paragraphs;
        const mode = parsed.data.mode ?? 'article';

        if (!paragraphs || paragraphs.length === 0) {
          const extractResult = await sendToContentScript(tabId, {
            action: 'extractText',
            mode,
          });

          if (extractResult && typeof extractResult === 'object' && 'paragraphs' in extractResult) {
            const result = extractResult as { paragraphs?: string[]; text?: string };
            paragraphs = result.paragraphs ?? [];

            // Selection fallback: when the highlighted text cannot be mapped to
            // whole block elements (e.g. a partial sentence), the content script
            // returns an empty `paragraphs` array but a non-empty `text`. Split
            // that raw text so arbitrary selections are still read aloud.
            if (paragraphs.length === 0 && typeof result.text === 'string') {
              paragraphs = splitSelectionText(result.text);
            }
          } else {
            return Ok({ success: false, error: 'Failed to extract text' });
          }
        }

        if (paragraphs.length === 0) {
          return Ok({ success: false, error: 'No text found on page' });
        }

        // Step 3: Show footer UI
        const service = getPlaybackService();
        const state = service.getState();

        await sendToContentScript(tabId, {
          action: 'FOOTER_SHOW',
          initialState: {
            isPlaying: true,
            currentIndex: 0,
            totalParagraphs: paragraphs.length,
            progress: 0,
            speed: state.speed,
          },
        });

        // Send initial language state to footer
        const langState = tabLanguageStates.get(tabId);
        const langOverride = langState?.override;
        // One derived value for both the footer and synthesis. PROSO-147:
        // `PlaybackService.setLanguage()` existed and was called from nowhere,
        // so `detectedLanguage` stayed null for every request. The managed
        // providers hid it by choosing a voice server-side; the reader's own
        // host cannot, and declines an undetermined language rather than
        // reading English text in a Portuguese voice (spec D-2) — so the local
        // route answered "Language not supported: und" for every article.
        // Deriving it here from the same state the footer shows means the
        // language the reader is told is the language they hear.
        const effectiveLanguage = langOverride ?? langState?.detected?.code ?? 'en';
        await sendToContentScript(tabId, {
          action: 'FOOTER_LANGUAGE_UPDATE',
          languageCode: effectiveLanguage,
          isAutoDetected: !langOverride,
        });

        // Step 4: Start PlaybackService
        service.setLanguage(effectiveLanguage);
        const result = await service.start(paragraphs, tabId, pageUrl);

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Start playback',
  );

  /**
   * Pause playback.
   */
  registry.register<void, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.pause',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        service.pause();
        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Pause playback',
  );

  /**
   * Resume playback.
   */
  registry.register<void, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.resume',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const result = await service.resume();

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Resume playback',
  );

  /**
   * Stop playback.
   */
  registry.register<void, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.stop',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        service.stop();
        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Stop playback',
  );

  /**
   * Skip to next paragraph.
   */
  registry.register<void, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.next',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const result = await service.next();

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        const state = service.getState();
        return Ok({ success: true, currentParagraph: state.currentParagraphIndex });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Skip to next paragraph',
  );

  /**
   * Skip to previous paragraph.
   */
  registry.register<void, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.previous',
    async () => {
      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const result = await service.previous();

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        const state = service.getState();
        return Ok({ success: true, currentParagraph: state.currentParagraphIndex });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Skip to previous paragraph',
  );

  /**
   * Seek to specific paragraph.
   */
  registry.register<
    { paragraphIndex: number },
    Result<PlaybackOperationResponse, PlaybackHandlerError>
  >(
    'playback.seekToParagraph',
    async (params) => {
      const parsed = playbackSeekToParagraphParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const result = await service.seekToParagraph(parsed.data.paragraphIndex);

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        return Ok({ success: true, currentParagraph: parsed.data.paragraphIndex });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Seek to specific paragraph',
  );

  /**
   * Tell a tab where the audio is, on request.
   *
   * A hidden tab throttles the animation frames its word highlight moves on,
   * so it comes back stale; it asks for this the moment it becomes visible
   * (FR-005). Only the tab actually being read into is answered — any other
   * tab asking is told there was nothing for it rather than being handed
   * another page's playback position.
   */
  registry.register<{ __tabId?: number }, Result<PlaybackResyncResponse, PlaybackHandlerError>>(
    'playback.resync',
    async (params) => {
      const parsed = playbackResyncParamsSchema.safeParse(params ?? {});
      if (!parsed.success) return Err(invalidParams(parsed.error));
      if (!isPlaybackServiceAvailable()) return Err(serviceUnavailable());

      try {
        const service = getPlaybackService();
        const askingTabId = parsed.data.__tabId;
        const activeTabId = service.getState().activeTabId;

        if (askingTabId !== undefined && askingTabId !== activeTabId) {
          return Ok({ success: true, resynced: false });
        }

        return Ok({ success: true, resynced: service.resyncPosition() });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Push the current audio position to the asking tab',
  );

  /**
   * Set playback speed.
   */
  registry.register<{ speed: number }, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.setSpeed',
    async (params) => {
      const parsed = playbackSetSpeedParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        service.setSpeed(parsed.data.speed);
        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Set playback speed',
  );

  /**
   * Seek to position by progress percentage.
   * T023: Added for compatibility with legacy seekToPosition handler.
   * Converts progress (0-100) to paragraph index.
   */
  registry.register<{ progress: number }, Result<PlaybackOperationResponse, PlaybackHandlerError>>(
    'playback.seek',
    async (params) => {
      const parsed = playbackSeekParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized. Use legacy handlers.',
        });
      }

      try {
        const service = getPlaybackService();
        const state = service.getState();

        // Convert progress percentage to paragraph index
        const paragraphIndex =
          state.totalParagraphs > 0
            ? Math.floor((parsed.data.progress / 100) * state.totalParagraphs)
            : 0;

        const result = await service.seekToParagraph(paragraphIndex);

        if (!result.ok) {
          return Ok({ success: false, error: getPlaybackErrorMessage(result.error) });
        }

        return Ok({ success: true, currentParagraph: paragraphIndex });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Seek to position by progress percentage',
  );

  /**
   * Handle paragraph click from content script.
   *
   * When a user clicks a paragraph in the content page, this handler:
   * 1. Starts playback if not already playing (extracts text, shows footer)
   * 2. Seeks to the clicked paragraph index
   *
   * This replaces the legacy PARAGRAPH_CLICKED handler in background.ts.
   */
  registry.register<
    { paragraphIndex: number; isCached?: boolean },
    Result<{ success: boolean; playbackStarted: boolean; error?: string }, PlaybackHandlerError>
  >(
    'PARAGRAPH_CLICKED',
    async (params) => {
      const parsed = paragraphClickedParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (!isPlaybackServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'PlaybackService not yet initialized.',
        });
      }

      const paragraphIndex = parsed.data.paragraphIndex;

      try {
        const service = getPlaybackService();
        const currentState = service.getState();

        // If not currently playing, start fresh playback first
        if (currentState.status === 'idle' || currentState.status === 'stopped') {
          // Get active tab for text extraction
          const tab = await getActiveTab();
          if (!tab?.id) {
            return Ok({ success: false, playbackStarted: false, error: 'No active tab' });
          }

          // Extract text from the page
          const extractResult = await sendToContentScript(tab.id, {
            action: 'extractText',
            mode: 'article',
          });

          if (
            !extractResult ||
            typeof extractResult !== 'object' ||
            !('paragraphs' in extractResult)
          ) {
            return Ok({
              success: false,
              playbackStarted: false,
              error: 'Failed to extract text',
            });
          }

          const result = extractResult as { paragraphs: string[] };
          const paragraphs = result.paragraphs;

          if (paragraphs.length === 0) {
            return Ok({
              success: false,
              playbackStarted: false,
              error: 'No text found on page',
            });
          }

          // Validate paragraph index against extracted content
          if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
            return Ok({
              success: false,
              playbackStarted: false,
              error: `Invalid paragraph index ${paragraphIndex} (total: ${paragraphs.length})`,
            });
          }

          // Show footer UI
          await sendToContentScript(tab.id, {
            action: 'FOOTER_SHOW',
            initialState: {
              isPlaying: true,
              currentIndex: paragraphIndex,
              totalParagraphs: paragraphs.length,
              progress: (paragraphIndex / paragraphs.length) * 100,
              speed: currentState.speed,
            },
          });

          // Send initial language state to footer
          const pLangState = tabLanguageStates.get(tab.id);
          const pLangOverride = pLangState?.override;
          await sendToContentScript(tab.id, {
            action: 'FOOTER_LANGUAGE_UPDATE',
            languageCode: pLangOverride ?? pLangState?.detected?.code ?? 'en',
            isAutoDetected: !pLangOverride,
          });

          // Start PlaybackService with extracted paragraphs
          const startResult = await service.start(paragraphs, tab.id, tab.url ?? '');
          if (!startResult.ok) {
            return Ok({
              success: false,
              playbackStarted: false,
              error: getPlaybackErrorMessage(startResult.error),
            });
          }

          // If clicking paragraph 0, we're already there from start()
          if (paragraphIndex === 0) {
            return Ok({ success: true, playbackStarted: true });
          }

          // Seek to the clicked paragraph
          const seekResult = await service.seekToParagraph(paragraphIndex);
          if (!seekResult.ok) {
            return Ok({
              success: false,
              playbackStarted: true,
              error: getPlaybackErrorMessage(seekResult.error),
            });
          }

          return Ok({ success: true, playbackStarted: true });
        }

        // Already playing — just seek to the clicked paragraph
        // Validate paragraph index
        if (paragraphIndex < 0 || paragraphIndex >= currentState.totalParagraphs) {
          return Ok({
            success: false,
            playbackStarted: false,
            error: `Invalid paragraph index ${paragraphIndex} (total: ${currentState.totalParagraphs})`,
          });
        }

        const seekResult = await service.seekToParagraph(paragraphIndex);
        if (!seekResult.ok) {
          return Ok({
            success: false,
            playbackStarted: false,
            error: getPlaybackErrorMessage(seekResult.error),
          });
        }

        return Ok({ success: true, playbackStarted: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Handle paragraph click from content script',
  );
}
