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
import type { HandlerRegistry } from './registry';

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
// Handler Parameters
// ============================================

interface FooterShowParams {
  tabId: number;
}

interface FooterHideParams {
  tabId: number;
}

interface FooterStateUpdateParams {
  tabId: number;
  status: FooterState['status'];
  currentIndex: number;
  totalParagraphs: number;
  progress: number;
  currentText: string;
  speed: number;
}

interface FooterActionParams {
  action: string;
  value?: number | string;
}

interface FooterVisibilityParams {
  isMinimized?: boolean;
  isVisible?: boolean;
}

interface FooterPositionParams {
  x: number | 'center' | 'left' | 'right';
  yOffset: number;
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
async function handleFooterShow(params: FooterShowParams): Promise<FooterOperationResponse> {
  const sync = getHighlightSync();
  const tabId = params.tabId || activeTabId;

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
async function handleFooterHide(params: FooterHideParams): Promise<FooterOperationResponse> {
  const sync = getHighlightSync();
  const tabId = params.tabId || activeTabId;

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
  params: FooterStateUpdateParams,
): Promise<FooterOperationResponse> {
  const sync = getHighlightSync();
  const tabId = params.tabId || activeTabId;

  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }

  const state: FooterState = {
    status: params.status,
    currentIndex: params.currentIndex,
    totalParagraphs: params.totalParagraphs,
    progress: params.progress,
    currentText: params.currentText,
    speed: params.speed,
  };

  const result = await sync.updateFooterState(tabId, state);

  if (isErr(result)) {
    return { success: false, error: result.error.type };
  }

  return { success: true };
}

/**
 * Handle footer action (play, pause, next, prev, etc.).
 * This is a passthrough handler - actual action execution
 * is handled by the playback handlers.
 */
async function handleFooterAction(params: FooterActionParams): Promise<FooterActionResponse> {
  // Log the action for telemetry
  console.log('[Footer] Action received:', params.action, params.value);

  // Return success - the actual action will be dispatched
  // to the appropriate playback handler by the background
  return {
    success: true,
    action: params.action,
  };
}

/**
 * Handle footer visibility change (minimize/expand).
 * This is informational - the footer handles its own state.
 */
async function handleFooterVisibilityChanged(
  params: FooterVisibilityParams,
): Promise<FooterOperationResponse> {
  console.log('[Footer] Visibility changed:', params);
  // Informational only - acknowledge receipt
  return { success: true };
}

/**
 * Handle footer position change (drag).
 * This is informational - the footer persists its own position.
 */
async function handleFooterPositionChanged(
  params: FooterPositionParams,
): Promise<FooterOperationResponse> {
  console.log('[Footer] Position changed:', params);
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
