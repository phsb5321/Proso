/**
 * VoxPage Popup Controller
 * Handles UI interactions and communicates with background service worker
 */

// State
let state = {
  isPlaying: false,
  currentProvider: 'openai',
  currentMode: 'full',
  speed: 1.0,
  currentVoice: null,
  progress: 0,
  duration: 0
};

// DOM Elements
const elements = {
  playBtn: null,
  playIcon: null,
  pauseIcon: null,
  prevBtn: null,
  nextBtn: null,
  stopBtn: null,
  progressFill: null,
  currentTime: null,
  totalTime: null,
  voiceSelect: null,
  providerTabs: null,
  speedSlider: null,
  speedValue: null,
  modeBtns: null,
  settingsBtn: null,
  statusBanner: null,
  statusText: null,
  dismissStatus: null
};

// Voice configurations for each provider
const voiceConfigs = {
  openai: [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and conversational' },
    { id: 'fable', name: 'Fable', description: 'British and expressive' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Friendly and upbeat' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft and gentle' }
  ],
  elevenlabs: [
    { id: 'rachel', name: 'Rachel', description: 'Calm and soothing' },
    { id: 'drew', name: 'Drew', description: 'Well-rounded and confident' },
    { id: 'clyde', name: 'Clyde', description: 'War veteran character voice' },
    { id: 'paul', name: 'Paul', description: 'Ground news reporter' },
    { id: 'domi', name: 'Domi', description: 'Strong and assertive' },
    { id: 'dave', name: 'Dave', description: 'Conversational British' },
    { id: 'fin', name: 'Fin', description: 'Sailor character voice' },
    { id: 'sarah', name: 'Sarah', description: 'Soft news presenter' },
    { id: 'antoni', name: 'Antoni', description: 'Crisp and natural' },
    { id: 'elli', name: 'Elli', description: 'Young female narrator' }
  ],
  browser: [] // Will be populated dynamically
};

/**
 * Initialize the popup
 */
async function init() {
  cacheElements();
  await loadSettings();
  await loadBrowserVoices();
  setupEventListeners();
  populateVoices();
  await syncWithBackground();
}

/**
 * Cache DOM elements
 */
function cacheElements() {
  elements.playBtn = document.getElementById('playBtn');
  elements.playIcon = document.getElementById('playIcon');
  elements.pauseIcon = document.getElementById('pauseIcon');
  elements.prevBtn = document.getElementById('prevBtn');
  elements.nextBtn = document.getElementById('nextBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.progressFill = document.getElementById('progressFill');
  elements.currentTime = document.getElementById('currentTime');
  elements.totalTime = document.getElementById('totalTime');
  elements.voiceSelect = document.getElementById('voiceSelect');
  elements.providerTabs = document.querySelectorAll('.provider-tab');
  elements.speedSlider = document.getElementById('speedSlider');
  elements.speedValue = document.getElementById('speedValue');
  elements.modeBtns = document.querySelectorAll('.mode-btn');
  elements.settingsBtn = document.getElementById('settingsBtn');
  elements.statusBanner = document.getElementById('statusBanner');
  elements.statusText = document.getElementById('statusText');
  elements.dismissStatus = document.getElementById('dismissStatus');
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const settings = await browser.storage.local.get([
      'provider',
      'voice',
      'speed',
      'mode'
    ]);

    if (settings.provider) {
      state.currentProvider = settings.provider;
    }
    if (settings.voice) {
      state.currentVoice = settings.voice;
    }
    if (settings.speed) {
      state.speed = settings.speed;
      elements.speedSlider.value = settings.speed;
      elements.speedValue.textContent = `${settings.speed}x`;
    }
    if (settings.mode) {
      state.currentMode = settings.mode;
    }

    // Update UI
    updateProviderUI();
    updateModeUI();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Load browser's built-in voices
 */
async function loadBrowserVoices() {
  return new Promise((resolve) => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      voiceConfigs.browser = voices.map(voice => ({
        id: voice.voiceURI,
        name: voice.name,
        description: voice.lang
      }));
      resolve();
    };

    if (speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      speechSynthesis.onvoiceschanged = loadVoices;
      // Fallback timeout
      setTimeout(resolve, 1000);
    }
  });
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
  elements.stopBtn.addEventListener('click', () => {
    sendMessage('stop');
    updatePlayState(false);
  });

  // Provider tabs
  elements.providerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const provider = tab.dataset.provider;
      setProvider(provider);
    });
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
    elements.speedValue.textContent = `${state.speed.toFixed(1)}x`;
  });

  elements.speedSlider.addEventListener('change', (e) => {
    state.speed = parseFloat(e.target.value);
    saveSettings();
    sendMessage('setSpeed', { speed: state.speed });
  });

  // Mode buttons
  elements.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setMode(mode);
    });
  });

  // Settings button
  elements.settingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // Status banner dismiss
  elements.dismissStatus.addEventListener('click', hideStatus);

  // Listen for messages from background
  browser.runtime.onMessage.addListener(handleBackgroundMessage);
}

/**
 * Toggle play/pause state
 */
async function togglePlayPause() {
  if (state.isPlaying) {
    sendMessage('pause');
    updatePlayState(false);
  } else {
    // Check if API key is configured
    const settings = await browser.storage.local.get(['openaiApiKey', 'elevenlabsApiKey']);

    if (state.currentProvider === 'openai' && !settings.openaiApiKey) {
      showStatus('Please configure your OpenAI API key in settings', 'error');
      return;
    }

    if (state.currentProvider === 'elevenlabs' && !settings.elevenlabsApiKey) {
      showStatus('Please configure your ElevenLabs API key in settings', 'error');
      return;
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
 * Update play button state
 */
function updatePlayState(isPlaying) {
  state.isPlaying = isPlaying;
  elements.playIcon.classList.toggle('hidden', isPlaying);
  elements.pauseIcon.classList.toggle('hidden', !isPlaying);
}

/**
 * Set the TTS provider
 */
function setProvider(provider) {
  state.currentProvider = provider;
  updateProviderUI();
  populateVoices();
  saveSettings();
  sendMessage('setProvider', { provider });
}

/**
 * Update provider tabs UI
 */
function updateProviderUI() {
  elements.providerTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.provider === state.currentProvider);
  });
}

/**
 * Set reading mode
 */
function setMode(mode) {
  state.currentMode = mode;
  updateModeUI();
  saveSettings();
}

/**
 * Update mode buttons UI
 */
function updateModeUI() {
  elements.modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.currentMode);
  });
}

/**
 * Populate voice dropdown based on current provider
 */
function populateVoices() {
  const voices = voiceConfigs[state.currentProvider];

  elements.voiceSelect.innerHTML = '<option value="" disabled>Select a voice...</option>';

  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = `${voice.name} - ${voice.description}`;
    if (state.currentVoice === voice.id) {
      option.selected = true;
    }
    elements.voiceSelect.appendChild(option);
  });

  // Select first voice if none selected
  if (!state.currentVoice && voices.length > 0) {
    state.currentVoice = voices[0].id;
    elements.voiceSelect.value = state.currentVoice;
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    await browser.storage.local.set({
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
 * Send message to background script
 */
async function sendMessage(action, data = {}) {
  try {
    await browser.runtime.sendMessage({ action, ...data });
  } catch (error) {
    console.error('Error sending message:', error);
    showStatus('Communication error. Please try again.', 'error');
  }
}

/**
 * Handle messages from background script
 */
function handleBackgroundMessage(message) {
  switch (message.type) {
    case 'playbackState':
      updatePlayState(message.isPlaying);
      break;
    case 'progress':
      updateProgress(message.current, message.total);
      break;
    case 'error':
      showStatus(message.error, 'error');
      updatePlayState(false);
      break;
    case 'status':
      showStatus(message.text, message.level || 'info');
      break;
  }
}

/**
 * Sync state with background service worker
 */
async function syncWithBackground() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getState' });
    if (response) {
      if (response.isPlaying !== undefined) {
        updatePlayState(response.isPlaying);
      }
      if (response.progress !== undefined) {
        updateProgress(response.progress.current, response.progress.total);
      }
    }
  } catch (error) {
    // Background might not be ready yet
    console.log('Background sync pending...');
  }
}

/**
 * Update progress bar and time displays
 */
function updateProgress(current, total) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  elements.progressFill.style.width = `${percent}%`;
  elements.currentTime.textContent = formatTime(current);
  elements.totalTime.textContent = formatTime(total);
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Show status banner
 */
function showStatus(text, level = 'info') {
  elements.statusBanner.classList.remove('hidden', 'error', 'success');
  elements.statusBanner.classList.add(level);
  elements.statusText.textContent = text;
}

/**
 * Hide status banner
 */
function hideStatus() {
  elements.statusBanner.classList.add('hidden');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
