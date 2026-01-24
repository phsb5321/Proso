// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Popup Main Entry Point
 *
 * Handles popup UI interactions and communicates with background script
 * for playback control.
 *
 * @see T132-T141 Phase 7 (US5) Popup UI Implementation
 */

// Import CSS directly - Vite will handle this for both dev and prod
import './style.css';

import { browser } from 'wxt/browser';
import { usageTracker } from '../../utils/telemetry/usage';

// ============================================
// Types
// ============================================

interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number; // 0-100
  speed: number;
  provider: string;
}

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Status
  statusDot: document.getElementById('status-dot') as HTMLSpanElement,
  statusText: document.getElementById('status-text') as HTMLSpanElement,
  paragraphCurrent: document.getElementById('paragraph-current') as HTMLSpanElement,
  paragraphTotal: document.getElementById('paragraph-total') as HTMLSpanElement,

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

  // Provider
  providerSelect: document.getElementById('provider-select') as HTMLSelectElement,

  // Summarize
  summarizeBtn: document.getElementById('summarize-btn') as HTMLButtonElement,
  summarizeBtnText: document.getElementById('summarize-btn-text') as HTMLSpanElement,
  summaryDisplay: document.getElementById('summary-display') as HTMLDivElement,
  summaryBullets: document.getElementById('summary-bullets') as HTMLUListElement,
  readSummaryBtn: document.getElementById('read-summary-btn') as HTMLButtonElement,
  closeSummaryBtn: document.getElementById('close-summary-btn') as HTMLButtonElement,

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
  toggleQueueBtn: document.getElementById('toggle-queue-btn') as HTMLButtonElement,
  queueCountBadge: document.getElementById('queue-count-badge') as HTMLSpanElement,
  queueSidebar: document.getElementById('queue-sidebar') as HTMLDivElement,
  queueCount: document.getElementById('queue-count') as HTMLSpanElement,
  queueList: document.getElementById('queue-list') as HTMLDivElement,
  queueEmptyMessage: document.getElementById('queue-empty-message') as HTMLParagraphElement,
  queueControls: document.getElementById('queue-controls') as HTMLDivElement,
  playQueueBtn: document.getElementById('play-queue-btn') as HTMLButtonElement,
  clearQueueBtn: document.getElementById('clear-queue-btn') as HTMLButtonElement,

  // Cost display
  costSection: document.getElementById('cost-section') as HTMLElement,
  costProviderRow: document.getElementById('cost-provider-row') as HTMLDivElement,
  costProvider: document.getElementById('cost-provider') as HTMLSpanElement,
  costEstimate: document.getElementById('cost-estimate') as HTMLSpanElement,
  costSavingsRow: document.getElementById('cost-savings-row') as HTMLDivElement,
  costSavings: document.getElementById('cost-savings') as HTMLSpanElement,

  // Language selection (048-multilingual-tts-pillar: T032-T035)
  languageSelect: document.getElementById('language-select') as HTMLSelectElement,
  languageBadge: document.getElementById('language-badge') as HTMLSpanElement,
  redetectLanguageBtn: document.getElementById('redetect-language-btn') as HTMLButtonElement,

  // Language compatibility warning (048-multilingual-tts-pillar: T041-T044)
  languageWarning: document.getElementById('language-warning') as HTMLDivElement,
  languageWarningText: document.getElementById('language-warning-text') as HTMLSpanElement,
  languageWarningSwitchBtn: document.getElementById(
    'language-warning-switch-btn',
  ) as HTMLButtonElement,
  suggestedProviderName: document.getElementById('suggested-provider-name') as HTMLSpanElement,
  languageWarningDismissBtn: document.getElementById(
    'language-warning-dismiss-btn',
  ) as HTMLButtonElement,

  // Collapsible sections (hidden by default in CSS)
  summarizeSection: document.getElementById('summarize-section') as HTMLElement,
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
  provider: 'browser',
};

// Export state
let currentExportJobId: string | null = null;
let exportPollingInterval: ReturnType<typeof setInterval> | null = null;

// Summarize state
let currentSummaryBullets: Array<{ text: string }> = [];

// Highlight state (T093-T095)
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
let selectedHighlightColor: HighlightColor = 'yellow';
let currentSelectionExact: string | null = null;

// Language state (048-multilingual-tts-pillar: T032-T038)
interface LanguageState {
  detected: {
    code: string;
    confidence: number;
    source: 'metadata' | 'text' | 'fallback';
  } | null;
  override: string | null;
  effective: string;
  autoDetect: boolean;
}

let languageState: LanguageState = {
  detected: null,
  override: null,
  effective: 'en',
  autoDetect: true,
};

// Provider compatibility state (048-multilingual-tts-pillar: T041-T044)
interface ProviderCompatibility {
  supported: boolean;
  provider: string;
  language: string;
  suggestedProviders?: string[];
}

let compatibilityWarningDismissed = false;
let suggestedProvider: string | null = null;

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
let isQueueSidebarOpen = false;

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
  elements.progressContainer.setAttribute('aria-valuenow', String(clampedProgress));
}

/**
 * Update speed display
 */
function updateSpeed(speed: number): void {
  elements.speedSlider.value = String(speed);
  elements.speedValue.textContent = `${speed.toFixed(1)}x`;
}

/**
 * Update provider selection
 */
function updateProvider(provider: string): void {
  elements.providerSelect.value = provider;
}

/**
 * Update provider mode indicator (049-tts-provider-consolidation: T040)
 * Shows "Manual" badge when provider override is active
 */
function updateProviderModeIndicator(isManual: boolean): void {
  const label =
    document.querySelector('[for="provider-select"]') ||
    document.querySelector('.voxpage-popup__provider-label');
  if (!label) return;

  // Remove existing badge if any
  const existingBadge = label.querySelector('.provider-mode-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Add "Manual" badge if override is active
  if (isManual) {
    const badge = document.createElement('span');
    badge.className = 'provider-mode-badge';
    badge.textContent = 'Manual';
    badge.style.cssText = `
      font-size: 10px;
      padding: 2px 6px;
      margin-left: 6px;
      background: #6366f1;
      color: white;
      border-radius: 4px;
      font-weight: 500;
      vertical-align: middle;
    `;
    label.appendChild(badge);
  }
}

// ============================================
// Tab Navigation Functions
// ============================================

type TabId = 'player' | 'tools' | 'queue';

/**
 * Switch to a different tab panel
 */
function switchTab(tabId: TabId): void {
  const tabs = [elements.tabPlayer, elements.tabTools, elements.tabQueue];
  const panels = [elements.panelPlayer, elements.panelTools, elements.panelQueue];
  const tabMap: Record<TabId, { tab: HTMLButtonElement; panel: HTMLDivElement }> = {
    player: { tab: elements.tabPlayer, panel: elements.panelPlayer },
    tools: { tab: elements.tabTools, panel: elements.panelTools },
    queue: { tab: elements.tabQueue, panel: elements.panelQueue },
  };

  // Deactivate all tabs and panels
  tabs.forEach((tab) => {
    if (tab) {
      tab.classList.remove('voxpage-popup__tab--active');
      tab.setAttribute('aria-selected', 'false');
    }
  });
  panels.forEach((panel) => {
    if (panel) {
      panel.classList.remove('voxpage-popup__panel--active');
      panel.hidden = true;
    }
  });

  // Activate the selected tab and panel
  const selected = tabMap[tabId];
  if (selected.tab) {
    selected.tab.classList.add('voxpage-popup__tab--active');
    selected.tab.setAttribute('aria-selected', 'true');
  }
  if (selected.panel) {
    selected.panel.classList.add('voxpage-popup__panel--active');
    selected.panel.hidden = false;
  }

  console.log('[Popup] Switched to tab:', tabId);
}

/**
 * Handle tab click events
 */
function handleTabClick(event: Event): void {
  const target = event.currentTarget as HTMLButtonElement;
  const tabId = target.dataset.tab as TabId;
  if (tabId) {
    switchTab(tabId);
  }
}

/**
 * Update section visibility based on configured API keys and settings.
 * In the tabbed layout, tool sections are visible by default.
 * This function hides sections that require API keys when those keys aren't configured.
 *
 * - Summarize section: shown if OpenAI or Anthropic API key is configured
 * - Export section: shown if ElevenLabs API key is configured
 */
async function updateSectionVisibility(): Promise<void> {
  try {
    const result = await browser.storage.local.get([
      'openaiApiKey',
      'anthropicApiKey',
      'elevenlabsApiKey',
      'provider',
    ]);

    // Show Summarize section only if AI API key (OpenAI or Anthropic) is configured
    const hasAIKey = !!(result.openaiApiKey || result.anthropicApiKey);
    if (elements.summarizeSection) {
      elements.summarizeSection.hidden = !hasAIKey;
    }

    // Show Export section only if ElevenLabs audio provider has API key configured
    const hasAudioApiKey = !!result.elevenlabsApiKey;
    if (elements.exportSection) {
      elements.exportSection.hidden = !hasAudioApiKey;
    }

    console.log('[Popup] Section visibility updated:', {
      hasAIKey,
      hasAudioApiKey,
      summarize: hasAIKey,
      export: hasAudioApiKey,
    });
  } catch (error) {
    console.error('[Popup] Failed to update section visibility:', error);
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
  updateSpeed(state.speed);
  updateProvider(state.provider);
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
    return response as T;
  } catch (error) {
    console.error('[Popup] Message error:', type, error);
    throw error;
  }
}

/**
 * Fetch current playback state from background
 */
async function fetchPlaybackState(): Promise<void> {
  try {
    const state = await sendMessage<PlaybackState>('getPlaybackState');
    if (state) {
      applyState(state);
    }
  } catch (error) {
    console.error('[Popup] Failed to fetch playback state:', error);
    // Keep default state on error
  }
}

/**
 * Fetch settings from storage
 */
async function fetchSettings(): Promise<void> {
  try {
    // 049-tts-provider-consolidation: Also fetch providerOverride for T040
    const result = await browser.storage.local.get(['speed', 'provider', 'providerOverride']);
    if (typeof result.speed === 'number') {
      updateSpeed(result.speed);
      currentState.speed = result.speed;
    }
    if (typeof result.provider === 'string') {
      updateProvider(result.provider);
      currentState.provider = result.provider;
    }
    // T040: Show "Manual" badge if provider override is active
    const hasOverride = result.providerOverride !== null && result.providerOverride !== undefined;
    updateProviderModeIndicator(hasOverride);
  } catch (error) {
    console.error('[Popup] Failed to fetch settings:', error);
  }
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle play/pause button click
 */
async function handlePlayPause(): Promise<void> {
  usageTracker.track('popup.play_button_clicked', {
    status: currentState.status,
  });

  console.log('[Popup] handlePlayPause called, state:', {
    status: currentState.status,
  });

  try {
    if (currentState.status === 'playing') {
      trackClick('playback.pause_clicked');
      await sendMessage('pausePlayback');
      updateStatus('paused');
      updatePlayPauseButton(false);
    } else if (currentState.status === 'paused') {
      // Resume from paused state
      trackClick('playback.play_clicked', { resumed: true });
      await sendMessage('resumePlayback');
      updateStatus('playing');
      updatePlayPauseButton(true);
    } else {
      // Start fresh playback
      trackClick('playback.play_clicked');
      console.log('[Popup] Starting web page playback');
      usageTracker.track('popup.web_playback_starting');
      await sendMessage('startPlayback');
      updateStatus('loading');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    usageTracker.track('popup.play_pause_error', {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error('[Popup] Play/pause error:', error);
  }
}

/**
 * Handle previous paragraph button click
 */
async function handlePrev(): Promise<void> {
  trackClick('playback.skip_clicked', { direction: 'previous' });
  try {
    await sendMessage('previousParagraph');
  } catch (error) {
    console.error('[Popup] Previous error:', error);
  }
}

/**
 * Handle next paragraph button click
 */
async function handleNext(): Promise<void> {
  trackClick('playback.skip_clicked', { direction: 'next' });
  try {
    await sendMessage('nextParagraph');
  } catch (error) {
    console.error('[Popup] Next error:', error);
  }
}

/**
 * Handle stop button click
 */
async function handleStop(): Promise<void> {
  trackClick('playback.stop_clicked');
  try {
    await sendMessage('stopPlayback');
    updateStatus('stopped');
    updatePlayPauseButton(false);
  } catch (error) {
    console.error('[Popup] Stop error:', error);
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
    await sendMessage('updateSettings', { speed });
  } catch (error) {
    console.error('[Popup] Speed change error:', error);
  }
}

/**
 * Handle provider selection change
 */
async function handleProviderChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  const provider = target.value;

  currentState.provider = provider;

  // Track provider change
  usageTracker.track('settings.provider_changed', {
    provider,
    source: 'popup',
  });

  try {
    await browser.storage.local.set({ provider });
    await sendMessage('updateSettings', { provider });

    // Check provider compatibility with current language (T040)
    await checkProviderCompatibility();
  } catch (error) {
    console.error('[Popup] Provider change error:', error);
  }
}

// ============================================
// Language Override Functions (048-multilingual-tts-pillar: T032-T038)
// ============================================

/**
 * Update language dropdown to reflect current state
 * T047, T050, T051: Badge shows confidence states and override indicator
 */
function updateLanguageUI(): void {
  if (!elements.languageSelect) return;

  // Set dropdown value based on override or auto
  if (languageState.override) {
    elements.languageSelect.value = languageState.override;
  } else {
    elements.languageSelect.value = 'auto';
  }

  // Update badge with detected language and confidence state
  if (elements.languageBadge) {
    // Remove all state classes first
    elements.languageBadge.classList.remove(
      'voxpage-popup__language-badge--high',
      'voxpage-popup__language-badge--low',
      'voxpage-popup__language-badge--override',
    );

    if (languageState.override) {
      // T051: Show override state with edit icon
      elements.languageBadge.textContent = languageState.override.toUpperCase();
      elements.languageBadge.title = `Manual override: ${languageState.override}`;
      elements.languageBadge.classList.add('voxpage-popup__language-badge--override');
      elements.languageBadge.hidden = false;
    } else if (languageState.detected) {
      // Show detected language with confidence state
      elements.languageBadge.textContent = languageState.detected.code.toUpperCase();
      const confidence = languageState.detected.confidence;
      const confidencePercent = Math.round(confidence * 100);

      // T050: Show warning state when detection confidence is low (<90%)
      if (confidence < 0.9) {
        elements.languageBadge.classList.add('voxpage-popup__language-badge--low');
        elements.languageBadge.title = `Detected: ${languageState.detected.code} (${confidencePercent}% confidence - low)`;
      } else {
        elements.languageBadge.classList.add('voxpage-popup__language-badge--high');
        elements.languageBadge.title = `Detected: ${languageState.detected.code} (${confidencePercent}% confidence)`;
      }
      elements.languageBadge.hidden = false;
    } else {
      elements.languageBadge.hidden = true;
    }
  }
}

/**
 * Fetch language state from background
 */
async function fetchLanguageState(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await sendMessage<LanguageState>('language.getState', { tabId: tab.id });
    if (response) {
      languageState = response;
      updateLanguageUI();
      console.log('[Popup] Language state fetched:', languageState);
    }
  } catch (error) {
    console.error('[Popup] Failed to fetch language state:', error);
  }
}

/**
 * Handle language selection change
 */
async function handleLanguageChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  const value = target.value;

  try {
    if (value === 'auto') {
      // Clear override - return to auto-detect
      await sendMessage('language.clearOverride');
      languageState.override = null;
      languageState.effective = languageState.detected?.code || 'en';

      usageTracker.track('language.override_cleared', {
        source: 'popup',
        previousOverride: languageState.override,
      });

      console.log('[Popup] Language override cleared');
    } else {
      // Set language override
      await sendMessage('language.setOverride', { languageCode: value });
      languageState.override = value;
      languageState.effective = value;

      usageTracker.track('language.override_set', {
        source: 'popup',
        languageCode: value,
        previousDetected: languageState.detected?.code,
      });

      console.log('[Popup] Language override set to:', value);
    }

    updateLanguageUI();

    // Check provider compatibility after language change (T040)
    await checkProviderCompatibility();
  } catch (error) {
    console.error('[Popup] Language change error:', error);
    // Revert UI on error
    updateLanguageUI();
  }
}

/**
 * Handle re-detect language button click
 * Clears language cache and triggers fresh detection
 */
async function handleRedetectLanguage(): Promise<void> {
  try {
    // Show loading state on button
    const btn = elements.redetectLanguageBtn;
    btn.disabled = true;
    btn.classList.add('voxpage-button--loading');

    console.log('[Popup] Re-detecting language...');

    // Clear language cache and override via message to background
    await sendMessage('language.redetect');

    // Wait a moment for the content script to re-detect
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Refresh language state
    await fetchLanguageState();
    updateLanguageUI();

    usageTracker.track('language.redetect', {
      source: 'popup',
      newDetected: languageState.detected?.code,
    });

    console.log('[Popup] Language re-detection complete:', languageState.detected?.code);
  } catch (error) {
    console.error('[Popup] Re-detect language error:', error);
  } finally {
    // Reset button state
    const btn = elements.redetectLanguageBtn;
    btn.disabled = false;
    btn.classList.remove('voxpage-button--loading');
  }
}

// ============================================
// Provider Compatibility Functions (048-multilingual-tts-pillar: T039-T044)
// ============================================

/**
 * Provider display name mapping
 * 049-tts-provider-consolidation: Only ElevenLabs and Browser
 */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  elevenlabs: 'ElevenLabs',
  browser: 'Browser (Free)',
};

/**
 * Get display name for provider
 */
function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider;
}

/**
 * Check if current provider supports the effective language
 */
async function checkProviderCompatibility(): Promise<void> {
  // Skip if warning was dismissed this session
  if (compatibilityWarningDismissed) {
    hideCompatibilityWarning();
    return;
  }

  const effectiveLanguage = languageState.effective;
  const currentProvider = currentState.provider;

  if (!effectiveLanguage || !currentProvider) {
    hideCompatibilityWarning();
    return;
  }

  try {
    const response = await sendMessage<{
      ok: boolean;
      value?: ProviderCompatibility;
      error?: { type: string; message: string };
    }>('provider.validateLanguage', {
      language: effectiveLanguage,
      provider: currentProvider,
    });

    // Handle Result<T, E> response pattern
    if (response?.ok && response.value) {
      const validation = response.value;

      if (!validation.supported) {
        // Show warning with suggested provider
        showCompatibilityWarning(effectiveLanguage, currentProvider, validation.suggestedProviders);
      } else {
        hideCompatibilityWarning();
      }
    } else {
      hideCompatibilityWarning();
    }
  } catch (error) {
    console.error('[Popup] Provider compatibility check failed:', error);
    hideCompatibilityWarning();
  }
}

/**
 * Show the provider compatibility warning
 */
function showCompatibilityWarning(
  language: string,
  provider: string,
  suggestedProviders?: string[],
): void {
  if (!elements.languageWarning) return;

  // Get language display name
  const languageNames: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    pl: 'Polish',
    tr: 'Turkish',
    ru: 'Russian',
    nl: 'Dutch',
    cs: 'Czech',
    ar: 'Arabic',
    zh: 'Chinese',
    hu: 'Hungarian',
    ko: 'Korean',
    ja: 'Japanese',
    hi: 'Hindi',
    sv: 'Swedish',
    id: 'Indonesian',
    uk: 'Ukrainian',
    el: 'Greek',
    fi: 'Finnish',
    ro: 'Romanian',
    da: 'Danish',
    bg: 'Bulgarian',
    ms: 'Malay',
    sk: 'Slovak',
    hr: 'Croatian',
    ta: 'Tamil',
    fil: 'Filipino',
  };

  const languageName = languageNames[language] || language.toUpperCase();
  const providerName = PROVIDER_DISPLAY_NAMES[provider] || provider;

  // Update warning text
  if (elements.languageWarningText) {
    elements.languageWarningText.textContent = `${providerName} may not fully support ${languageName}. Audio quality may be affected.`;
  }

  // Set suggested provider (first one that's not current)
  suggestedProvider = suggestedProviders?.find((p) => p !== provider) || 'browser';

  if (elements.suggestedProviderName) {
    elements.suggestedProviderName.textContent =
      PROVIDER_DISPLAY_NAMES[suggestedProvider] || suggestedProvider;
  }

  // Show warning
  elements.languageWarning.hidden = false;

  usageTracker.track('language.compatibility_warning_shown', {
    language,
    provider,
    suggestedProvider,
  });
}

/**
 * Hide the provider compatibility warning
 */
function hideCompatibilityWarning(): void {
  if (elements.languageWarning) {
    elements.languageWarning.hidden = true;
  }
}

/**
 * Handle switching to suggested provider
 */
async function handleSwitchToSuggestedProvider(): Promise<void> {
  if (!suggestedProvider) return;

  try {
    // Update provider selection
    elements.providerSelect.value = suggestedProvider;
    currentState.provider = suggestedProvider;

    // Save to storage and notify background
    await browser.storage.local.set({ provider: suggestedProvider });
    await sendMessage('updateSettings', { provider: suggestedProvider });

    usageTracker.track('language.provider_switched_from_warning', {
      fromProvider: currentState.provider,
      toProvider: suggestedProvider,
      language: languageState.effective,
    });

    // Hide warning after switch
    hideCompatibilityWarning();

    console.log('[Popup] Switched to suggested provider:', suggestedProvider);
  } catch (error) {
    console.error('[Popup] Failed to switch provider:', error);
  }
}

/**
 * Handle dismissing the compatibility warning (suppress for session)
 */
function handleDismissCompatibilityWarning(): void {
  compatibilityWarningDismissed = true;
  hideCompatibilityWarning();

  usageTracker.track('language.compatibility_warning_dismissed', {
    language: languageState.effective,
    provider: currentState.provider,
  });

  console.log('[Popup] Compatibility warning dismissed for this session');
}

/**
 * Handle progress seek
 */
async function handleProgressSeek(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const progress = Number.parseFloat(target.value);

  updateProgress(progress);

  try {
    await sendMessage('seekToPosition', { progress });
  } catch (error) {
    console.error('[Popup] Seek error:', error);
  }
}

/**
 * Handle settings button click - opens options page in dedicated tab
 * NOTE: We use browser.tabs.create() instead of browser.runtime.openOptionsPage()
 * because Firefox embeds options_ui pages inside about:addons which looks ugly.
 */
function handleSettingsClick(): void {
  browser.tabs.create({
    url: (browser.runtime as unknown as { getURL: (path: string) => string }).getURL(
      'settings.html',
    ),
  });
  window.close();
}

/**
 * Handle help link click
 */
function handleHelpClick(event: Event): void {
  event.preventDefault();
  browser.tabs.create({
    url: 'https://github.com/phsb5321/VoxPage#usage',
  });
  window.close();
}

// ============================================
// Summarize Functions
// ============================================

/**
 * Show summary display with bullets
 */
function showSummaryDisplay(bullets: Array<{ text: string }>): void {
  currentSummaryBullets = bullets;

  // Clear existing bullets using safe DOM methods
  while (elements.summaryBullets.firstChild) {
    elements.summaryBullets.removeChild(elements.summaryBullets.firstChild);
  }

  bullets.forEach((bullet) => {
    const li = document.createElement('li');
    li.textContent = bullet.text;
    elements.summaryBullets.appendChild(li);
  });

  elements.summarizeBtn.hidden = true;
  elements.summaryDisplay.hidden = false;
}

/**
 * Hide summary display
 */
function hideSummaryDisplay(): void {
  elements.summarizeBtn.hidden = false;
  elements.summaryDisplay.hidden = true;
  elements.summarizeBtnText.textContent = 'Summarize';
  elements.summarizeBtn.disabled = false;
  currentSummaryBullets = [];
}

/**
 * Handle summarize button click
 */
async function handleSummarizeClick(): Promise<void> {
  try {
    elements.summarizeBtn.disabled = true;
    elements.summarizeBtnText.textContent = 'Summarizing...';

    // Get current tab to request article text
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }

    // Request article text from content script
    const contentResponse = (await browser.tabs.sendMessage(tab.id, {
      type: 'getArticleText',
    })) as { text?: string; title?: string; url?: string };

    if (!contentResponse?.text || contentResponse.text.length < 100) {
      throw new Error('Not enough content to summarize');
    }

    // Request summarization from background
    const response = await sendMessage<{
      success: boolean;
      bullets: Array<{ text: string }>;
      error?: string;
    }>('summarize.article', {
      text: contentResponse.text,
      title: contentResponse.title,
      url: contentResponse.url,
      provider: 'elevenlabs', // Default to ElevenLabs for summarization TTS
      bulletCount: 5,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to summarize');
    }

    showSummaryDisplay(response.bullets);
  } catch (error) {
    console.error('[Popup] Summarize error:', error);
    elements.summarizeBtnText.textContent =
      error instanceof Error ? error.message : 'Summarize failed';
    setTimeout(() => {
      elements.summarizeBtnText.textContent = 'Summarize';
      elements.summarizeBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle read summary button click
 */
async function handleReadSummaryClick(): Promise<void> {
  if (currentSummaryBullets.length === 0) return;

  try {
    await sendMessage('summarize.readSummary', {
      bullets: currentSummaryBullets,
      provider: currentState.provider,
      speed: currentState.speed,
    });
  } catch (error) {
    console.error('[Popup] Read summary error:', error);
  }
}

/**
 * Handle close summary button click
 */
function handleCloseSummaryClick(): void {
  hideSummaryDisplay();
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
      console.error('[Popup] Export progress error:', error);
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
}

/**
 * Handle export button click
 */
async function handleExportClick(): Promise<void> {
  if (currentExportJobId) {
    console.log('[Popup] Export already in progress');
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
    console.error('[Popup] Export error:', error);
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
    console.error('[Popup] Export cancel error:', error);
  }
}

// ============================================
// Queue Functions (T076, T078)
// ============================================

/**
 * Update queue count badge
 */
function updateQueueBadge(count: number): void {
  // Update legacy badge (hidden, for compatibility)
  if (count > 0) {
    elements.queueCountBadge.textContent = String(count);
    elements.queueCountBadge.hidden = false;
  } else {
    elements.queueCountBadge.hidden = true;
  }

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
    itemEl.className = `voxpage-popup__queue-item voxpage-popup__queue-item--${item.status}`;
    itemEl.dataset.id = item.id;

    // Status icon
    const statusIcon = document.createElement('span');
    statusIcon.className = 'voxpage-popup__queue-item-status';
    if (item.status === 'completed') {
      statusIcon.textContent = '✓';
    } else if (item.status === 'reading') {
      statusIcon.textContent = '▶';
    } else {
      statusIcon.textContent = '○';
    }

    // Info section
    const infoEl = document.createElement('div');
    infoEl.className = 'voxpage-popup__queue-item-info';

    const titleEl = document.createElement('span');
    titleEl.className = 'voxpage-popup__queue-item-title';
    titleEl.textContent = item.title.length > 40 ? item.title.substring(0, 40) + '...' : item.title;
    titleEl.title = item.title;

    const domainEl = document.createElement('span');
    domainEl.className = 'voxpage-popup__queue-item-domain';
    domainEl.textContent = item.domain;

    infoEl.appendChild(titleEl);
    infoEl.appendChild(domainEl);

    // Progress bar (for reading items)
    if (item.status === 'reading' && item.progress > 0) {
      const progressEl = document.createElement('div');
      progressEl.className = 'voxpage-popup__queue-item-progress';
      progressEl.style.setProperty('--progress', `${item.progress}%`);
      infoEl.appendChild(progressEl);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'voxpage-popup__queue-item-remove';
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
      if (isQueueSidebarOpen) {
        renderQueueItems(queueState.items);
      }
    }
  } catch (error) {
    console.error('[Popup] Failed to fetch queue state:', error);
  }
}

/**
 * Toggle queue sidebar visibility
 */
function toggleQueueSidebar(): void {
  isQueueSidebarOpen = !isQueueSidebarOpen;
  elements.queueSidebar.hidden = !isQueueSidebarOpen;
  elements.toggleQueueBtn.setAttribute('aria-expanded', String(isQueueSidebarOpen));

  if (isQueueSidebarOpen) {
    renderQueueItems(queueState.items ?? []);
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
      success: boolean;
      id: string;
      position: number;
      error?: string;
    }>('queue.add', {
      url: tab.url,
      title: tab.title,
      excerpt,
      faviconUrl: tab.favIconUrl,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to add to queue');
    }

    // Update UI
    elements.addQueueBtnText.textContent = 'Added!';
    await fetchQueueState();

    setTimeout(() => {
      elements.addQueueBtnText.textContent = 'Add to Queue';
      elements.addToQueueBtn.disabled = false;
    }, 1500);
  } catch (error) {
    console.error('[Popup] Add to queue error:', error);
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
    console.error('[Popup] Remove from queue error:', error);
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
    console.error('[Popup] Play queue item error:', error);
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
    console.error('[Popup] Play queue error:', error);
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
    console.error('[Popup] Clear queue error:', error);
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
function updateCostDisplay(estimate: CostEstimateResponse, provider?: string): void {
  if (!elements.costSection) return;

  // Update provider name display
  if (elements.costProvider && provider) {
    elements.costProvider.textContent = getProviderDisplayName(provider);
  }

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

    // Check if URL is injectable (content scripts only work on http/https)
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      hideCostDisplay();
      return;
    }

    // Request paragraphs from content script
    // Use catch to gracefully handle cases where content script isn't loaded
    const contentResponse = (await browser.tabs
      .sendMessage(tab.id, {
        type: 'getParagraphs',
      })
      .catch(() => null)) as { paragraphs?: Array<{ index: number; text: string }> } | null;

    if (!contentResponse?.paragraphs?.length) {
      // No content, show as free
      const provider = (settings.provider as string) || currentState.provider;
      if (elements.costProvider) {
        elements.costProvider.textContent = getProviderDisplayName(provider);
      }
      elements.costEstimate.textContent = 'Free';
      elements.costSavingsRow.hidden = true;
      elements.costSection.hidden = false;
      return;
    }

    // Extract text from paragraphs
    const paragraphTexts = contentResponse.paragraphs.map((p) => p.text);

    const provider = (settings.provider as string) || currentState.provider;

    // Request cost estimate from background
    const response = await sendMessage<CostEstimateResponse>('cost.estimate', {
      url: tab.url,
      paragraphs: paragraphTexts,
      provider,
      voice: settings.voice || '',
    });

    if (response) {
      updateCostDisplay(response, provider);
    }
  } catch (error) {
    console.error('[Popup] Failed to fetch cost estimate:', error);
    // On error, hide cost section silently
    hideCostDisplay();
  }
}

// ============================================
// Message Listener (State Updates from Background)
// ============================================

function setupMessageListener(): void {
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'playbackStateUpdate' && message.state) {
      applyState(message.state as PlaybackState);
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
  elements.playPauseBtn.addEventListener('click', handlePlayPause);
  elements.prevBtn.addEventListener('click', handlePrev);
  elements.nextBtn.addEventListener('click', handleNext);
  elements.stopBtn.addEventListener('click', handleStop);

  // Speed control
  elements.speedSlider.addEventListener('input', handleSpeedChange);

  // Provider selection
  elements.providerSelect.addEventListener('change', handleProviderChange);

  // Language selection (048-multilingual-tts-pillar: T032-T035)
  if (elements.languageSelect) {
    elements.languageSelect.addEventListener('change', handleLanguageChange);
  }
  if (elements.redetectLanguageBtn) {
    elements.redetectLanguageBtn.addEventListener('click', handleRedetectLanguage);
  }

  // Language compatibility warning (048-multilingual-tts-pillar: T041-T044)
  if (elements.languageWarningSwitchBtn) {
    elements.languageWarningSwitchBtn.addEventListener('click', handleSwitchToSuggestedProvider);
  }
  if (elements.languageWarningDismissBtn) {
    elements.languageWarningDismissBtn.addEventListener('click', handleDismissCompatibilityWarning);
  }

  // Progress seek
  elements.progressSeek.addEventListener('input', handleProgressSeek);

  // Footer actions
  elements.settingsBtn.addEventListener('click', handleSettingsClick);
  elements.helpLink.addEventListener('click', handleHelpClick);

  // Summarize controls
  elements.summarizeBtn.addEventListener('click', handleSummarizeClick);
  elements.readSummaryBtn.addEventListener('click', handleReadSummaryClick);
  elements.closeSummaryBtn.addEventListener('click', handleCloseSummaryClick);

  // Export controls
  elements.exportBtn.addEventListener('click', handleExportClick);
  elements.exportCancelBtn.addEventListener('click', handleExportCancel);

  // Queue controls
  elements.addToQueueBtn.addEventListener('click', handleAddToQueue);
  elements.toggleQueueBtn.addEventListener('click', toggleQueueSidebar);
  elements.playQueueBtn.addEventListener('click', handlePlayQueue);
  elements.clearQueueBtn.addEventListener('click', handleClearQueue);

  // Tab navigation
  elements.tabPlayer.addEventListener('click', handleTabClick);
  elements.tabTools.addEventListener('click', handleTabClick);
  elements.tabQueue.addEventListener('click', handleTabClick);

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
    console.error('[Popup] Failed to get version:', error);
  }
}

// ============================================
// Telemetry (T016: Popup Telemetry)
// ============================================

/**
 * Initialize usage tracker for popup context.
 * Loads config from storage and tracks popup.opened event.
 */
async function initTelemetry(): Promise<void> {
  try {
    // Load telemetry config from storage
    const stored = await browser.storage.local.get([
      'telemetryEnabled',
      'telemetryGatewayUrl',
      'telemetryGatewayToken',
    ]);

    // Skip if telemetry is disabled
    if (stored.telemetryEnabled === false) {
      console.log('[Popup] Telemetry disabled by user');
      return;
    }

    // Only initialize if gateway is configured
    const gatewayUrl =
      (stored.telemetryGatewayUrl as string) || 'https://voxpage-logs.home301server.com.br/ingest';
    const gatewayToken =
      (stored.telemetryGatewayToken as string) || '5Q0LlZ+6fcJ0wAPsSXtJzaf2rfd64fN6vUx84wWlzwY=';

    await usageTracker.initialize({
      gatewayUrl,
      gatewayToken,
      entrypoint: 'popup',
      debugMode: process.env.NODE_ENV !== 'production',
    });

    // Track popup opened
    usageTracker.track('popup.opened', {
      provider: currentState.provider,
    });

    // Track popup closed on unload
    window.addEventListener('beforeunload', () => {
      usageTracker.track('popup.closed', {
        provider: currentState.provider,
      });
      // Best-effort flush
      usageTracker.destroy();
    });

    console.log('[Popup] Telemetry initialized');
  } catch (error) {
    console.warn('[Popup] Telemetry init failed:', error);
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
    console.error('[Popup] Failed to fetch highlight count:', error);
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
  } catch (error) {
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
    console.warn('[Popup] No selection to highlight');
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
      console.log('[Popup] Highlight created:', response.id);
      // Update highlight count
      await fetchHighlightCount();
      // Hide selection UI
      hideSelectionUI();
      // Track event
      trackClick('highlight.created', { color: selectedHighlightColor });
    } else {
      console.error('[Popup] Failed to create highlight:', response.error);
    }
  } catch (error) {
    console.error('[Popup] Failed to create highlight:', error);
  }
}

/**
 * Main initialization
 */
async function init(): Promise<void> {
  console.log('[Popup] Initializing...');

  // T016: Initialize usage tracker for popup telemetry
  await initTelemetry();

  // Set up event listeners
  setupEventListeners();

  // Set up message listener for state updates
  setupMessageListener();

  // Display version
  await displayVersion();

  // Fetch initial state
  await fetchSettings();
  await fetchPlaybackState();
  await fetchQueueState();

  // Fetch language state (048-multilingual-tts-pillar: T038)
  await fetchLanguageState();

  // Check provider compatibility after language state is fetched (T040)
  await checkProviderCompatibility();

  // Update section visibility based on configured API keys
  await updateSectionVisibility();

  // Fetch cost estimate (non-blocking)
  fetchCostEstimate().catch((err) => {
    console.error('[Popup] Cost estimate fetch failed:', err);
  });

  // Initialize highlights (T093-T095)
  initHighlights().catch((err) => {
    console.error('[Popup] Highlights init failed:', err);
  });

  console.log('[Popup] Initialized');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
