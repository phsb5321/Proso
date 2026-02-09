/**
 * Footer Message Handlers
 *
 * Hexagonal handlers for sticky footer operations.
 * Delegates to IHighlightSynchronizer port for content script communication.
 *
 * @module handlers/footer
 */

import type { IHighlightSynchronizer, FooterState } from '../ports/highlight-sync.port';
import { isErr } from '../core/shared/result';
import { getPlaybackService, isPlaybackServiceAvailable } from '../composition';
import type { HandlerRegistry } from './registry';
import {
  footerShowParamsSchema,
  footerHideParamsSchema,
  footerStateUpdateParamsSchema,
  footerActionParamsSchema,
  footerVisibilityParamsSchema,
  footerPositionParamsSchema,
} from './schemas/footer.schemas';

// ============================================
// Response Types
// ============================================

/**
 * Footer handler error type.
 */
export type FooterHandlerError =
  | { type: 'no_active_tab' }
  | { type: 'content_script_not_loaded' }
  | { type: 'message_failed'; message: string };

/**
 * Response for footer operations.
 */
export interface FooterOperationResponse {
  success: boolean;
  error?: string;
}

/**
 * Response for footer action handler.
 */
export interface FooterActionResponse {
  success: boolean;
  error?: string;
  action?: string;
}

// ============================================
// Handler Factory
// ============================================

let highlightSync: IHighlightSynchronizer | null = null;
let activeTabId: number | null = null;

/**
 * Set the highlight synchronizer instance for handlers.
 * Called during container initialization.
 */
export function setHighlightSync(sync: IHighlightSynchronizer): void {
  highlightSync = sync;
}

/**
 * Set the active tab ID.
 * Called when playback starts or tab changes.
 */
export function setActiveTabId(tabId: number | null): void {
  activeTabId = tabId;
}

/**
 * Get the active tab ID.
 */
export function getActiveTabId(): number | null {
  return activeTabId;
}

/**
 * Get the highlight synchronizer instance.
 */
function getHighlightSync(): IHighlightSynchronizer {
  if (!highlightSync) {
    throw new Error('Highlight sync not initialized. Call setHighlightSync() first.');
  }
  return highlightSync;
}

// ============================================
// Handlers
// ============================================

/**
 * Show the sticky footer in content script.
 */
async function handleFooterShow(params: unknown): Promise<FooterOperationResponse> {
  const parsed = footerShowParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  const sync = getHighlightSync();
  const tabId = parsed.data.tabId || activeTabId;

  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }

  const result = await sync.showFooter(tabId);

  if (isErr(result)) {
    return { success: false, error: result.error.type };
  }

  return { success: true };
}

/**
 * Hide the sticky footer in content script.
 */
async function handleFooterHide(params: unknown): Promise<FooterOperationResponse> {
  const parsed = footerHideParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  const sync = getHighlightSync();
  const tabId = parsed.data.tabId || activeTabId;

  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }

  const result = await sync.hideFooter(tabId);

  if (isErr(result)) {
    return { success: false, error: result.error.type };
  }

  return { success: true };
}

/**
 * Update footer state in content script.
 */
async function handleFooterStateUpdate(
  params: unknown,
): Promise<FooterOperationResponse> {
  const parsed = footerStateUpdateParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  const sync = getHighlightSync();
  const tabId = parsed.data.tabId || activeTabId;

  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }

  const state: FooterState = {
    status: parsed.data.status,
    currentIndex: parsed.data.currentIndex,
    totalParagraphs: parsed.data.totalParagraphs,
    progress: parsed.data.progress,
    currentTime: parsed.data.currentTime,
    totalTime: parsed.data.totalTime,
    speed: parsed.data.speed,
  };

  const result = await sync.updateFooterState(tabId, state);

  if (isErr(result)) {
    return { success: false, error: result.error.type };
  }

  return { success: true };
}

/**
 * Handle footer action (play, pause, next, prev, etc.).
 * T025: Dispatches to PlaybackService for actual playback control.
 */
async function handleFooterAction(params: unknown): Promise<FooterActionResponse> {
  const parsed = footerActionParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  console.log('[Footer] Action received:', parsed.data.action, parsed.data.value);

  if (!isPlaybackServiceAvailable()) {
    return { success: false, error: 'PlaybackService not available', action: parsed.data.action };
  }

  try {
    const service = getPlaybackService();

    switch (parsed.data.action) {
      case 'play':
        await service.resume();
        break;
      case 'pause':
        await service.pause();
        break;
      case 'next':
        await service.next();
        break;
      case 'prev':
        await service.previous();
        break;
      case 'stop':
      case 'close':
        await service.stop();
        break;
      case 'seek':
        if (typeof parsed.data.value === 'number') {
          await service.seekToParagraph(parsed.data.value);
        }
        break;
      case 'speed':
        if (typeof parsed.data.value === 'number') {
          service.setSpeed(parsed.data.value);
        }
        break;
      default:
        console.warn('[Footer] Unknown action:', parsed.data.action);
    }

    return { success: true, action: parsed.data.action };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, action: parsed.data.action };
  }
}

/**
 * Handle footer visibility change (minimize/expand).
 * This is informational - the footer handles its own state.
 */
async function handleFooterVisibilityChanged(
  params: unknown,
): Promise<FooterOperationResponse> {
  const parsed = footerVisibilityParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  console.log('[Footer] Visibility changed:', parsed.data);
  // Informational only - acknowledge receipt
  return { success: true };
}

/**
 * Handle footer position change (drag).
 * This is informational - the footer persists its own position.
 */
async function handleFooterPositionChanged(
  params: unknown,
): Promise<FooterOperationResponse> {
  const parsed = footerPositionParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }

  console.log('[Footer] Position changed:', parsed.data);
  // Informational only - acknowledge receipt
  return { success: true };
}

// ============================================
// Registration
// ============================================

/**
 * Register all footer handlers on the given registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerFooterHandlers(registry: HandlerRegistry): void {
  registry.register('footer.show', handleFooterShow, 'Show sticky footer');
  registry.register('footer.hide', handleFooterHide, 'Hide sticky footer');
  registry.register('footer.stateUpdate', handleFooterStateUpdate, 'Update footer state');
  registry.register('footer.action', handleFooterAction, 'Handle footer action');
  registry.register(
    'footer.visibilityChanged',
    handleFooterVisibilityChanged,
    'Footer visibility changed',
  );
  registry.register(
    'footer.positionChanged',
    handleFooterPositionChanged,
    'Footer position changed',
  );
}
