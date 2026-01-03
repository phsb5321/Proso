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
  highlightSettingsButton,
  // T032: Language UI imports (019-multilingual-tts)
  populateLanguageDropdown,
  updateLanguageIndicator,
  // T039: Provider switch modal (019-multilingual-tts)
  showProviderSwitchModal
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
// T037: Import voice filtering (019-multilingual-tts)
// T039: Also import providerSupportsLanguage for modal check
import { getVoicesForLanguage, providerSupportsLanguage } from '../background/language-mappings.js';
// Import language message types for consistency
import { LanguageMessageTypes } from '../background/constants.js';

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
  duration: 0,
  // T031: Language state for multilingual TTS (019-multilingual-tts)
  detectedLanguage: null,    // Detected language code
  languageOverride: null,    // User override (null = auto-detect)
  effectiveLanguage: 'en'    // Actual language used for TTS
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

    // T031: Fetch language state when popup opens (019-multilingual-tts)
    await fetchLanguageState();

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
 * T037: Filters voices by detected language (019-multilingual-tts)
 * T039: Shows provider switch modal when language unsupported
 */
export function populateVoices() {
  let voices = providerVoices[state.currentProvider] || [];

  // T037: Filter voices by effective language (019-multilingual-tts)
  if (state.effectiveLanguage) {
    voices = getVoicesForLanguage(voices, state.effectiveLanguage, state.currentProvider);
  }

  // T039: Check if provider doesn't support language, show modal (019-multilingual-tts)
  if (state.effectiveLanguage &&
      state.effectiveLanguage !== 'en' &&
      !providerSupportsLanguage(state.currentProvider, state.effectiveLanguage)) {
    showProviderSwitchModal(
      state.effectiveLanguage,
      state.currentProvider,
      (newProvider) => {
        setProvider(newProvider);
      }
    );
  }

  const selectedVoice = populateVoiceDropdown(voices, state.currentVoice, state.effectiveLanguage);

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
    // T033: Handle language state updates (019-multilingual-tts)
    // T040: Re-filter voices when language changes
    case LanguageMessageTypes.LANGUAGE_STATE_UPDATE:
      state.detectedLanguage = message.detected?.primaryCode || null;
      state.languageOverride = message.override || null;
      state.effectiveLanguage = message.effective || 'en';
      // Update UI
      populateLanguageDropdown(state.languageOverride, state.detectedLanguage);
      updateLanguageIndicator(state.effectiveLanguage);
      // T040: Re-filter voices for new language (019-multilingual-tts)
      populateVoices();
      console.log('VoxPage popup: Language state updated:', state.effectiveLanguage);
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

/**
 * T031: Fetch language state from background (019-multilingual-tts)
 * Gets detected language, override, and effective language
 */
export async function fetchLanguageState() {
  try {
    const response = await browser.runtime.sendMessage({ action: LanguageMessageTypes.GET_LANGUAGE_STATE });
    if (response) {
      state.detectedLanguage = response.detected?.primaryCode || null;
      state.languageOverride = response.override || null;
      state.effectiveLanguage = response.effective || 'en';

      // T032: Update language UI
      populateLanguageDropdown(state.languageOverride, state.detectedLanguage);
      updateLanguageIndicator(state.effectiveLanguage);

      console.log('VoxPage popup: Language state loaded:', {
        detected: state.detectedLanguage,
        override: state.languageOverride,
        effective: state.effectiveLanguage
      });
    }
  } catch (error) {
    console.error('Error fetching language state:', error);
  }
}

/**
 * T033: Set language override (019-multilingual-tts)
 * T040: Re-filter voices when override changes
 * @param {string|null} languageCode - ISO 639-1 code or null to clear
 */
export async function setLanguageOverride(languageCode) {
  try {
    if (languageCode) {
      await browser.runtime.sendMessage({
        action: LanguageMessageTypes.SET_LANGUAGE_OVERRIDE,
        languageCode
      });
      state.languageOverride = languageCode;
      state.effectiveLanguage = languageCode;
    } else {
      await browser.runtime.sendMessage({ action: LanguageMessageTypes.CLEAR_LANGUAGE_OVERRIDE });
      state.languageOverride = null;
      state.effectiveLanguage = state.detectedLanguage || 'en';
    }

    // T040: Update UI and re-filter voices (019-multilingual-tts)
    updateLanguageIndicator(state.effectiveLanguage);
    populateVoices();

    console.log('VoxPage popup: Language override changed to:', languageCode);
  } catch (error) {
    console.error('Error setting language override:', error);
    showStatus('Failed to change language', 'error');
  }
}
