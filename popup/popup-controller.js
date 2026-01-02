/**
 * Popup Controller
 * Handles business logic, state management, and background communication.
 * Coordinates between UI and background service worker.
 *
 * @module popup/popup-controller
 */

import {
  elements,
  updatePlayButtonUI,
  updateVisualizerUI,
  updateProviderUI,
  updateModeUI,
  populateVoiceDropdown,
  updateProgress,
  updateParagraphInfo,
  updateSpeedUI,
  showStatus,
  hideStatus,
  highlightSettingsButton
} from './popup-ui.js';
import {
  announce,
  announceError,
  announceParagraph,
  announceStop
} from './components/accessibility.js';
import { updateData as updateVisualizerData } from './components/visualizer.js';
import { defaults } from '../shared/config/defaults.js';
import { settingsStore } from '../shared/config/store.js';

/**
 * Application state - uses SSOT defaults from shared/config
 */
export const state = {
  isPlaying: false,
  currentProvider: defaults.provider,
  currentMode: defaults.mode,  // From shared/config/defaults.js (SSOT)
  speed: defaults.speed,
  currentVoice: defaults.voice,
  progress: 0,
  duration: 0
};

// Voice configurations - fetched dynamically
let providerVoices = {};
let browserVoicesLoaded = false;
let visualizerAnimationId = null;

/**
 * Fetch voices from provider registry
 */
export async function fetchProviderVoices() {
  try {
    const providers = await browser.runtime.sendMessage({ action: 'getProviders' });
    if (providers && Array.isArray(providers)) {
      providers.forEach(provider => {
        if (provider.voices && Array.isArray(provider.voices)) {
          providerVoices[provider.id] = provider.voices.map(v => ({
            id: v.id,
            name: v.name,
            description: v.description || v.language || ''
          }));
        }
      });
    }
  } catch (error) {
    console.error('Error fetching provider voices:', error);
  }
}

/**
 * Load browser's built-in voices
 */
export async function loadBrowserVoices() {
  return new Promise((resolve) => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      providerVoices.browser = voices.map(voice => ({
        id: voice.voiceURI,
        name: voice.name,
        description: voice.lang
      }));
      browserVoicesLoaded = true;
      resolve();
    };

    if (speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(resolve, 1000);
    }
  });
}

/**
 * Load settings from storage using settingsStore (runs migrations)
 * Migration logic is handled by shared/config/migrations.js (SSOT)
 */
export async function loadSettings() {
  try {
    // Use settingsStore.load() which runs migrations and validates
    const settings = await settingsStore.load();

    // Apply settings from store (already validated and migrated)
    state.currentProvider = settings.provider;
    state.currentVoice = settings.voice;
    state.speed = settings.speed;
    state.currentMode = settings.mode;

    // Update UI
    updateSpeedUI(state.speed);
    updateProviderUI(state.currentProvider);
    updateModeUI(state.currentMode);

    console.log('VoxPage popup: Settings loaded, mode:', state.currentMode);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings to storage using settingsStore
 */
export async function saveSettings() {
  try {
    await settingsStore.save({
      provider: state.currentProvider,
      voice: state.currentVoice,
      speed: state.speed,
      mode: state.currentMode
    });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Populate voices for current provider
 */
export function populateVoices() {
  const voices = providerVoices[state.currentProvider] || [];
  const selectedVoice = populateVoiceDropdown(voices, state.currentVoice);

  if (selectedVoice && selectedVoice !== state.currentVoice) {
    state.currentVoice = selectedVoice;
    sendMessage('setVoice', { voice: state.currentVoice });
  }
}

/**
 * Update play state (both UI and internal state)
 * @param {boolean} isPlaying
 * @param {boolean} [isPaused=false]
 */
export function updatePlayState(isPlaying, isPaused = false) {
  state.isPlaying = isPlaying;
  updatePlayButtonUI(isPlaying, isPaused);
  updateVisualizerUI(isPlaying, isPaused);

  if (isPlaying) {
    startVisualizerPolling();
  } else {
    stopVisualizerPolling();
  }
}

/**
 * Toggle play/pause state
 */
export async function togglePlayPause() {
  if (state.isPlaying) {
    sendMessage('pause');
    updatePlayState(false);
  } else {
    // Check API key for premium providers
    const settings = await browser.storage.local.get([
      'openaiApiKey', 'elevenlabsApiKey', 'cartesiaApiKey', 'groqApiKey'
    ]);

    const providerKeyMap = {
      groq: { key: 'groqApiKey', name: 'Groq' },
      openai: { key: 'openaiApiKey', name: 'OpenAI' },
      elevenlabs: { key: 'elevenlabsApiKey', name: 'ElevenLabs' },
      cartesia: { key: 'cartesiaApiKey', name: 'Cartesia' }
    };

    const providerInfo = providerKeyMap[state.currentProvider];
    if (providerInfo && !settings[providerInfo.key]) {
      showApiKeyMissingMessage(providerInfo.name);
      return;
    }

    // Check selection mode without selected text
    if (state.currentMode === 'selection') {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        try {
          const [{ result: hasSelection }] = await browser.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => window.getSelection()?.toString()?.trim()?.length > 0
          });
          if (!hasSelection) {
            showStatus('Please select text on the page first, then click play.', 'warning');
            announceError('Selection mode requires selecting text on the page first');
            return;
          }
        } catch (e) {
          // Can't check selection, proceed anyway
        }
      }
    }

    sendMessage('play', {
      provider: state.currentProvider,
      voice: state.currentVoice,
      speed: state.speed,
      mode: state.currentMode
    });
    updatePlayState(true);
  }
}

/**
 * Set the TTS provider
 * @param {string} provider
 */
export function setProvider(provider) {
  state.currentProvider = provider;
  updateProviderUI(provider);
  populateVoices();
  saveSettings();
  sendMessage('setProvider', { provider });
}

/**
 * Set reading mode
 * @param {string} mode
 */
export function setMode(mode) {
  state.currentMode = mode;
  updateModeUI(mode);
  // Mark mode as explicitly changed by user (prevents future migrations from overriding)
  settingsStore.save({ mode: mode }, { explicit: true });
}

/**
 * Handle stop button
 */
export function handleStop() {
  sendMessage('stop');
  updatePlayState(false);
  announceStop();
}

/**
 * Show API key missing message
 * @param {string} providerName
 */
function showApiKeyMissingMessage(providerName) {
  const message = `${providerName} API key required. Click the settings icon to configure.`;
  showStatus(message, 'error');
  announceError(message);
  highlightSettingsButton();
}

/**
 * Send message to background script
 * @param {string} action
 * @param {Object} [data={}]
 */
export async function sendMessage(action, data = {}) {
  try {
    await browser.runtime.sendMessage({ action, ...data });
  } catch (error) {
    console.error('Error sending message:', error);
    showStatus('Communication error. Please try again.', 'error');
  }
}

/**
 * Handle messages from background script
 * @param {Object} message
 */
export function handleBackgroundMessage(message) {
  switch (message.type) {
    case 'playbackState':
      updatePlayState(message.isPlaying, message.isPaused);
      if (message.currentIndex !== undefined && message.totalParagraphs !== undefined) {
        updateParagraphInfo(message.currentIndex, message.totalParagraphs);
      }
      break;
    case 'progress':
      updateProgress(message.current, message.total);
      if (message.currentIndex !== undefined && message.totalParagraphs !== undefined) {
        updateParagraphInfo(message.currentIndex, message.totalParagraphs);
      }
      break;
    case 'paragraphChanged':
      updateParagraphInfo(message.currentIndex, message.totalParagraphs);
      announceParagraph(message.currentIndex + 1, message.totalParagraphs);
      break;
    case 'error':
      showStatus(message.error, 'error');
      updatePlayState(false);
      announceError(message.error);
      break;
    case 'status':
      showStatus(message.text, message.level || 'info');
      break;
  }
}

/**
 * Sync state with background service worker
 */
export async function syncWithBackground() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getState' });
    if (response) {
      if (response.isPlaying !== undefined) {
        updatePlayState(response.isPlaying);
      }
      if (response.progress !== undefined) {
        updateProgress(response.progress.current, response.progress.total);
      }
      if (response.currentIndex !== undefined && response.totalParagraphs !== undefined) {
        updateParagraphInfo(response.currentIndex, response.totalParagraphs);
      }
    }
  } catch (error) {
    console.log('Background sync pending...');
  }
}

/**
 * Start polling visualizer data from background
 */
function startVisualizerPolling() {
  if (visualizerAnimationId) return;

  async function pollVisualizerData() {
    if (!state.isPlaying) {
      stopVisualizerPolling();
      return;
    }

    try {
      const data = await browser.runtime.sendMessage({ action: 'getVisualizerData' });
      if (data && data.available) {
        updateVisualizerData(data);
      }
    } catch (e) {
      // Background might not be ready
    }

    visualizerAnimationId = requestAnimationFrame(pollVisualizerData);
  }

  pollVisualizerData();
}

/**
 * Stop polling visualizer data
 */
function stopVisualizerPolling() {
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }
}

/**
 * Show the sticky footer player on the active tab (018-ui-redesign T078)
 * Sends SHOW_FOOTER message to background, which injects and displays
 * the sticky footer on the current page
 */
export async function showFooterPlayer() {
  try {
    await browser.runtime.sendMessage({ action: 'SHOW_FOOTER' });
  } catch (error) {
    console.error('Error showing footer player:', error);
    showStatus('Could not show player on page', 'error');
  }
}
