/**
 * VoxPage Popup - Entry Point
 * Initializes all popup modules and sets up event listeners.
 *
 * @module popup/index
 */

import { initOnboarding } from './components/onboarding.js';
import {
  initAccessibility,
  setupRovingTabindex,
  setupSliderAccessibility
} from './components/accessibility.js';
import { initVisualizer, setState as setVisualizerState } from './components/visualizer.js';
import { elements, cacheElements, hideStatus, updateSpeedUI } from './popup-ui.js';
import {
  state,
  fetchProviderVoices,
  loadBrowserVoices,
  loadSettings,
  saveSettings,
  populateVoices,
  togglePlayPause,
  setProvider,
  setMode,
  handleStop,
  sendMessage,
  handleBackgroundMessage,
  syncWithBackground,
  showFooterPlayer
} from './popup-controller.js';

/**
 * Initialize the popup
 */
async function init() {
  cacheElements();
  initAccessibility();
  initVisualizerComponent();
  await loadSettings();
  await fetchProviderVoices();
  await loadBrowserVoices();
  setupEventListeners();
  setupAccessibilityFeatures();
  populateVoices();
  await syncWithBackground();
  await initOnboarding(elements.playBtn);
}

/**
 * Initialize the visualizer component
 */
function initVisualizerComponent() {
  if (elements.visualizerCanvas) {
    const success = initVisualizer(elements.visualizerCanvas);
    if (success) {
      setVisualizerState('idle');
    }
  }
}

/**
 * Setup accessibility features
 */
function setupAccessibilityFeatures() {
  const providerContainer = document.querySelector('.provider-section .voxpage-tabs');
  if (providerContainer) {
    setupRovingTabindex(providerContainer, '[data-provider]');
  }
  setupSliderAccessibility(elements.speedSlider, 'Playback speed');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Play/Pause button
  elements.playBtn.addEventListener('click', togglePlayPause);

  // Navigation buttons
  elements.prevBtn.addEventListener('click', () => sendMessage('prev'));
  elements.nextBtn.addEventListener('click', () => sendMessage('next'));
  elements.stopBtn.addEventListener('click', handleStop);

  // Provider tabs
  elements.providerTabs.forEach(tab => {
    tab.addEventListener('click', () => setProvider(tab.dataset.provider));
  });

  // Voice selection
  elements.voiceSelect.addEventListener('change', (e) => {
    state.currentVoice = e.target.value;
    saveSettings();
    sendMessage('setVoice', { voice: state.currentVoice });
  });

  // Speed slider
  elements.speedSlider.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    updateSpeedUI(state.speed);
  });

  elements.speedSlider.addEventListener('change', (e) => {
    state.speed = parseFloat(e.target.value);
    saveSettings();
    sendMessage('setSpeed', { speed: state.speed });
  });

  // Mode buttons
  elements.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Settings button
  elements.settingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // Status banner dismiss
  elements.dismissStatus.addEventListener('click', hideStatus);

  // Show Player button (018-ui-redesign T078)
  if (elements.showPlayerBtn) {
    elements.showPlayerBtn.addEventListener('click', showFooterPlayer);
  }

  // Listen for messages from background
  browser.runtime.onMessage.addListener(handleBackgroundMessage);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
