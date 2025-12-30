/**
 * VoxPage Options Page Controller
 */

// DOM Elements
const elements = {
  openaiKey: document.getElementById('openaiKey'),
  elevenlabsKey: document.getElementById('elevenlabsKey'),
  defaultProvider: document.getElementById('defaultProvider'),
  defaultSpeed: document.getElementById('defaultSpeed'),
  speedValue: document.getElementById('speedValue'),
  defaultMode: document.getElementById('defaultMode'),
  highlightEnabled: document.getElementById('highlightEnabled'),
  autoScroll: document.getElementById('autoScroll'),
  saveBtn: document.getElementById('saveBtn'),
  saveStatus: document.getElementById('saveStatus')
};

/**
 * Initialize the options page
 */
async function init() {
  await loadSettings();
  setupEventListeners();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const settings = await browser.storage.local.get([
      'openaiApiKey',
      'elevenlabsApiKey',
      'provider',
      'speed',
      'mode',
      'highlightEnabled',
      'autoScroll'
    ]);

    if (settings.openaiApiKey) {
      elements.openaiKey.value = settings.openaiApiKey;
    }

    if (settings.elevenlabsApiKey) {
      elements.elevenlabsKey.value = settings.elevenlabsApiKey;
    }

    if (settings.provider) {
      elements.defaultProvider.value = settings.provider;
    }

    if (settings.speed) {
      elements.defaultSpeed.value = settings.speed;
      elements.speedValue.textContent = `${settings.speed}x`;
    }

    if (settings.mode) {
      elements.defaultMode.value = settings.mode;
    }

    if (settings.highlightEnabled !== undefined) {
      elements.highlightEnabled.checked = settings.highlightEnabled;
    }

    if (settings.autoScroll !== undefined) {
      elements.autoScroll.checked = settings.autoScroll;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Toggle password visibility
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Speed slider
  elements.defaultSpeed.addEventListener('input', (e) => {
    elements.speedValue.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
  });

  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);

  // Auto-save on input change (with debounce)
  let saveTimeout;
  const autoSaveInputs = [
    elements.openaiKey,
    elements.elevenlabsKey,
    elements.defaultProvider,
    elements.defaultSpeed,
    elements.defaultMode,
    elements.highlightEnabled,
    elements.autoScroll
  ];

  autoSaveInputs.forEach(input => {
    input.addEventListener('change', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveSettings, 500);
    });
  });
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    await browser.storage.local.set({
      openaiApiKey: elements.openaiKey.value.trim(),
      elevenlabsApiKey: elements.elevenlabsKey.value.trim(),
      provider: elements.defaultProvider.value,
      speed: parseFloat(elements.defaultSpeed.value),
      mode: elements.defaultMode.value,
      highlightEnabled: elements.highlightEnabled.checked,
      autoScroll: elements.autoScroll.checked
    });

    showSaveStatus('Settings saved!');
  } catch (error) {
    console.error('Error saving settings:', error);
    showSaveStatus('Error saving settings', true);
  }
}

/**
 * Show save status message
 */
function showSaveStatus(message, isError = false) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = isError ? '#ef4444' : '#10b981';
  elements.saveStatus.classList.add('show');

  setTimeout(() => {
    elements.saveStatus.classList.remove('show');
  }, 2000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
