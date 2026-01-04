/**
 * VoxPage Popup Main Entry Point
 *
 * Handles popup UI interactions and communicates with background script
 * for playback control.
 *
 * @see T132-T141 Phase 7 (US5) Popup UI Implementation
 */

import { browser } from 'wxt/browser';

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

  // Speed
  speedSlider: document.getElementById('speed-slider') as HTMLInputElement,
  speedValue: document.getElementById('speed-value') as HTMLSpanElement,

  // Provider
  providerSelect: document.getElementById('provider-select') as HTMLSelectElement,

  // Footer
  settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
  helpLink: document.getElementById('help-link') as HTMLAnchorElement,
  version: document.getElementById('version') as HTMLSpanElement,
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
 */
async function handlePlayPause(): Promise<void> {
  try {
    if (currentState.status === 'playing') {
      await sendMessage('pausePlayback');
      updateStatus('paused');
      updatePlayPauseButton(false);
    } else {
      await sendMessage('startPlayback');
      updateStatus('loading');
    }
  } catch (error) {
    console.error('[Popup] Play/pause error:', error);
  }
}

/**
 * Handle previous paragraph button click
 */
async function handlePrev(): Promise<void> {
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
  try {
    await sendMessage('nextParagraph');
  } catch (error) {
    console.error('[Popup] Next error:', error);
  }
}

/**
 * Handle speed slider change
 */
async function handleSpeedChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const speed = parseFloat(target.value);

  updateSpeed(speed);
  currentState.speed = speed;

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
  const progress = parseFloat(target.value);

  updateProgress(progress);

  try {
    await sendMessage('seekToPosition', { progress });
  } catch (error) {
    console.error('[Popup] Seek error:', error);
  }
}

/**
 * Handle settings button click - opens options page
 */
function handleSettingsClick(): void {
  browser.runtime.openOptionsPage();
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
// Message Listener (State Updates from Background)
// ============================================

function setupMessageListener(): void {
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'playbackStateUpdate' && message.state) {
      applyState(message.state as PlaybackState);
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

  // Speed control
  elements.speedSlider.addEventListener('input', handleSpeedChange);

  // Provider selection
  elements.providerSelect.addEventListener('change', handleProviderChange);

  // Progress seek
  elements.progressSeek.addEventListener('input', handleProgressSeek);

  // Footer actions
  elements.settingsBtn.addEventListener('click', handleSettingsClick);
  elements.helpLink.addEventListener('click', handleHelpClick);
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

/**
 * Main initialization
 */
async function init(): Promise<void> {
  console.log('[Popup] Initializing...');

  // Set up event listeners
  setupEventListeners();

  // Set up message listener for state updates
  setupMessageListener();

  // Display version
  await displayVersion();

  // Fetch initial state
  await fetchSettings();
  await fetchPlaybackState();

  console.log('[Popup] Initialized');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
