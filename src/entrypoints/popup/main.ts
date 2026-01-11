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

  // OCR
  ocrBtn: document.getElementById('ocr-btn') as HTMLButtonElement,
  ocrBtnText: document.getElementById('ocr-btn-text') as HTMLSpanElement,
  ocrResult: document.getElementById('ocr-result') as HTMLDivElement,
  ocrConfidence: document.getElementById('ocr-confidence') as HTMLSpanElement,
  ocrText: document.getElementById('ocr-text') as HTMLParagraphElement,
  readOcrBtn: document.getElementById('read-ocr-btn') as HTMLButtonElement,
  closeOcrBtn: document.getElementById('close-ocr-btn') as HTMLButtonElement,

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
  costEstimate: document.getElementById('cost-estimate') as HTMLSpanElement,
  costSavingsRow: document.getElementById('cost-savings-row') as HTMLDivElement,
  costSavings: document.getElementById('cost-savings') as HTMLSpanElement,

  // Collapsible sections (hidden by default in CSS)
  summarizeSection: document.getElementById('summarize-section') as HTMLElement,
  ocrSection: document.getElementById('ocr-section') as HTMLElement,
  exportSection: document.getElementById('export-section') as HTMLElement,

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

// OCR state
let currentOcrText = '';

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

// PDF state (T033: PDF reading support)
let isPDFPage = false;
let currentPDFUrl: string | null = null;

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
 * - Export section: shown if a non-browser audio provider API key is configured
 * - OCR section: always shown (uses Tesseract.js locally)
 */
async function updateSectionVisibility(): Promise<void> {
  try {
    const result = await browser.storage.local.get([
      'openaiApiKey',
      'anthropicApiKey',
      'elevenlabsApiKey',
      'groqApiKey',
      'cartesiaApiKey',
      'provider',
    ]);

    // Show Summarize section only if AI API key (OpenAI or Anthropic) is configured
    const hasAIKey = !!(result.openaiApiKey || result.anthropicApiKey);
    if (elements.summarizeSection) {
      elements.summarizeSection.hidden = !hasAIKey;
    }

    // Show Export section only if non-browser audio provider has API key configured
    const hasAudioApiKey = !!(
      result.elevenlabsApiKey ||
      result.openaiApiKey ||
      result.groqApiKey ||
      result.cartesiaApiKey
    );
    if (elements.exportSection) {
      elements.exportSection.hidden = !hasAudioApiKey;
    }

    // OCR section: always show (uses local Tesseract.js, no API key needed)
    if (elements.ocrSection) {
      elements.ocrSection.hidden = false;
    }

    console.log('[Popup] Section visibility updated:', {
      hasAIKey,
      hasAudioApiKey,
      summarize: hasAIKey,
      export: hasAudioApiKey,
      ocr: true,
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
    const result = await browser.storage.local.get(['speed', 'provider']);
    if (typeof result.speed === 'number') {
      updateSpeed(result.speed);
      currentState.speed = result.speed;
    }
    if (typeof result.provider === 'string') {
      updateProvider(result.provider);
      currentState.provider = result.provider;
    }
  } catch (error) {
    console.error('[Popup] Failed to fetch settings:', error);
  }
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle play/pause button click
 * Supports both web page and PDF playback (T033: PDF reading support)
 */
async function handlePlayPause(): Promise<void> {
  console.log('[Popup] handlePlayPause called, state:', {
    status: currentState.status,
    isPDFPage,
    currentPDFUrl,
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
      trackClick('playback.play_clicked', { isPDF: isPDFPage });
      // T033: Check if we're on a PDF page and use PDF-specific playback
      if (isPDFPage && currentPDFUrl) {
        console.log('[Popup] Starting PDF playback for:', currentPDFUrl);
        updateStatus('loading');
        const response = await sendMessage<{ success: boolean; error?: string }>(
          'startPDFPlayback',
          {
            url: currentPDFUrl,
          },
        );
        console.log('[Popup] PDF playback response:', response);
        if (!response?.success) {
          console.error('[Popup] PDF playback failed:', response?.error);
          updateStatus('stopped');
        }
      } else {
        // Standard web page playback
        console.log('[Popup] Starting standard web page playback');
        await sendMessage('startPlayback');
        updateStatus('loading');
      }
    }
  } catch (error) {
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
  } catch (error) {
    console.error('[Popup] Provider change error:', error);
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
      provider: 'openai', // Default to OpenAI for now
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
// OCR Functions
// ============================================

/**
 * Show OCR result display
 */
function showOcrResult(text: string, confidence: number): void {
  currentOcrText = text;
  elements.ocrText.textContent = text;
  elements.ocrConfidence.textContent = `${Math.round(confidence)}% confidence`;
  elements.ocrBtn.hidden = true;
  elements.ocrResult.hidden = false;
}

/**
 * Hide OCR result display
 */
function hideOcrResult(): void {
  elements.ocrBtn.hidden = false;
  elements.ocrResult.hidden = true;
  elements.ocrBtnText.textContent = 'Read Image';
  elements.ocrBtn.disabled = false;
  elements.ocrBtn.classList.remove('voxpage-popup__ocr-btn--loading');
  currentOcrText = '';
}

/**
 * Handle OCR button click - capture screenshot and extract text
 */
async function handleOcrClick(): Promise<void> {
  try {
    elements.ocrBtn.disabled = true;
    elements.ocrBtn.classList.add('voxpage-popup__ocr-btn--loading');
    elements.ocrBtnText.textContent = 'Capturing...';

    // Request screenshot capture and OCR from background
    const response = await sendMessage<{
      success: boolean;
      text: string;
      confidence: number;
      error?: string;
    }>('ocr.captureAndRead', {
      languages: ['eng'],
    });

    if (!response.success) {
      throw new Error(response.error || 'OCR failed');
    }

    if (!response.text || response.text.trim().length === 0) {
      throw new Error('No text found in image');
    }

    showOcrResult(response.text, response.confidence);
  } catch (error) {
    console.error('[Popup] OCR error:', error);
    elements.ocrBtnText.textContent = error instanceof Error ? error.message : 'OCR failed';
    elements.ocrBtn.classList.remove('voxpage-popup__ocr-btn--loading');
    setTimeout(() => {
      elements.ocrBtnText.textContent = 'Read Image';
      elements.ocrBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle read OCR text button click
 */
async function handleReadOcrClick(): Promise<void> {
  if (!currentOcrText) return;

  try {
    await sendMessage('ocr.readExtractedText', {
      text: currentOcrText,
      provider: currentState.provider,
      speed: currentState.speed,
    });
  } catch (error) {
    console.error('[Popup] Read OCR error:', error);
  }
}

/**
 * Handle close OCR result button click
 */
function handleCloseOcrClick(): void {
  hideOcrResult();
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
    console.error('[Popup] Failed to fetch cost estimate:', error);
    // On error, hide cost section silently
    hideCostDisplay();
  }
}

// ============================================
// PDF Detection (T033: PDF reading support)
// ============================================

/**
 * Detect if the current tab is viewing a PDF file.
 * Sets isPDFPage and currentPDFUrl state variables.
 * Updates status text to indicate PDF is ready.
 */
async function detectPDF(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      isPDFPage = false;
      currentPDFUrl = null;
      return;
    }

    const url = tab.url.toLowerCase();

    // Check if URL ends with .pdf or contains pdf viewer patterns
    const isPDF =
      url.endsWith('.pdf') ||
      url.includes('.pdf?') ||
      url.includes('.pdf#') ||
      // Firefox's built-in PDF viewer
      (url.includes('pdf') && url.includes('viewer')) ||
      // Chrome's PDF viewer (pdfjs)
      url.includes('pdfviewer') ||
      // Direct blob PDFs
      (url.startsWith('blob:') && tab.title?.toLowerCase().includes('.pdf'));

    if (isPDF) {
      isPDFPage = true;
      currentPDFUrl = tab.url; // Use original URL, not lowercased
      elements.statusText.textContent = 'PDF Ready';
      console.log('[Popup] PDF detected:', currentPDFUrl);
    } else {
      isPDFPage = false;
      currentPDFUrl = null;
    }
  } catch (error) {
    console.error('[Popup] PDF detection error:', error);
    isPDFPage = false;
    currentPDFUrl = null;
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

  // Progress seek
  elements.progressSeek.addEventListener('input', handleProgressSeek);

  // Footer actions
  elements.settingsBtn.addEventListener('click', handleSettingsClick);
  elements.helpLink.addEventListener('click', handleHelpClick);

  // Summarize controls
  elements.summarizeBtn.addEventListener('click', handleSummarizeClick);
  elements.readSummaryBtn.addEventListener('click', handleReadSummaryClick);
  elements.closeSummaryBtn.addEventListener('click', handleCloseSummaryClick);

  // OCR controls
  elements.ocrBtn.addEventListener('click', handleOcrClick);
  elements.readOcrBtn.addEventListener('click', handleReadOcrClick);
  elements.closeOcrBtn.addEventListener('click', handleCloseOcrClick);

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
    const gatewayUrl = stored.telemetryGatewayUrl as string | undefined;
    const gatewayToken = stored.telemetryGatewayToken as string | undefined;

    if (!gatewayUrl || !gatewayToken) {
      console.log('[Popup] Telemetry not configured');
      return;
    }

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

  // Update section visibility based on configured API keys
  await updateSectionVisibility();

  // T033: Detect if current tab is a PDF
  await detectPDF();

  // Fetch cost estimate (non-blocking)
  fetchCostEstimate().catch((err) => {
    console.error('[Popup] Cost estimate fetch failed:', err);
  });

  console.log('[Popup] Initialized');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
