/**
 * Popup UI Manager
 * Handles DOM manipulation and UI updates for the popup.
 * Separates presentation logic from business logic.
 *
 * @module popup/popup-ui
 */

import {
  setState as setVisualizerState,
  stopAnimation as stopVisualizerAnimation
} from './components/visualizer.js';
import {
  updatePlayButtonState
} from './components/accessibility.js';
// T039: Import provider language support functions (019-multilingual-tts)
import { getProvidersForLanguage, getLanguageDisplayName } from '../background/language-mappings.js';

/**
 * Cached DOM element references
 * @type {Object}
 */
export const elements = {
  playBtn: null,
  playIcon: null,
  pauseIcon: null,
  prevBtn: null,
  nextBtn: null,
  stopBtn: null,
  progressFill: null,
  currentTime: null,
  totalTime: null,
  paragraphInfo: null,
  voiceSelect: null,
  providerTabs: null,
  speedSlider: null,
  speedValue: null,
  modeBtns: null,
  settingsBtn: null,
  statusBanner: null,
  statusText: null,
  dismissStatus: null,
  visualizerCanvas: null,
  visualizerSection: null,
  // 018-ui-redesign: Playback status and Show Player button
  playbackStatus: null,
  playbackStatusText: null,
  showPlayerBtn: null,
  // T032: Language override dropdown (019-multilingual-tts)
  languageSelect: null,
  languageIndicator: null,
  // T039: Provider switch modal (019-multilingual-tts)
  providerSwitchModal: null
};

/**
 * Cache all DOM elements for faster access
 */
export function cacheElements() {
  elements.playBtn = document.getElementById('playBtn');
  elements.playIcon = document.getElementById('playIcon');
  elements.pauseIcon = document.getElementById('pauseIcon');
  elements.prevBtn = document.getElementById('prevBtn');
  elements.nextBtn = document.getElementById('nextBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.progressFill = document.getElementById('progressFill');
  elements.currentTime = document.getElementById('currentTime');
  elements.totalTime = document.getElementById('totalTime');
  elements.paragraphInfo = document.getElementById('paragraphInfo');
  elements.voiceSelect = document.getElementById('voiceSelect');
  elements.providerTabs = document.querySelectorAll('[data-provider]');
  elements.speedSlider = document.getElementById('speedSlider');
  elements.speedValue = document.getElementById('speedValue');
  elements.modeBtns = document.querySelectorAll('.mode-btn');
  elements.settingsBtn = document.getElementById('settingsBtn');
  elements.statusBanner = document.getElementById('statusBanner');
  elements.statusText = document.getElementById('statusText');
  elements.dismissStatus = document.getElementById('dismissStatus');
  elements.visualizerCanvas = document.getElementById('visualizerCanvas');
  elements.visualizerSection = document.querySelector('.visualizer-section');
  // 018-ui-redesign: Playback status and Show Player button
  elements.playbackStatus = document.getElementById('playbackStatus');
  elements.playbackStatusText = document.getElementById('playbackStatusText');
  elements.showPlayerBtn = document.getElementById('showPlayerBtn');
  // T032: Language override dropdown (019-multilingual-tts)
  elements.languageSelect = document.getElementById('languageSelect');
  elements.languageIndicator = document.getElementById('languageIndicator');
}

/**
 * Update play button visual state
 * @param {boolean} isPlaying - Whether currently playing
 * @param {boolean} [isPaused=false] - Whether currently paused
 */
export function updatePlayButtonUI(isPlaying, isPaused = false) {
  elements.playIcon.classList.toggle('hidden', isPlaying);
  elements.pauseIcon.classList.toggle('hidden', !isPlaying);
  updatePlayButtonState(elements.playBtn, isPlaying);
  // Update playback status indicator (018-ui-redesign)
  updatePlaybackStatusUI(isPlaying, isPaused);
}

/**
 * Update playback status indicator (018-ui-redesign T077)
 * Shows status when playing/paused, hides when stopped
 * @param {boolean} isPlaying - Whether currently playing
 * @param {boolean} [isPaused=false] - Whether currently paused
 */
export function updatePlaybackStatusUI(isPlaying, isPaused = false) {
  if (!elements.playbackStatus) return;

  if (isPlaying || isPaused) {
    elements.playbackStatus.classList.remove('hidden');
    elements.playbackStatus.classList.toggle('paused', isPaused);
    elements.playbackStatusText.textContent = isPaused ? 'Paused' : 'Playing';
  } else {
    elements.playbackStatus.classList.add('hidden');
  }
}

/**
 * Update visualizer section state
 * @param {boolean} isPlaying - Whether currently playing
 * @param {boolean} isPaused - Whether currently paused
 */
export function updateVisualizerUI(isPlaying, isPaused) {
  if (elements.visualizerSection) {
    elements.visualizerSection.classList.remove('idle', 'playing', 'paused');
    if (isPlaying) {
      elements.visualizerSection.classList.add('playing');
      setVisualizerState('playing');
    } else if (isPaused) {
      elements.visualizerSection.classList.add('paused');
      setVisualizerState('paused');
    } else {
      elements.visualizerSection.classList.add('idle');
      setVisualizerState('idle');
    }
  }
}

/**
 * Update provider tabs active state
 * @param {string} currentProvider - Currently selected provider ID
 */
export function updateProviderUI(currentProvider) {
  elements.providerTabs.forEach(tab => {
    const isActive = tab.dataset.provider === currentProvider;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive.toString());
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

/**
 * Update mode buttons active state
 * @param {string} currentMode - Currently selected mode
 */
export function updateModeUI(currentMode) {
  elements.modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

/**
 * Populate voice dropdown with available voices
 * T038: Shows "No voices for [language]" when filter returns empty (019-multilingual-tts)
 * @param {Array} voices - Array of voice objects {id, name, description}
 * @param {string|null} currentVoice - Currently selected voice ID
 * @param {string|null} [languageCode] - Current language code for empty message
 * @returns {string|null} - Selected voice ID (first voice if none selected)
 */
export function populateVoiceDropdown(voices, currentVoice, languageCode = null) {
  // Clear existing options using safe DOM method
  while (elements.voiceSelect.firstChild) {
    elements.voiceSelect.removeChild(elements.voiceSelect.firstChild);
  }

  // Add placeholder
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.textContent = 'Select a voice...';
  elements.voiceSelect.appendChild(placeholder);

  if (!voices || voices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.disabled = true;
    // T038: Show language-specific message (019-multilingual-tts)
    option.textContent = languageCode
      ? `No voices for ${languageCode.toUpperCase()}`
      : 'No voices available';
    elements.voiceSelect.appendChild(option);
    return null;
  }

  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = voice.description
      ? `${voice.name} - ${voice.description}`
      : voice.name;
    if (currentVoice === voice.id) {
      option.selected = true;
    }
    elements.voiceSelect.appendChild(option);
  });

  // Return first voice if none selected or current not in list
  const voiceIds = voices.map(v => v.id);
  if (!currentVoice || !voiceIds.includes(currentVoice)) {
    elements.voiceSelect.value = voices[0].id;
    return voices[0].id;
  }
  return currentVoice;
}

/**
 * Update progress bar and time displays
 * @param {number} current - Current time in seconds
 * @param {number} total - Total time in seconds
 */
export function updateProgress(current, total) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  elements.progressFill.style.width = `${percent}%`;
  elements.currentTime.textContent = formatTime(current);
  elements.totalTime.textContent = formatTime(total);
}

/**
 * Update paragraph info display
 * @param {number} currentIndex - Current paragraph index (0-based)
 * @param {number} totalParagraphs - Total number of paragraphs
 */
export function updateParagraphInfo(currentIndex, totalParagraphs) {
  if (elements.paragraphInfo) {
    if (totalParagraphs > 0) {
      elements.paragraphInfo.textContent = `Paragraph ${currentIndex + 1} of ${totalParagraphs}`;
      elements.paragraphInfo.classList.remove('hidden');
    } else {
      elements.paragraphInfo.textContent = '';
      elements.paragraphInfo.classList.add('hidden');
    }
  }
}

/**
 * Update speed slider display
 * @param {number} speed - Speed value (0.5-2.0)
 */
export function updateSpeedUI(speed) {
  elements.speedSlider.value = speed;
  elements.speedValue.textContent = `${speed}x`;
  elements.speedSlider.setAttribute('aria-valuenow', speed);
  elements.speedSlider.setAttribute('aria-valuetext', `${speed.toFixed(1)}x speed`);
}

/**
 * Show status banner
 * @param {string} text - Status message
 * @param {string} [level='info'] - Status level: 'info', 'error', 'success', 'warning'
 */
export function showStatus(text, level = 'info') {
  elements.statusBanner.classList.remove('hidden', 'error', 'success', 'warning', 'info');
  elements.statusBanner.classList.add(level);
  elements.statusText.textContent = text;
}

/**
 * Hide status banner
 */
export function hideStatus() {
  elements.statusBanner.classList.add('hidden');
}

/**
 * Highlight settings button temporarily
 */
export function highlightSettingsButton() {
  elements.settingsBtn.classList.add('setting-saved');
  setTimeout(() => {
    elements.settingsBtn.classList.remove('setting-saved');
  }, 2000);
}

/**
 * Format seconds to MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * T032: Available languages for override dropdown (019-multilingual-tts)
 * Subset of most commonly used languages
 */
const AVAILABLE_LANGUAGES = [
  { code: null, name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'el', name: 'Greek' }
];

/**
 * T032: Populate language dropdown (019-multilingual-tts)
 * @param {string|null} currentOverride - Currently selected override (null = auto)
 * @param {string|null} detectedLanguage - Detected language code
 */
export function populateLanguageDropdown(currentOverride, detectedLanguage) {
  if (!elements.languageSelect) return;

  // Clear existing options using safe DOM method
  while (elements.languageSelect.firstChild) {
    elements.languageSelect.removeChild(elements.languageSelect.firstChild);
  }

  AVAILABLE_LANGUAGES.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code || '';

    if (lang.code === null) {
      // Auto-detect option shows detected language
      const detectedName = AVAILABLE_LANGUAGES.find(l => l.code === detectedLanguage)?.name;
      option.textContent = detectedName
        ? `Auto-detect (${detectedName})`
        : 'Auto-detect';
    } else {
      option.textContent = lang.name;
    }

    if (currentOverride === lang.code || (currentOverride === null && lang.code === null)) {
      option.selected = true;
    }

    elements.languageSelect.appendChild(option);
  });
}

/**
 * T044: Update language indicator (019-multilingual-tts)
 * Shows the current effective language code
 * @param {string} languageCode - 2-letter language code
 */
export function updateLanguageIndicator(languageCode) {
  if (!elements.languageIndicator) return;

  if (languageCode) {
    elements.languageIndicator.textContent = languageCode.toUpperCase();
    elements.languageIndicator.classList.remove('hidden');
  } else {
    elements.languageIndicator.classList.add('hidden');
  }
}

/**
 * T039: Provider display names for modal (019-multilingual-tts)
 */
const PROVIDER_DISPLAY_NAMES = {
  browser: 'Browser TTS',
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  groq: 'Groq',
  cartesia: 'Cartesia'
};

/**
 * T039: Create and show provider switch modal (019-multilingual-tts)
 * Shows when current provider doesn't support the detected language
 * @param {string} languageCode - Detected language code
 * @param {string} currentProvider - Current provider ID
 * @param {Function} onProviderSelect - Callback when user selects a provider
 */
export function showProviderSwitchModal(languageCode, currentProvider, onProviderSelect) {
  // Remove existing modal if any
  hideProviderSwitchModal();

  // Get compatible providers (excluding current)
  const compatibleProviders = getProvidersForLanguage(languageCode)
    .filter(p => p !== currentProvider);

  if (compatibleProviders.length === 0) {
    // No compatible providers available, don't show modal
    return;
  }

  const languageName = getLanguageDisplayName(languageCode);
  const currentProviderName = PROVIDER_DISPLAY_NAMES[currentProvider] || currentProvider;

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'provider-switch-overlay';
  overlay.id = 'providerSwitchModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'providerSwitchTitle');

  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'provider-switch-modal';

  // Title
  const title = document.createElement('h2');
  title.className = 'provider-switch-title';
  title.id = 'providerSwitchTitle';
  title.textContent = 'Language Not Supported';
  modal.appendChild(title);

  // Message
  const message = document.createElement('p');
  message.className = 'provider-switch-message';
  message.textContent = `${currentProviderName} doesn't support ${languageName}. Would you like to switch to a compatible provider?`;
  modal.appendChild(message);

  // Provider buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'provider-switch-options';

  compatibleProviders.forEach(providerId => {
    const btn = document.createElement('button');
    btn.className = 'voxpage-button voxpage-button--secondary provider-switch-option';
    btn.textContent = PROVIDER_DISPLAY_NAMES[providerId] || providerId;
    btn.addEventListener('click', () => {
      hideProviderSwitchModal();
      onProviderSelect(providerId);
    });
    buttonsContainer.appendChild(btn);
  });

  modal.appendChild(buttonsContainer);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'voxpage-button voxpage-button--ghost provider-switch-cancel';
  cancelBtn.textContent = 'Keep Current Provider';
  cancelBtn.addEventListener('click', hideProviderSwitchModal);
  modal.appendChild(cancelBtn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  elements.providerSwitchModal = overlay;

  // Focus the first provider button for accessibility
  const firstBtn = buttonsContainer.querySelector('button');
  if (firstBtn) {
    firstBtn.focus();
  }

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      hideProviderSwitchModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideProviderSwitchModal();
    }
  });
}

/**
 * T039: Hide provider switch modal (019-multilingual-tts)
 */
export function hideProviderSwitchModal() {
  if (elements.providerSwitchModal) {
    elements.providerSwitchModal.remove();
    elements.providerSwitchModal = null;
  }
}
