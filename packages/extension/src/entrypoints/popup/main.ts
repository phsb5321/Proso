// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Popup Main Entry Point
 *
 * Handles popup UI interactions and communicates with background script
 * for playback control.
 *
 * @see T132-T141 Phase 7 (US5) Popup UI Implementation
 */

import 'virtual:uno.css';
import { browser } from 'wxt/browser';
import {
  classifyFailure,
  connectLocalHost,
  hasCustomManagedServer,
  isUnconfigured,
  saveByokKey,
} from '../../utils/first-run';
import { createLogger } from '../../utils/logging/logger';
import { testApiKey } from '../../utils/options/api-key-tester';
import {
  hostPermissionPatternForOrigin,
  requestHostPermissionForOrigin,
} from '../../utils/permissions/match-pattern';
import { usageTracker } from '../../utils/telemetry/usage';
import { showPlaybackStartFailure } from './playback-failure';
import { bindPopupTabs } from './popup-tabs';

const log = createLogger('popup');

// ============================================
// Types
// ============================================

interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'error';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number; // 0-100
  speed: number;
  provider: string;
  timingBasis?: 'provider' | 'estimated' | 'none';
}

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Status
  statusDot: document.getElementById('status-dot') as HTMLSpanElement,
  statusText: document.getElementById('status-text') as HTMLSpanElement,
  grantRow: document.getElementById('grant-access-row') as HTMLDivElement,
  grantReason: document.getElementById('grant-access-reason') as HTMLSpanElement,
  grantBtn: document.getElementById('grant-access-btn') as HTMLButtonElement,
  firstRunPanel: document.getElementById('first-run-panel') as HTMLElement,
  firstRunSubtitle: document.getElementById('first-run-subtitle') as HTMLParagraphElement,
  firstRunHostForm: document.getElementById('first-run-host-form') as HTMLFormElement,
  firstRunHostUrl: document.getElementById('first-run-host-url') as HTMLInputElement,
  firstRunHostConnect: document.getElementById('first-run-host-connect') as HTMLButtonElement,
  firstRunHostStatus: document.getElementById('first-run-host-status') as HTMLParagraphElement,
  firstRunByokProvider: document.getElementById('first-run-byok-provider') as HTMLSelectElement,
  firstRunByokKey: document.getElementById('first-run-byok-key') as HTMLInputElement,
  firstRunByokSave: document.getElementById('first-run-byok-save') as HTMLButtonElement,
  firstRunByokStatus: document.getElementById('first-run-byok-status') as HTMLParagraphElement,
  paragraphCurrent: document.getElementById('paragraph-current') as HTMLSpanElement,
  paragraphTotal: document.getElementById('paragraph-total') as HTMLSpanElement,
  timingBasis: document.getElementById('timing-basis') as HTMLParagraphElement,

  // Progress
  progressBar: document.getElementById('progress-bar') as HTMLDivElement,
  progressSeek: document.getElementById('progress-seek') as HTMLInputElement,
  progressContainer: document.getElementById('progress-container') as HTMLDivElement,

  // Controls
  playPauseBtn: document.getElementById('play-pause-btn') as HTMLButtonElement,
  playIcon: document.getElementById('play-icon') as unknown as SVGElement,
  pauseIcon: document.getElementById('pause-icon') as unknown as SVGElement,
  prevBtn: document.getElementById('prev-btn') as HTMLButtonElement,
  nextBtn: document.getElementById('next-btn') as HTMLButtonElement,
  stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,

  // Speed
  speedSlider: document.getElementById('speed-slider') as HTMLInputElement,
  speedValue: document.getElementById('speed-value') as HTMLSpanElement,

  // Export
  exportBtn: document.getElementById('export-btn') as HTMLButtonElement,
  exportBtnText: document.getElementById('export-btn-text') as HTMLSpanElement,
  exportProgress: document.getElementById('export-progress') as HTMLDivElement,
  exportProgressBar: document.getElementById('export-progress-bar') as HTMLDivElement,
  exportProgressText: document.getElementById('export-progress-text') as HTMLSpanElement,
  exportCancelBtn: document.getElementById('export-cancel-btn') as HTMLButtonElement,

  // Footer
  settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
  helpLink: document.getElementById('help-link') as HTMLAnchorElement,
  version: document.getElementById('version') as HTMLSpanElement,

  // Queue
  addToQueueBtn: document.getElementById('add-to-queue-btn') as HTMLButtonElement,
  addQueueBtnText: document.getElementById('add-queue-btn-text') as HTMLSpanElement,
  queueCount: document.getElementById('queue-count') as HTMLSpanElement,
  queueList: document.getElementById('queue-list') as HTMLDivElement,
  queueEmptyMessage: document.getElementById('queue-empty-message') as HTMLParagraphElement,
  queueControls: document.getElementById('queue-controls') as HTMLDivElement,
  playQueueBtn: document.getElementById('play-queue-btn') as HTMLButtonElement,
  clearQueueBtn: document.getElementById('clear-queue-btn') as HTMLButtonElement,

  // Cost display
  costSection: document.getElementById('cost-section') as HTMLElement,
  costEstimate: document.getElementById('cost-estimate') as HTMLSpanElement,
  costSavingsRow: document.getElementById('cost-savings-row') as HTMLDivElement,
  costSavings: document.getElementById('cost-savings') as HTMLSpanElement,

  // Credit balance (T132)
  creditsSection: document.getElementById('credits-section') as HTMLElement,
  creditsRemaining: document.getElementById('credits-remaining') as HTMLSpanElement,
  creditsTotal: document.getElementById('credits-total') as HTMLSpanElement,
  creditsBarFill: document.getElementById('credits-bar-fill') as HTMLDivElement,
  creditsWarning: document.getElementById('credits-warning') as HTMLSpanElement,

  // Provider-dependent sections (hidden by default in CSS)
  exportSection: document.getElementById('export-section') as HTMLElement,

  // Highlight section (T093-T095)
  highlightsSection: document.getElementById('highlights-section') as HTMLElement,
  highlightCount: document.getElementById('highlight-count') as HTMLSpanElement,
  highlightSelection: document.getElementById('highlight-selection') as HTMLDivElement,
  selectionPreview: document.getElementById('selection-preview') as HTMLSpanElement,
  colorPicker: document.getElementById('color-picker') as HTMLDivElement,
  createHighlightBtn: document.getElementById('create-highlight-btn') as HTMLButtonElement,
  noSelectionMsg: document.getElementById('no-selection-msg') as HTMLParagraphElement,

  // Tab navigation
  tabPlayer: document.getElementById('tab-player') as HTMLButtonElement,
  tabTools: document.getElementById('tab-tools') as HTMLButtonElement,
  tabQueue: document.getElementById('tab-queue') as HTMLButtonElement,
  panelPlayer: document.getElementById('panel-player') as HTMLDivElement,
  panelTools: document.getElementById('panel-tools') as HTMLDivElement,
  panelQueue: document.getElementById('panel-queue') as HTMLDivElement,
  queueTabBadge: document.getElementById('queue-tab-badge') as HTMLSpanElement,
};

// ============================================
// State
// ============================================

let currentState: PlaybackState = {
  status: 'stopped',
  currentParagraph: 0,
  totalParagraphs: 0,
  progress: 0,
  speed: 1.0,
  provider: 'elevenlabs',
  timingBasis: 'none',
};
let playbackStartPending = false;
let startRequestInFlight = false;
let stopRequestedDuringStart = false;

// Export state
let currentExportJobId: string | null = null;
let exportPollingInterval: ReturnType<typeof setInterval> | null = null;
let exportPollingTimeout: ReturnType<typeof setTimeout> | null = null;
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Highlight state (T093-T095)
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
let selectedHighlightColor: HighlightColor = 'yellow';
let currentSelectionExact: string | null = null;

// Queue state
interface QueueItem {
  id: string;
  url: string;
  title: string;
  domain: string;
  excerpt?: string;
  status: 'pending' | 'reading' | 'completed' | 'archived';
  progress: number;
  addedAt: number;
  position: number;
}

interface QueueState {
  items: QueueItem[];
  metadata: {
    count: number;
    lastModified: number;
  };
}

let queueState: QueueState = {
  items: [],
  metadata: { count: 0, lastModified: 0 },
};

// ============================================
// UI Update Functions
// ============================================

/**
 * Update status indicator based on playback state
 */
function updateStatus(status: PlaybackState['status']): void {
  elements.statusDot.setAttribute('data-status', status);

  const statusLabels: Record<PlaybackState['status'], string> = {
    stopped: 'Ready',
    loading: 'Loading...',
    playing: 'Playing',
    paused: 'Paused',
    error: 'Error',
  };

  elements.statusText.textContent = statusLabels[status];
}

/**
 * Update play/pause button icon
 */
function updatePlayPauseButton(isPlaying: boolean): void {
  if (isPlaying) {
    elements.playIcon.style.display = 'none';
    elements.pauseIcon.style.display = 'block';
    elements.playPauseBtn.setAttribute('aria-label', 'Pause');
    elements.playPauseBtn.setAttribute('title', 'Pause');
  } else {
    elements.playIcon.style.display = 'block';
    elements.pauseIcon.style.display = 'none';
    elements.playPauseBtn.setAttribute('aria-label', 'Play');
    elements.playPauseBtn.setAttribute('title', 'Play');
  }
}

/**
 * Update paragraph counter display
 */
function updateParagraphInfo(current: number, total: number): void {
  elements.paragraphCurrent.textContent = total > 0 ? String(current + 1) : '-';
  elements.paragraphTotal.textContent = total > 0 ? String(total) : '-';
}

/**
 * Update progress bar
 */
function updateProgress(progress: number): void {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  elements.progressBar.style.width = `${clampedProgress}%`;
  elements.progressSeek.value = String(clampedProgress);
  // progressbar role lives on #progress-bar (the fill), not the wrapper.
  elements.progressBar.setAttribute('aria-valuenow', String(clampedProgress));
}

/**
 * Update speed display
 */
function updateSpeed(speed: number): void {
  elements.speedSlider.value = String(speed);
  elements.speedValue.textContent = `${speed.toFixed(1)}x`;
}

function updateTimingBasis(basis: PlaybackState['timingBasis']): void {
  elements.timingBasis.textContent =
    basis === 'provider' ? 'Word highlighting: provider timed' : 'Word highlighting: approximate';
}

/**
 * Update section visibility based on configured API keys and settings.
 * In the tabbed layout, tool sections are visible by default.
 * This function hides sections that require API keys when those keys aren't configured.
 *
 * - Export section: shown if ElevenLabs API key is configured
 */
async function updateSectionVisibility(): Promise<void> {
  try {
    const result = await browser.storage.local.get(['elevenlabsApiKey', 'provider']);

    // Show Export section only if ElevenLabs audio provider has API key configured
    const hasAudioApiKey = !!result.elevenlabsApiKey;
    if (elements.exportSection) {
      elements.exportSection.hidden = !hasAudioApiKey;
    }

    log.debug('[Popup] Section visibility updated', {
      hasAudioApiKey,
      export: hasAudioApiKey,
    });
  } catch (error) {
    log.error('[Popup] Failed to update section visibility', { error });
  }
}

/**
 * Apply full state update to UI
 */
function applyState(state: PlaybackState): void {
  currentState = state;
  updateStatus(state.status);
  updatePlayPauseButton(state.status === 'playing');
  updateParagraphInfo(state.currentParagraph, state.totalParagraphs);
  updateProgress(state.progress);
  updateTimingBasis(state.timingBasis);
  // Broadcasts can describe the superseded session while this popup's start
  // request is unresolved. Only the owning promise may release that latch.
  setPlaybackStartPending(startRequestInFlight || state.status === 'loading');
  if (typeof state.speed === 'number') {
    updateSpeed(state.speed);
  }
}

// ============================================
// Background Communication
// ============================================

/**
 * Send message to background script
 */
async function sendMessage<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T> {
  try {
    const response = await browser.runtime.sendMessage({ type, ...data });

    // Guard against null/undefined responses from disconnected ports or missing handlers
    if (response === null || response === undefined) {
      log.warn('[Popup] Null response for message', { type });
      return response as T;
    }

    // Guard against non-object responses (strings, numbers) when expecting objects
    if (typeof response === 'object' && 'error' in response && response.error) {
      log.warn('[Popup] Error response for message', { type, error: response.error });
    }

    return response as T;
  } catch (error) {
    log.error('[Popup] Message error', { type, error });
    throw error;
  }
}

/**
 * Fetch current playback state from background
 */
async function fetchPlaybackState(): Promise<void> {
  try {
    const state = await sendMessage<PlaybackState>('playback.getState');
    if (state) {
      applyState(state);
    }
  } catch (error) {
    log.error('[Popup] Failed to fetch playback state', { error });
    // Keep default state on error
  }
}

/**
 * Fetch settings from storage
 */
async function fetchSettings(): Promise<void> {
  try {
    const result = await browser.storage.local.get(['speed', 'provider']);
    if (typeof result.speed === 'number') {
      updateSpeed(result.speed);
      currentState.speed = result.speed;
    }
    if (typeof result.provider === 'string') {
      currentState.provider = result.provider;
    }
  } catch (error) {
    log.error('[Popup] Failed to fetch settings', { error });
  }
}

// ============================================
// Event Handlers
// ============================================

/** Report a playback control failure through the shared status and repair surfaces. */
function reportPlaybackControlError(error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  usageTracker.track('popup.play_pause_error', {
    error: errorMsg,
    stack: error instanceof Error ? error.stack : undefined,
  });
  log.error('[Popup] Play/pause error', { error });
  showPlaybackStartFailure(elements.statusDot, elements.statusText, error);
  void routeFailure(errorMsg);
}

function setPlaybackStartPending(pending: boolean): void {
  playbackStartPending = pending;
  elements.playPauseBtn.disabled = pending;
  if (pending) {
    elements.playPauseBtn.setAttribute('aria-busy', 'true');
  } else {
    elements.playPauseBtn.removeAttribute('aria-busy');
  }
}

/** Start one new reading and reconcile from background-owned state. */
async function startFreshPlayback(): Promise<void> {
  if (playbackStartPending || startRequestInFlight) return;

  startRequestInFlight = true;
  stopRequestedDuringStart = false;
  setPlaybackStartPending(true);
  currentState = { ...currentState, status: 'loading' };
  updateStatus('loading');
  trackClick('playback.play_clicked');
  log.info('[Popup] Starting web page playback');
  usageTracker.track('popup.web_playback_starting');

  let playbackFailure: string | null = null;
  try {
    const result = await sendMessage<Record<string, unknown>>('playback.start');
    if (
      !stopRequestedDuringStart &&
      result &&
      typeof result === 'object' &&
      ('_hexError' in result || 'error' in result)
    ) {
      const errorMsg = String(result.error || 'Playback failed');
      playbackFailure = errorMsg;
      log.warn('[Popup] Playback start failed', { error: errorMsg });
      showPlaybackStartFailure(elements.statusDot, elements.statusText, errorMsg);
      // PROSO-131/134: every fixable failure pairs with its action.
      void routeFailure(errorMsg);
    }
  } catch (error) {
    if (!stopRequestedDuringStart) throw error;
  } finally {
    await fetchPlaybackState();
    startRequestInFlight = false;
    const stoppedByReader = stopRequestedDuringStart;
    stopRequestedDuringStart = false;
    if (playbackFailure && !stoppedByReader) {
      showPlaybackStartFailure(elements.statusDot, elements.statusText, playbackFailure);
    }
    setPlaybackStartPending(currentState.status === 'loading');
  }
}

async function startFreshPlaybackSafely(): Promise<void> {
  try {
    await startFreshPlayback();
  } catch (error) {
    reportPlaybackControlError(error);
  }
}

/**
 * Handle play/pause button click
 */
async function handlePlayPause(): Promise<void> {
  if (playbackStartPending || startRequestInFlight) return;

  usageTracker.track('popup.play_button_clicked', {
    status: currentState.status,
  });

  log.debug('[Popup] handlePlayPause called', {
    status: currentState.status,
  });

  try {
    if (currentState.status === 'playing') {
      trackClick('playback.pause_clicked');
      await sendMessage('playback.pause');
      updateStatus('paused');
      updatePlayPauseButton(false);
    } else if (currentState.status === 'paused') {
      // Resume from paused state
      trackClick('playback.play_clicked', { resumed: true });
      await sendMessage('playback.resume');
      updateStatus('playing');
      updatePlayPauseButton(true);
    } else {
      await startFreshPlaybackSafely();
    }
  } catch (error) {
    reportPlaybackControlError(error);
  }
}

// ============================================
// FIRST-RUN ONBOARDING (PROSO-134 / #27)
// ============================================

// Keep a corrective panel open across asynchronous storage notifications until
// its route either completes or the popup closes.
let firstRunPanelPinned = false;

/**
 * Read the configured-route storage and toggle the first-run panel. When
 * shown, the player controls are hidden so the routes are the only surface.
 */
async function refreshFirstRun(preamble = '', force = false): Promise<void> {
  const stored = await browser.storage.local.get([
    'openaiApiKey',
    'elevenlabsApiKey',
    'groqApiKey',
    'cartesiaApiKey',
    'localHostEnabled',
    'localHostUrl',
    'licenseKey',
    'serverUrl',
  ]);
  // `force` shows the free routes even for a configured reader — the
  // entitlement case: the 402 carries "Show free routes", never a dead end.
  // Persist that choice for this popup lifetime so a route save notification
  // cannot hide an activation error before the reader sees it.
  if (force) firstRunPanelPinned = true;
  const showPanel = firstRunPanelPinned || isUnconfigured(stored);
  elements.firstRunPanel.hidden = !showPanel;
  elements.panelPlayer.classList.toggle('proso-popup__panel--firstrun', showPanel);
  if (showPanel) {
    elements.firstRunSubtitle.textContent =
      preamble.length > 0 ? preamble : 'Two free ways to start — no account, no licence key.';
    // Offer, never probe: prefill only from the reader's own prior entry.
    const prev = stored.localHostUrl as string | undefined;
    if (prev) elements.firstRunHostUrl.value = prev;
  }
}

function setRouteStatus(
  el: HTMLElement,
  text: string,
  kind: 'info' | 'error' | 'ok' = 'info',
): void {
  el.textContent = text;
  el.className = `proso-popup__route-status${
    kind === 'error'
      ? ' proso-popup__route-status--error'
      : kind === 'ok'
        ? ' proso-popup__route-status--ok'
        : ''
  }`;
}

/** The failure row (grant-row markup) doubles as the classified fix action. */
let fixActionKind: 'grant' | 'retry' | 'edit-key' = 'grant';
let routeSetupInFlight = false;
let setupCompletionInFlight = false;

function showFixAction(kind: typeof fixActionKind, action: string, message: string): void {
  fixActionKind = kind;
  elements.grantReason.textContent = message;
  elements.grantBtn.textContent = action;
  elements.grantRow.hidden = false;
}

async function selectProvider(provider: string, validatedApiKey?: string): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: 'provider.select',
    provider,
    ...(validatedApiKey ? { validatedApiKey } : {}),
  });
  if (!response || response.success !== true) {
    const message =
      response &&
      typeof response.error === 'string' &&
      response.error.length > 0 &&
      response.error !== '[object Object]'
        ? response.error
        : `Could not activate ${provider}.`;
    throw new Error(message);
  }
}

/** Leave onboarding and start the selected route exactly once. */
async function completeFirstRunSetup(): Promise<void> {
  if (setupCompletionInFlight) return;
  setupCompletionInFlight = true;
  try {
    clearFixAction();
    firstRunPanelPinned = false;
    await refreshFirstRun();
    await startFreshPlaybackSafely();
  } finally {
    setupCompletionInFlight = false;
  }
}

function beginRouteSetup(active: 'host' | 'byok'): boolean {
  if (routeSetupInFlight) return false;
  routeSetupInFlight = true;
  firstRunPanelPinned = true;
  elements.firstRunHostConnect.disabled = true;
  elements.firstRunByokSave.disabled = true;
  if (active === 'host') elements.firstRunHostConnect.textContent = 'Connecting…';
  return true;
}

function finishRouteSetup(): void {
  routeSetupInFlight = false;
  elements.firstRunHostConnect.disabled = false;
  elements.firstRunHostConnect.textContent = 'Connect';
  elements.firstRunByokSave.disabled = false;
}

/** Route A: validate → grant → test → save → play, from the Connect click. */
async function handleFirstRunConnect(event: Event): Promise<void> {
  event.preventDefault();
  if (!beginRouteSetup('host')) return;

  try {
    setRouteStatus(
      elements.firstRunHostStatus,
      'Contacting the host and asking which voices it has…',
    );
    const result = await connectLocalHost({
      address: elements.firstRunHostUrl.value,
      event,
      perms: browser.permissions as never,
      storage: browser.storage.local as never,
      fetchFn: (url, init) => fetch(url, init),
    });
    if (!result.ok) {
      setRouteStatus(elements.firstRunHostStatus, result.error.message, 'error');
      return;
    }
    try {
      await selectProvider('local');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRouteStatus(
        elements.firstRunHostStatus,
        `The host is ready, but Proso could not activate it. ${message}`,
        'error',
      );
      return;
    }
    setRouteStatus(
      elements.firstRunHostStatus,
      `Connected — ${result.value} voice(s) found. Starting playback…`,
      'ok',
    );
    await completeFirstRunSetup();
  } finally {
    finishRouteSetup();
  }
}

/** Route B: save the BYOK key, then play. */
async function handleFirstRunByok(event: Event): Promise<void> {
  event.preventDefault();
  if (!beginRouteSetup('byok')) return;

  try {
    const provider = elements.firstRunByokProvider.value;
    setRouteStatus(elements.firstRunByokStatus, 'Checking the key…');
    const result = await saveByokKey(provider, elements.firstRunByokKey.value, {
      validate: async (candidateProvider, apiKey) => {
        const response = await testApiKey(candidateProvider, apiKey);
        if (response.success) return { success: true };
        return {
          success: false,
          reason: response.failure,
          message: response.message,
        };
      },
      select: selectProvider,
    });
    if (!result.ok) {
      const message =
        result.error.reason === 'invalid'
          ? `The ${provider} key was rejected — nothing was saved. Check it and try again.`
          : result.error.reason === 'activation'
            ? `The ${provider} key was verified, but Proso could not activate it, so it was not saved. ${result.error.message}`
            : `The ${provider} key could not be verified, so it was not saved. ${result.error.message}`;
      setRouteStatus(elements.firstRunByokStatus, message, 'error');
      return;
    }
    setRouteStatus(
      elements.firstRunByokStatus,
      `Key saved — ${provider} is free on every tier. Starting playback…`,
      'ok',
    );
    await completeFirstRunSetup();
  } finally {
    finishRouteSetup();
  }
}

/**
 * Classify a playback-start failure and surface the fix in the same surface.
 * unconfigured/entitlement → the first-run panel (a 402 is never the
 * introduction); grant-missing/host-unreachable/key-rejected → the failure
 * row with its action (the grant button relabels per class).
 */
async function routeFailure(errorMsg: string): Promise<void> {
  const stored = await browser.storage.local.get([
    'localHostEnabled',
    'serverUrl',
    'openaiApiKey',
    'elevenlabsApiKey',
    'groqApiKey',
    'cartesiaApiKey',
  ]);
  const hasHost = stored.localHostEnabled === true;
  const hasByok = ['openaiApiKey', 'elevenlabsApiKey', 'groqApiKey', 'cartesiaApiKey'].some(
    (k) => typeof stored[k] === 'string' && (stored[k] as string).length > 0,
  );
  const hasManaged = hasCustomManagedServer(stored);
  const cls = classifyFailure(errorMsg, { hasHost, hasByok, hasManaged });
  switch (cls) {
    case 'unconfigured':
      await refreshFirstRun('Choose a free route below to start listening.');
      return;
    case 'entitlement':
      // A genuinely configured route failed entitlement. Keep the failure as
      // context while still offering the free alternatives.
      await refreshFirstRun(errorMsg, true);
      return;
    case 'grant-missing':
      // The existing PROSO-131 affordance owns this class. The failure-row
      // button must perform THIS action, never a previous failure's.
      await maybeShowGrantAffordance(errorMsg);
      return;
    case 'host-unreachable':
      showFixAction('retry', 'Retry', 'The local host stopped responding. Playback paused.');
      return;
    case 'key-rejected':
      showFixAction('edit-key', 'Edit key', errorMsg);
      return;
  }
}

/** PROSO-131: the local-host gate's own failure marker (composition/factories.ts). */
const LOCAL_GATE_REASON_MARKER = 'no access to the configured host origin';

/**
 * The origin the affordance is currently asking the reader to grant.
 *
 * Cached at show time so the grant click can call the permission helper as its
 * FIRST await. The helper invokes `permissions.request()` synchronously before
 * yielding: Firefox otherwise reports `may only be called from a user input
 * handler`. Feature 167 falsifier — a grant action that cannot grant is not an
 * action.
 */
let pendingGrantOrigin: string | null = null;

function clearFixAction(): void {
  fixActionKind = 'grant';
  pendingGrantOrigin = null;
  elements.grantBtn.textContent = 'Grant access';
  elements.grantReason.textContent = '';
  elements.grantRow.hidden = true;
}

/**
 * Show the grant affordance when a playback start failed on the local-host
 * gate: the reader configured the host but the runtime host grant was never
 * made (seeding storage does not grant — only permissions.request() from a
 * user gesture does). The reader sees the gate's OWN reason and a direct
 * action, never a 402 about tiers.
 */
async function maybeShowGrantAffordance(errorMsg: string): Promise<void> {
  if (!errorMsg.includes(LOCAL_GATE_REASON_MARKER)) {
    elements.grantRow.hidden = true;
    pendingGrantOrigin = null;
    return;
  }
  const stored = await browser.storage.local.get(['localHostUrl']);
  const url = stored.localHostUrl as string | undefined;
  let origin = '';
  try {
    origin = url ? new URL(url).origin : '';
  } catch {
    origin = '';
  }
  const permissionPattern = origin ? hostPermissionPatternForOrigin(origin) : null;
  if (!permissionPattern) {
    clearFixAction();
    await refreshFirstRun(
      'The saved host address cannot receive browser access. Enter it again below.',
      true,
    );
    return;
  }
  pendingGrantOrigin = origin;
  showFixAction(
    'grant',
    'Grant access',
    `Browser host permissions cover every port on this host. Proso sends page text only to ${origin}.`,
  );
}

/** Grant the host origin from this click (a user gesture), then retry playback. */
async function handleGrantAccessClick(): Promise<void> {
  // The permission helper MUST be the first await in this handler. It invokes
  // permissions.request() synchronously from the user gesture; any prior await
  // (including a storage read) would expire Firefox's activation. The origin
  // was cached when maybeShowGrantAffordance showed the action.
  const origin = pendingGrantOrigin;
  if (!origin) {
    elements.grantReason.textContent =
      'The saved host address cannot receive browser access. Enter it again in settings.';
    return;
  }
  const permission = await requestHostPermissionForOrigin(origin, browser.permissions);
  if (!permission.ok) {
    elements.grantReason.textContent =
      permission.reason === 'denied'
        ? 'Access was not granted — the local host route stays disabled.'
        : permission.message;
    elements.grantRow.hidden = false;
    return;
  }
  pendingGrantOrigin = null;
  elements.grantRow.hidden = true;
  elements.statusText.textContent = 'Ready';
  elements.statusDot.setAttribute('data-status', 'stopped');
  // Retry the play the reader already asked for, regardless of stale state.
  await startFreshPlaybackSafely();
}

/**
 * Handle previous paragraph button click
 */
async function handlePrev(): Promise<void> {
  trackClick('playback.skip_clicked', { direction: 'previous' });
  try {
    await sendMessage('playback.previous');
  } catch (error) {
    log.error('[Popup] Previous error', { error });
  }
}

/**
 * Handle next paragraph button click
 */
async function handleNext(): Promise<void> {
  trackClick('playback.skip_clicked', { direction: 'next' });
  try {
    await sendMessage('playback.next');
  } catch (error) {
    log.error('[Popup] Next error', { error });
  }
}

/**
 * Handle stop button click
 */
async function handleStop(): Promise<void> {
  trackClick('playback.stop_clicked');
  if (startRequestInFlight) stopRequestedDuringStart = true;
  try {
    await sendMessage('playback.stop');
    applyState({ ...currentState, status: 'stopped', progress: 0 });
  } catch (error) {
    log.error('[Popup] Stop error', { error });
  }
}

/**
 * Handle speed slider change
 */
async function handleSpeedChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const speed = Number.parseFloat(target.value);

  updateSpeed(speed);
  currentState.speed = speed;

  // Track speed change (use regular track, not debounced - slider fires on release)
  usageTracker.track('playback.speed_changed', { speed });

  try {
    await browser.storage.local.set({ speed });
    // Persist to settings store
    await sendMessage('settings.update', { speed });
    // T019: Also send runtime message to update active playback immediately
    await sendMessage('playback.setSpeed', { speed });
  } catch (error) {
    log.error('[Popup] Speed change error', { error });
  }
}

/**
 * Handle progress seek
 */
async function handleProgressSeek(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const progress = Number.parseFloat(target.value);

  updateProgress(progress);

  try {
    await sendMessage('playback.seek', { progress });
  } catch (error) {
    log.error('[Popup] Seek error', { error });
  }
}

/**
 * Handle settings button click - opens options page in dedicated tab
 * NOTE: We use browser.tabs.create() instead of browser.runtime.openOptionsPage()
 * because Firefox embeds options_ui pages inside about:addons which looks ugly.
 */
async function handleSettingsClick(): Promise<void> {
  try {
    // Firefox may destroy the popup context as soon as window.close() runs.
    // Wait until the settings tab exists before closing, or a perfectly valid
    // public click can disappear without opening anything.
    await browser.tabs.create({
      url: (browser.runtime as unknown as { getURL: (path: string) => string }).getURL(
        'settings.html',
      ),
    });
    window.close();
  } catch (error) {
    // Keep the popup open so the reader can retry instead of turning a failed
    // tab creation into a silent no-op.
    log.error('[Popup] Failed to open settings', { error });
  }
}

/**
 * Handle help link click
 */
function handleHelpClick(event: Event): void {
  event.preventDefault();
  browser.tabs.create({
    url: 'https://github.com/phsb5321/Proso#usage',
  });
  window.close();
}

// ============================================
// Export Functions
// ============================================

/**
 * Update export UI based on progress
 */
function updateExportProgress(percent: number, statusText: string): void {
  elements.exportProgressBar.style.setProperty('--progress', `${percent}%`);
  elements.exportProgressText.textContent = statusText;
}

/**
 * Show export progress UI
 */
function showExportProgress(): void {
  elements.exportBtn.hidden = true;
  elements.exportProgress.hidden = false;
}

/**
 * Hide export progress UI
 */
function hideExportProgress(): void {
  elements.exportBtn.hidden = false;
  elements.exportProgress.hidden = true;
  elements.exportBtnText.textContent = 'Download MP3';
  elements.exportBtn.disabled = false;
}

/**
 * Start polling for export progress
 */
function startExportPolling(jobId: string): void {
  if (exportPollingInterval) {
    clearInterval(exportPollingInterval);
  }
  if (exportPollingTimeout) {
    clearTimeout(exportPollingTimeout);
  }

  // FR-004: 10-minute timeout for export polling
  exportPollingTimeout = setTimeout(async () => {
    log.warn('[Popup] Export polling timed out after 10 minutes');
    stopExportPolling();
    updateExportProgress(0, 'Export timed out');

    // Cancel the export job on the background side
    try {
      await sendMessage('export.cancel', { jobId });
    } catch {
      // Best-effort cleanup
    }

    setTimeout(() => {
      hideExportProgress();
      currentExportJobId = null;
    }, 3000);
  }, EXPORT_TIMEOUT_MS);

  exportPollingInterval = setInterval(async () => {
    try {
      const response = await sendMessage<{
        status: string;
        currentParagraph: number;
        totalParagraphs: number;
        percentComplete: number;
        error?: string;
      }>('export.getProgress', { jobId });

      if (response.status === 'complete') {
        stopExportPolling();
        updateExportProgress(100, 'Complete! Starting download...');

        // Trigger download
        await sendMessage('export.download', { jobId });

        // Reset UI after short delay
        setTimeout(() => {
          hideExportProgress();
          currentExportJobId = null;
        }, 1500);
      } else if (response.status === 'error') {
        stopExportPolling();
        updateExportProgress(0, `Error: ${response.error || 'Unknown error'}`);
        setTimeout(() => {
          hideExportProgress();
          currentExportJobId = null;
        }, 3000);
      } else {
        const statusText =
          response.status === 'generating'
            ? `Generating audio... ${response.currentParagraph}/${response.totalParagraphs}`
            : response.status === 'encoding'
              ? 'Encoding MP3...'
              : 'Preparing...';
        updateExportProgress(response.percentComplete, statusText);
      }
    } catch (error) {
      log.error('[Popup] Export progress error', { error });
    }
  }, 500);
}

/**
 * Stop polling for export progress
 */
function stopExportPolling(): void {
  if (exportPollingInterval) {
    clearInterval(exportPollingInterval);
    exportPollingInterval = null;
  }
  if (exportPollingTimeout) {
    clearTimeout(exportPollingTimeout);
    exportPollingTimeout = null;
  }
}

/**
 * Handle export button click
 */
async function handleExportClick(): Promise<void> {
  if (currentExportJobId) {
    log.debug('[Popup] Export already in progress');
    return;
  }

  try {
    elements.exportBtn.disabled = true;
    elements.exportBtnText.textContent = 'Starting...';

    // Get current tab to request paragraphs
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }

    // Request paragraphs from content script
    const contentResponse = (await browser.tabs.sendMessage(tab.id, {
      type: 'getParagraphs',
    })) as { paragraphs?: Array<{ index: number; text: string }> };

    if (!contentResponse?.paragraphs?.length) {
      throw new Error('No content to export');
    }

    // Generate job ID
    const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Start export
    const response = await sendMessage<{ success: boolean; jobId: string; error?: string }>(
      'export.start',
      {
        jobId,
        paragraphs: contentResponse.paragraphs,
        provider: currentState.provider,
        speed: currentState.speed,
        quality: '192',
      },
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to start export');
    }

    currentExportJobId = jobId;
    showExportProgress();
    updateExportProgress(0, 'Starting...');
    startExportPolling(jobId);
  } catch (error) {
    log.error('[Popup] Export error', { error });
    elements.exportBtnText.textContent = error instanceof Error ? error.message : 'Export failed';
    setTimeout(() => {
      elements.exportBtnText.textContent = 'Download MP3';
      elements.exportBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle export cancel button click
 */
async function handleExportCancel(): Promise<void> {
  if (!currentExportJobId) return;

  try {
    stopExportPolling();
    await sendMessage('export.cancel', { jobId: currentExportJobId });
    hideExportProgress();
    currentExportJobId = null;
  } catch (error) {
    log.error('[Popup] Export cancel error', { error });
  }
}

// ============================================
// Queue Functions (T076, T078)
// ============================================

/**
 * Update queue count badge
 */
function updateQueueBadge(count: number): void {
  // Update tab badge
  if (elements.queueTabBadge) {
    if (count > 0) {
      elements.queueTabBadge.textContent = String(count);
      elements.queueTabBadge.hidden = false;
    } else {
      elements.queueTabBadge.hidden = true;
    }
  }

  elements.queueCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
}

/**
 * Render queue items in the sidebar
 */
function renderQueueItems(items: QueueItem[]): void {
  // Clear existing items
  while (elements.queueList.firstChild) {
    elements.queueList.removeChild(elements.queueList.firstChild);
  }

  if (items.length === 0) {
    elements.queueEmptyMessage.hidden = false;
    elements.queueList.appendChild(elements.queueEmptyMessage);
    elements.queueControls.hidden = true;
    return;
  }

  elements.queueEmptyMessage.hidden = true;
  elements.queueControls.hidden = false;

  items.forEach((item) => {
    const itemEl = document.createElement('div');
    itemEl.className = `proso-popup__queue-item proso-popup__queue-item--${item.status}`;
    itemEl.dataset.id = item.id;

    // Status icon
    const statusIcon = document.createElement('span');
    statusIcon.className = 'proso-popup__queue-item-status';
    if (item.status === 'completed') {
      statusIcon.textContent = '✓';
    } else if (item.status === 'reading') {
      statusIcon.textContent = '▶';
    } else {
      statusIcon.textContent = '○';
    }

    // Info section
    const infoEl = document.createElement('div');
    infoEl.className = 'proso-popup__queue-item-info';

    const titleEl = document.createElement('span');
    titleEl.className = 'proso-popup__queue-item-title';
    titleEl.textContent = item.title.length > 40 ? item.title.substring(0, 40) + '...' : item.title;
    titleEl.title = item.title;

    const domainEl = document.createElement('span');
    domainEl.className = 'proso-popup__queue-item-domain';
    domainEl.textContent = item.domain;

    infoEl.appendChild(titleEl);
    infoEl.appendChild(domainEl);

    // Progress bar (for reading items)
    if (item.status === 'reading' && item.progress > 0) {
      const progressEl = document.createElement('div');
      progressEl.className = 'proso-popup__queue-item-progress';
      progressEl.style.setProperty('--progress', `${item.progress}%`);
      infoEl.appendChild(progressEl);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'proso-popup__queue-item-remove';
    removeBtn.title = 'Remove from queue';
    removeBtn.setAttribute('aria-label', 'Remove from queue');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleRemoveFromQueue(item.id);
    });

    itemEl.appendChild(statusIcon);
    itemEl.appendChild(infoEl);
    itemEl.appendChild(removeBtn);

    // Click to play this item
    itemEl.addEventListener('click', () => handlePlayQueueItem(item.id));

    elements.queueList.appendChild(itemEl);
  });
}

/**
 * Fetch queue state from background
 */
async function fetchQueueState(): Promise<void> {
  try {
    const response = await sendMessage<QueueState>('queue.getState');
    if (response) {
      // Defensive: ensure items array exists (handles malformed responses)
      queueState = {
        items: response.items ?? [],
        metadata: response.metadata ?? { count: 0, lastModified: 0 },
      };
      updateQueueBadge(queueState.items.length);
      renderQueueItems(queueState.items);
    }
  } catch (error) {
    log.error('[Popup] Failed to fetch queue state', { error });
  }
}

/**
 * Handle add to queue button click
 */
async function handleAddToQueue(): Promise<void> {
  trackClick('queue.item_added', { source: 'popup' });
  try {
    elements.addToQueueBtn.disabled = true;
    elements.addQueueBtnText.textContent = 'Adding...';

    // Get current tab info
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !tab.title) {
      throw new Error('Cannot add this page to queue');
    }

    // Get article excerpt from content script
    let excerpt = '';
    try {
      const contentResponse = (await browser.tabs.sendMessage(tab.id, {
        type: 'getArticleText',
      })) as { text?: string };
      if (contentResponse?.text) {
        excerpt = contentResponse.text.substring(0, 200);
      }
    } catch {
      // Content script might not be loaded
    }

    // Add to queue via background
    const response = await sendMessage<{
      success?: boolean;
      id?: string;
      position?: number;
      error?: string;
    }>('queue.add', {
      url: tab.url,
      title: tab.title,
      excerpt,
      faviconUrl: tab.favIconUrl,
    });

    if (!response || (response.success !== true && typeof response.id !== 'string')) {
      throw new Error(response?.error || 'Failed to add to queue');
    }

    // Update UI
    elements.addQueueBtnText.textContent = 'Added!';
    await fetchQueueState();

    setTimeout(() => {
      elements.addQueueBtnText.textContent = 'Add to Queue';
      elements.addToQueueBtn.disabled = false;
    }, 1500);
  } catch (error) {
    log.error('[Popup] Add to queue error', { error });
    elements.addQueueBtnText.textContent = error instanceof Error ? error.message : 'Failed';
    setTimeout(() => {
      elements.addQueueBtnText.textContent = 'Add to Queue';
      elements.addToQueueBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle remove from queue
 */
async function handleRemoveFromQueue(id: string): Promise<void> {
  trackClick('queue.item_removed', { source: 'popup' });
  try {
    await sendMessage('queue.remove', { id });
    await fetchQueueState();
  } catch (error) {
    log.error('[Popup] Remove from queue error', { error });
  }
}

/**
 * Handle play queue item
 */
async function handlePlayQueueItem(id: string): Promise<void> {
  trackClick('queue.item_played', { source: 'popup' });
  try {
    await sendMessage('queue.play', { startFromId: id });
  } catch (error) {
    log.error('[Popup] Play queue item error', { error });
  }
}

/**
 * Handle play queue button click
 */
async function handlePlayQueue(): Promise<void> {
  trackClick('queue.play_all', { source: 'popup' });
  try {
    await sendMessage('queue.play', {});
  } catch (error) {
    log.error('[Popup] Play queue error', { error });
  }
}

/**
 * Handle clear queue button click
 */
async function handleClearQueue(): Promise<void> {
  trackClick('queue.cleared', { source: 'popup' });
  try {
    await sendMessage('queue.clear', { filter: 'completed' });
    await fetchQueueState();
  } catch (error) {
    log.error('[Popup] Clear queue error', { error });
  }
}

// ============================================
// Cost Display Functions (T071-T072)
// ============================================

/**
 * Cost estimate response type
 */
interface CostEstimateResponse {
  totalCharacters: number;
  cachedCharacters: number;
  uncachedCharacters: number;
  provider: string;
  pricePerKiloChar: number;
  estimatedCost: number;
  actualCost: number;
  savingsFromCache: number;
  savingsPercentage: number;
}

/**
 * Format cost as display string
 */
function formatCostDisplay(cost: number): string {
  if (cost === 0) {
    return 'Free';
  }
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format savings with percentage
 */
function formatSavingsDisplay(savings: number, percentage: number): string {
  if (savings === 0) {
    return '$0.00 (0%)';
  }
  return `${formatCostDisplay(savings)} (${Math.round(percentage)}%)`;
}

/**
 * Update cost display in the popup UI
 */
function updateCostDisplay(estimate: CostEstimateResponse): void {
  if (!elements.costSection) return;

  // Update estimated cost
  elements.costEstimate.textContent = formatCostDisplay(estimate.actualCost);

  // Update savings (show row only if there are savings)
  if (estimate.savingsFromCache > 0) {
    elements.costSavingsRow.hidden = false;
    elements.costSavings.textContent = formatSavingsDisplay(
      estimate.savingsFromCache,
      estimate.savingsPercentage,
    );
  } else {
    elements.costSavingsRow.hidden = true;
  }

  // Show the cost section
  elements.costSection.hidden = false;
}

/**
 * Hide cost display
 */
function hideCostDisplay(): void {
  if (elements.costSection) {
    elements.costSection.hidden = true;
  }
}

/**
 * Fetch cost estimate for current page
 */
async function fetchCostEstimate(): Promise<void> {
  try {
    // Check if cost display is enabled in settings
    const settings = await browser.storage.local.get(['showCostEstimate', 'provider', 'voice']);
    if (settings.showCostEstimate === false) {
      hideCostDisplay();
      return;
    }

    // Get current tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      hideCostDisplay();
      return;
    }

    // Request paragraphs from content script
    const contentResponse = (await browser.tabs.sendMessage(tab.id, {
      type: 'getParagraphs',
    })) as { paragraphs?: Array<{ index: number; text: string }> };

    if (!contentResponse?.paragraphs?.length) {
      // No content, show as free
      elements.costEstimate.textContent = 'Free';
      elements.costSavingsRow.hidden = true;
      elements.costSection.hidden = false;
      return;
    }

    // Extract text from paragraphs
    const paragraphTexts = contentResponse.paragraphs.map((p) => p.text);

    // Request cost estimate from background
    const response = await sendMessage<CostEstimateResponse>('cost.estimate', {
      url: tab.url,
      paragraphs: paragraphTexts,
      provider: settings.provider || currentState.provider,
      voice: settings.voice || '',
    });

    if (response) {
      updateCostDisplay(response);
    }
  } catch (error) {
    log.error('[Popup] Failed to fetch cost estimate', { error });
    // On error, hide cost section silently
    hideCostDisplay();
  }
}

// ============================================
// Credit Balance (T132/T133)
// ============================================

/**
 * Credit balance response from background handler.
 */
interface CreditBalanceResult {
  success: boolean;
  balance?: {
    total: number;
    remaining: number;
    usagePercent: number;
    periodStart?: string;
    periodEnd?: string;
  };
  error?: { type: string; message: string };
}

/**
 * Determine credit warning level from usage percent.
 * - normal:    >50% remaining (usagePercent < 50)
 * - warning:   10-50% remaining (usagePercent 50-90)
 * - critical:  <10% remaining (usagePercent > 90)
 * - exhausted: 0 remaining
 */
function getCreditLevel(
  remaining: number,
  usagePercent: number,
): 'normal' | 'warning' | 'critical' | 'exhausted' {
  if (remaining <= 0) return 'exhausted';
  if (usagePercent > 90) return 'critical';
  if (usagePercent >= 50) return 'warning';
  return 'normal';
}

/**
 * Format a credit number for display (e.g. 123456 -> "123,456").
 */
function formatCredits(n: number): string {
  return n.toLocaleString();
}

/**
 * Update the credit balance display in the popup.
 */
function updateCreditDisplay(balance: CreditBalanceResult['balance']): void {
  if (!balance || !elements.creditsSection) return;

  const { total, remaining, usagePercent } = balance;
  const level = getCreditLevel(remaining, usagePercent);
  const remainingPercent = Math.max(0, Math.min(100, 100 - usagePercent));

  // Update text
  elements.creditsRemaining.textContent = formatCredits(remaining);
  elements.creditsTotal.textContent = `/ ${formatCredits(total)}`;

  // Update progress bar
  elements.creditsBarFill.style.width = `${remainingPercent}%`;

  // Remove previous level classes
  elements.creditsBarFill.classList.remove(
    'proso-popup__credits-bar-fill--normal',
    'proso-popup__credits-bar-fill--warning',
    'proso-popup__credits-bar-fill--critical',
    'proso-popup__credits-bar-fill--exhausted',
  );
  elements.creditsBarFill.classList.add(`proso-popup__credits-bar-fill--${level}`);

  // Update warning text (T133)
  elements.creditsWarning.classList.remove(
    'proso-popup__credits-warning--warning',
    'proso-popup__credits-warning--critical',
    'proso-popup__credits-warning--exhausted',
  );

  if (level === 'exhausted') {
    elements.creditsWarning.textContent = 'Credits exhausted \u2014 upgrade to continue';
    elements.creditsWarning.classList.add('proso-popup__credits-warning--exhausted');
    elements.creditsWarning.hidden = false;
  } else if (level === 'critical') {
    elements.creditsWarning.textContent = `Low credits \u2014 ${formatCredits(remaining)} remaining`;
    elements.creditsWarning.classList.add('proso-popup__credits-warning--critical');
    elements.creditsWarning.hidden = false;
  } else if (level === 'warning') {
    elements.creditsWarning.textContent = `${formatCredits(remaining)} credits remaining`;
    elements.creditsWarning.classList.add('proso-popup__credits-warning--warning');
    elements.creditsWarning.hidden = false;
  } else {
    elements.creditsWarning.hidden = true;
  }

  // Show the section
  elements.creditsSection.hidden = false;
}

/**
 * Fetch credit balance from background (non-blocking).
 * Hidden for BYOK/free-tier users (not_configured response).
 */
async function fetchCreditBalance(): Promise<void> {
  try {
    const result = await sendMessage<CreditBalanceResult>('credit.getBalance');

    if (!result || !result.success || !result.balance) {
      // Not configured or error — hide section silently
      if (elements.creditsSection) {
        elements.creditsSection.hidden = true;
      }
      return;
    }

    updateCreditDisplay(result.balance);
  } catch (error) {
    log.error('[Popup] Failed to fetch credit balance', { error });
    if (elements.creditsSection) {
      elements.creditsSection.hidden = true;
    }
  }
}

// ============================================
// Message Listener (State Updates from Background)
// ============================================

function setupMessageListener(): void {
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'playbackStateUpdate' && message.state) {
      // Merge broadcast state with current state (broadcast may not include all fields)
      const merged: PlaybackState = { ...currentState, ...message.state };
      applyState(merged);
    }
    // Handle queue updates from cross-tab sync
    if (message.type === 'queue.updated') {
      fetchQueueState();
    }
    return undefined;
  });
}

// ============================================
// Initialization
// ============================================

/**
 * Set up event listeners
 */
function setupEventListeners(): void {
  // Playback controls
  // PROSO-131: the grant button is the popup-side repair for a missing
  // runtime host grant — permissions.request() must run from this click.
  elements.grantBtn.addEventListener('click', () => {
    if (fixActionKind === 'retry') {
      void startFreshPlaybackSafely();
      return;
    }
    if (fixActionKind === 'edit-key') {
      void refreshFirstRun('Edit your provider key below to start listening.', true);
      return;
    }
    void handleGrantAccessClick();
  });

  // PROSO-134/#27: first-run actions. Both connect handlers pass the click
  // event so permissions.request() fires from the gesture (falsifier D).
  elements.firstRunHostForm.addEventListener('submit', (event) => {
    void handleFirstRunConnect(event);
  });
  elements.firstRunByokSave.addEventListener('click', (event) => {
    void handleFirstRunByok(event);
  });

  elements.playPauseBtn.addEventListener('click', handlePlayPause);
  elements.prevBtn.addEventListener('click', handlePrev);
  elements.nextBtn.addEventListener('click', handleNext);
  elements.stopBtn.addEventListener('click', handleStop);

  // Speed control
  elements.speedSlider.addEventListener('input', handleSpeedChange);

  // Progress seek
  elements.progressSeek.addEventListener('input', handleProgressSeek);

  // Footer actions
  elements.settingsBtn.addEventListener('click', handleSettingsClick);
  elements.helpLink.addEventListener('click', handleHelpClick);

  // Export controls
  elements.exportBtn.addEventListener('click', handleExportClick);
  elements.exportCancelBtn.addEventListener('click', handleExportCancel);

  // Queue controls
  elements.addToQueueBtn.addEventListener('click', handleAddToQueue);
  elements.playQueueBtn.addEventListener('click', handlePlayQueue);
  elements.clearQueueBtn.addEventListener('click', handleClearQueue);

  // Tab navigation
  bindPopupTabs({
    player: { tab: elements.tabPlayer, panel: elements.panelPlayer },
    tools: { tab: elements.tabTools, panel: elements.panelTools },
    queue: { tab: elements.tabQueue, panel: elements.panelQueue },
  });

  // Highlight controls (T093-T095)
  setupHighlightListeners();
}

/**
 * Display extension version
 */
async function displayVersion(): Promise<void> {
  try {
    const manifest = browser.runtime.getManifest();
    elements.version.textContent = `v${manifest.version}`;
  } catch (error) {
    log.error('[Popup] Failed to get version', { error });
  }
}

/**
 * Track a user interaction event.
 * Debounces rapid clicks to prevent duplicate events.
 */
const trackClickDebounce = new Map<string, number>();
const CLICK_DEBOUNCE_MS = 300;

function trackClick(eventType: string, data?: Record<string, unknown>): void {
  const now = Date.now();
  const lastClick = trackClickDebounce.get(eventType) || 0;

  if (now - lastClick < CLICK_DEBOUNCE_MS) {
    return; // Skip duplicate rapid click
  }

  trackClickDebounce.set(eventType, now);
  usageTracker.track(eventType, data);
}

// ============================================
// Highlights (T093-T095)
// ============================================

/**
 * Setup highlight event listeners.
 */
function setupHighlightListeners(): void {
  // Color picker buttons
  if (elements.colorPicker) {
    elements.colorPicker.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-color]');
      if (btn) {
        const color = btn.getAttribute('data-color') as HighlightColor;
        selectHighlightColor(color);
      }
    });
  }

  // Create highlight button
  if (elements.createHighlightBtn) {
    elements.createHighlightBtn.addEventListener('click', handleCreateHighlight);
  }
}

/**
 * Initialize highlight section - fetch count and check for selection.
 */
async function initHighlights(): Promise<void> {
  // Fetch highlight count for current page
  await fetchHighlightCount();

  // Check if there's a current selection in the content script
  await checkForSelection();
}

/**
 * Fetch highlight count for current page.
 */
async function fetchHighlightCount(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url) return;

    const response = (await browser.runtime.sendMessage({
      type: 'highlight.list',
      url: tab.url,
    })) as { success: boolean; highlights: unknown[] };

    if (response.success && elements.highlightCount) {
      elements.highlightCount.textContent = String(response.highlights.length);
    }
  } catch (error) {
    log.error('[Popup] Failed to fetch highlight count', { error });
  }
}

/**
 * Check if content script has active text selection.
 */
async function checkForSelection(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return;

    const response = (await browser.tabs.sendMessage(tab.id, {
      action: 'highlight.getSelection',
    })) as { success: boolean; selector: { exact: string } | null };

    if (response.success && response.selector) {
      showSelectionUI(response.selector.exact);
    } else {
      hideSelectionUI();
    }
  } catch (_error) {
    // Content script may not be injected - ignore
    hideSelectionUI();
  }
}

/**
 * Show the selection UI with preview text.
 */
function showSelectionUI(exactText: string): void {
  currentSelectionExact = exactText;

  if (elements.highlightSelection) {
    elements.highlightSelection.hidden = false;
  }
  if (elements.noSelectionMsg) {
    elements.noSelectionMsg.hidden = true;
  }
  if (elements.selectionPreview) {
    // Truncate preview to 50 chars
    const preview = exactText.length > 50 ? exactText.slice(0, 50) + '...' : exactText;
    elements.selectionPreview.textContent = preview;
  }
}

/**
 * Hide the selection UI.
 */
function hideSelectionUI(): void {
  currentSelectionExact = null;

  if (elements.highlightSelection) {
    elements.highlightSelection.hidden = true;
  }
  if (elements.noSelectionMsg) {
    elements.noSelectionMsg.hidden = false;
  }
}

/**
 * Select a highlight color.
 */
function selectHighlightColor(color: HighlightColor): void {
  selectedHighlightColor = color;

  // Update UI to show selected color
  if (elements.colorPicker) {
    const buttons = elements.colorPicker.querySelectorAll('[data-color]');
    buttons.forEach((btn) => {
      const isSelected = btn.getAttribute('data-color') === color;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', String(isSelected));
    });
  }
}

/**
 * Handle create highlight button click.
 */
async function handleCreateHighlight(): Promise<void> {
  if (!currentSelectionExact) {
    log.warn('[Popup] No selection to highlight');
    return;
  }

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return;

    // Tell content script to create the highlight
    const response = (await browser.tabs.sendMessage(tab.id, {
      action: 'highlight.create',
      color: selectedHighlightColor,
    })) as { success: boolean; id?: string; error?: string };

    if (response.success) {
      log.info('[Popup] Highlight created', { id: response.id });
      // Update highlight count
      await fetchHighlightCount();
      // Hide selection UI
      hideSelectionUI();
      // Track event
      trackClick('highlight.created', { color: selectedHighlightColor });
    } else {
      log.error('[Popup] Failed to create highlight', { error: response.error });
    }
  } catch (error) {
    log.error('[Popup] Failed to create highlight', { error });
  }
}

/**
 * Main initialization
 */
async function init(): Promise<void> {
  log.info('[Popup] Initializing...');

  // Public controls must work as soon as the popup DOM is visible. State reads
  // may await storage/background work, so bind first.
  setupEventListeners();
  setupMessageListener();

  // Display version
  await displayVersion();

  // Fetch initial state
  await fetchSettings();
  await fetchPlaybackState();
  await fetchQueueState();

  // Update section visibility based on configured API keys
  await updateSectionVisibility();

  // PROSO-134/#27: first-run state at init, re-checked on storage change.
  await refreshFirstRun();
  // The webextension test env mocks storage.local but not onChanged — guard.
  browser.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const routeKeys = [
      'localHostEnabled',
      'localHostUrl',
      'licenseKey',
      'serverUrl',
      'openaiApiKey',
      'elevenlabsApiKey',
      'groqApiKey',
      'cartesiaApiKey',
    ];
    if (routeKeys.some((k) => k in changes)) {
      void refreshFirstRun();
    }
  });

  // Fetch cost estimate (non-blocking)
  fetchCostEstimate().catch((err) => {
    log.error('[Popup] Cost estimate fetch failed', { error: err });
  });

  // Fetch credit balance (non-blocking, T132)
  fetchCreditBalance().catch((err) => {
    log.error('[Popup] Credit balance fetch failed', { error: err });
  });

  // Initialize highlights (T093-T095)
  initHighlights().catch((err) => {
    log.error('[Popup] Highlights init failed', { error: err });
  });

  log.info('[Popup] Initialized');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
