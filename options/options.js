/**
 * VoxPage Options Page Controller
 */

import { defaults } from '../shared/config/defaults.js';
import { settingsStore } from '../shared/config/store.js';
import { loggingDefaults } from '../shared/config/logging-defaults.js';

// DOM Elements
const elements = {
  openaiKey: document.getElementById('openaiKey'),
  elevenlabsKey: document.getElementById('elevenlabsKey'),
  cartesiaKey: document.getElementById('cartesiaKey'),
  groqKey: document.getElementById('groqKey'),
  defaultProvider: document.getElementById('defaultProvider'),
  defaultSpeed: document.getElementById('defaultSpeed'),
  speedValue: document.getElementById('speedValue'),
  defaultMode: document.getElementById('defaultMode'),
  highlightEnabled: document.getElementById('highlightEnabled'),
  autoScroll: document.getElementById('autoScroll'),
  saveBtn: document.getElementById('saveBtn'),
  saveStatus: document.getElementById('saveStatus'),
  // Logging elements (014-loki-remote-logging)
  loggingEnabled: document.getElementById('loggingEnabled'),
  loggingConfigSection: document.getElementById('loggingConfigSection'),
  loggingEndpoint: document.getElementById('loggingEndpoint'),
  loggingAuthType: document.getElementById('loggingAuthType'),
  loggingUsername: document.getElementById('loggingUsername'),
  loggingPassword: document.getElementById('loggingPassword'),
  loggingBearerToken: document.getElementById('loggingBearerToken'),
  loggingCfClientId: document.getElementById('loggingCfClientId'),
  loggingCfClientSecret: document.getElementById('loggingCfClientSecret'),
  loggingLogLevel: document.getElementById('loggingLogLevel'),
  basicAuthFields: document.getElementById('basicAuthFields'),
  bearerAuthFields: document.getElementById('bearerAuthFields'),
  cloudflareAuthFields: document.getElementById('cloudflareAuthFields'),
  testLoggingConnection: document.getElementById('testLoggingConnection'),
  loggingTestStatus: document.getElementById('loggingTestStatus'),
  // Log viewer elements
  viewLogsBtn: document.getElementById('viewLogsBtn'),
  flushLogsBtn: document.getElementById('flushLogsBtn'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  exportLogsBtn: document.getElementById('exportLogsBtn'),
  logViewerStatus: document.getElementById('logViewerStatus'),
  logViewerContainer: document.getElementById('logViewerContainer'),
  logViewerContent: document.getElementById('logViewerContent'),
};

/**
 * Initialize the options page
 */
async function init() {
  await loadSettings();
  await loadLoggingConfig();
  setupEventListeners();
  setupLoggingEventListeners();
  setupAccordions();
}

/**
 * Setup collapsible accordion sections (018-ui-redesign T084)
 */
function setupAccordions() {
  const accordionHeaders = document.querySelectorAll('.voxpage-accordion__header');

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      const contentId = header.getAttribute('aria-controls');
      const content = document.getElementById(contentId);

      if (content) {
        // Toggle expanded state
        header.setAttribute('aria-expanded', String(!expanded));

        if (expanded) {
          // Collapse
          content.setAttribute('hidden', '');
        } else {
          // Expand
          content.removeAttribute('hidden');
        }
      }
    });

    // Add keyboard support
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  });
}

/**
 * Load settings from storage using settingsStore (runs migrations)
 * Uses SSOT defaults from shared/config/defaults.js
 */
async function loadSettings() {
  try {
    // Load config settings via settingsStore (runs migrations)
    const configSettings = await settingsStore.load();

    // Load API keys separately (not part of config schema)
    const apiKeys = await browser.storage.local.get([
      'openaiApiKey',
      'elevenlabsApiKey',
      'cartesiaApiKey',
      'groqApiKey',
      'highlightEnabled',
      'autoScroll'
    ]);

    // API keys (no defaults, empty if not set)
    if (apiKeys.openaiApiKey) {
      elements.openaiKey.value = apiKeys.openaiApiKey;
    }

    if (apiKeys.elevenlabsApiKey) {
      elements.elevenlabsKey.value = apiKeys.elevenlabsApiKey;
    }

    if (apiKeys.cartesiaApiKey) {
      elements.cartesiaKey.value = apiKeys.cartesiaApiKey;
    }

    if (apiKeys.groqApiKey) {
      elements.groqKey.value = apiKeys.groqApiKey;
    }

    // Use validated settings from settingsStore
    elements.defaultProvider.value = configSettings.provider;
    elements.defaultSpeed.value = configSettings.speed;
    elements.speedValue.textContent = `${configSettings.speed}x`;
    elements.defaultMode.value = configSettings.mode;

    console.log('VoxPage options: Settings loaded, mode:', configSettings.mode);

    // Boolean settings with explicit checks
    elements.highlightEnabled.checked = apiKeys.highlightEnabled !== undefined
      ? apiKeys.highlightEnabled
      : true;

    elements.autoScroll.checked = apiKeys.autoScroll !== undefined
      ? apiKeys.autoScroll
      : true;
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
    elements.cartesiaKey,
    elements.groqKey,
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
      cartesiaApiKey: elements.cartesiaKey.value.trim(),
      groqApiKey: elements.groqKey.value.trim(),
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
 * Show save status message (018-ui-redesign T087-T088)
 */
function showSaveStatus(message, isError = false) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = isError ? '#ef4444' : '#10b981';
  elements.saveStatus.classList.add('show');

  // Add success pulse animation to save button
  if (!isError && elements.saveBtn) {
    elements.saveBtn.classList.add('save-success');
    setTimeout(() => {
      elements.saveBtn.classList.remove('save-success');
    }, 500);
  }

  setTimeout(() => {
    elements.saveStatus.classList.remove('show');
  }, 2000);
}

// ========================================
// LOGGING CONFIGURATION (014-loki-remote-logging)
// ========================================

/**
 * Load logging configuration from storage
 */
async function loadLoggingConfig() {
  try {
    const result = await browser.storage.local.get('loggingConfig');
    const config = { ...loggingDefaults, ...result.loggingConfig };

    elements.loggingEnabled.checked = config.enabled;
    elements.loggingEndpoint.value = config.endpoint || '';
    elements.loggingAuthType.value = config.authType || 'none';
    elements.loggingUsername.value = config.username || '';
    elements.loggingPassword.value = config.password || '';
    elements.loggingBearerToken.value = config.bearerToken || '';
    elements.loggingCfClientId.value = config.cfAccessClientId || '';
    elements.loggingCfClientSecret.value = config.cfAccessClientSecret || '';
    elements.loggingLogLevel.value = config.logLevel || 'warn';

    // Show/hide config section based on enabled state
    updateLoggingConfigVisibility();
    updateAuthFieldsVisibility();
  } catch (error) {
    console.error('Error loading logging config:', error);
  }
}

/**
 * Setup logging-specific event listeners
 */
function setupLoggingEventListeners() {
  // Toggle logging config section visibility
  elements.loggingEnabled.addEventListener('change', () => {
    updateLoggingConfigVisibility();
  });

  // Toggle auth fields visibility based on auth type
  elements.loggingAuthType.addEventListener('change', () => {
    updateAuthFieldsVisibility();
  });

  // Test connection button
  elements.testLoggingConnection.addEventListener('click', testLoggingConnection);

  // Log viewer buttons
  if (elements.viewLogsBtn) {
    elements.viewLogsBtn.addEventListener('click', viewLogs);
  }
  if (elements.flushLogsBtn) {
    elements.flushLogsBtn.addEventListener('click', flushLogs);
  }
  if (elements.clearLogsBtn) {
    elements.clearLogsBtn.addEventListener('click', clearLogs);
  }
  if (elements.exportLogsBtn) {
    elements.exportLogsBtn.addEventListener('click', exportLogs);
  }

  // Auto-save logging config on change
  const loggingInputs = [
    elements.loggingEnabled,
    elements.loggingEndpoint,
    elements.loggingAuthType,
    elements.loggingUsername,
    elements.loggingPassword,
    elements.loggingBearerToken,
    elements.loggingCfClientId,
    elements.loggingCfClientSecret,
    elements.loggingLogLevel,
  ];

  let loggingSaveTimeout;
  loggingInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', () => {
        clearTimeout(loggingSaveTimeout);
        loggingSaveTimeout = setTimeout(saveLoggingConfig, 500);
      });
    }
  });
}

/**
 * Update visibility of logging config section
 */
function updateLoggingConfigVisibility() {
  if (elements.loggingConfigSection) {
    elements.loggingConfigSection.style.display =
      elements.loggingEnabled.checked ? 'block' : 'none';
  }
}

/**
 * Update visibility of auth fields based on selected auth type
 */
function updateAuthFieldsVisibility() {
  const authType = elements.loggingAuthType.value;

  // Hide all auth fields first
  if (elements.basicAuthFields) elements.basicAuthFields.style.display = 'none';
  if (elements.bearerAuthFields) elements.bearerAuthFields.style.display = 'none';
  if (elements.cloudflareAuthFields) elements.cloudflareAuthFields.style.display = 'none';

  // Show relevant auth fields
  switch (authType) {
    case 'basic':
      if (elements.basicAuthFields) elements.basicAuthFields.style.display = 'block';
      break;
    case 'bearer':
      if (elements.bearerAuthFields) elements.bearerAuthFields.style.display = 'block';
      break;
    case 'cloudflare':
      if (elements.cloudflareAuthFields) elements.cloudflareAuthFields.style.display = 'block';
      break;
  }
}

/**
 * Save logging configuration to storage
 */
async function saveLoggingConfig() {
  try {
    const config = {
      enabled: elements.loggingEnabled.checked,
      endpoint: elements.loggingEndpoint.value.trim() || null,
      authType: elements.loggingAuthType.value,
      username: elements.loggingUsername.value.trim() || null,
      password: elements.loggingPassword.value || null,
      bearerToken: elements.loggingBearerToken.value || null,
      cfAccessClientId: elements.loggingCfClientId.value.trim() || null,
      cfAccessClientSecret: elements.loggingCfClientSecret.value || null,
      logLevel: elements.loggingLogLevel.value,
      batchIntervalMs: loggingDefaults.batchIntervalMs,
      maxBatchSize: loggingDefaults.maxBatchSize,
      maxBufferBytes: loggingDefaults.maxBufferBytes,
    };

    // Validate endpoint URL if enabled
    if (config.enabled && config.endpoint) {
      const validation = validateLoggingEndpoint(config.endpoint);
      if (!validation.valid) {
        showLoggingStatus(validation.error, 'error');
        return;
      }
    }

    await browser.storage.local.set({ loggingConfig: config });
    showSaveStatus('Settings saved!');
  } catch (error) {
    console.error('Error saving logging config:', error);
    showSaveStatus('Error saving settings', true);
  }
}

/**
 * Validate Loki endpoint URL
 * @param {string} url - Endpoint URL to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateLoggingEndpoint(url) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Endpoint must use HTTPS' };
    }

    if (!parsed.pathname.endsWith('/loki/api/v1/push')) {
      return { valid: false, error: 'Endpoint must end with /loki/api/v1/push' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Test connection to Loki endpoint
 */
async function testLoggingConnection() {
  showLoggingStatus('Testing connection...', 'loading');

  const config = {
    endpoint: elements.loggingEndpoint.value.trim(),
    authType: elements.loggingAuthType.value,
    username: elements.loggingUsername.value.trim(),
    password: elements.loggingPassword.value,
    bearerToken: elements.loggingBearerToken.value,
    cfAccessClientId: elements.loggingCfClientId.value.trim(),
    cfAccessClientSecret: elements.loggingCfClientSecret.value,
  };

  // Validate endpoint
  if (!config.endpoint) {
    showLoggingStatus('Please enter an endpoint URL', 'error');
    return;
  }

  const validation = validateLoggingEndpoint(config.endpoint);
  if (!validation.valid) {
    showLoggingStatus(validation.error, 'error');
    return;
  }

  try {
    // Send test request to background script
    const response = await browser.runtime.sendMessage({
      action: 'testLoggingConnection',
      config: config,
    });

    if (response && response.success) {
      showLoggingStatus('Connection successful!', 'success');
    } else {
      showLoggingStatus(`Connection failed: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    showLoggingStatus(`Connection failed: ${error.message}`, 'error');
  }
}

/**
 * Show logging test status message
 * @param {string} message - Status message
 * @param {string} type - Status type: 'success', 'error', 'loading'
 */
function showLoggingStatus(message, type) {
  if (!elements.loggingTestStatus) return;

  elements.loggingTestStatus.textContent = message;
  elements.loggingTestStatus.className = `logging-test-status show ${type}`;

  // Auto-hide success/error messages
  if (type !== 'loading') {
    setTimeout(() => {
      elements.loggingTestStatus.classList.remove('show');
    }, 5000);
  }
}

// ========================================
// LOG VIEWER FUNCTIONS
// ========================================

/**
 * View buffered logs
 */
async function viewLogs() {
  updateLogViewerStatus('Loading logs...');

  try {
    const response = await browser.runtime.sendMessage({ action: 'getLogs' });

    if (response && response.logs) {
      const { logs, status } = response;

      if (logs.length === 0) {
        updateLogViewerStatus('No logs in buffer');
        elements.logViewerContainer.style.display = 'none';
        return;
      }

      // Clear existing content
      elements.logViewerContent.textContent = '';

      // Create log entries using safe DOM methods
      logs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = `log-entry log-entry--${log.level}`;

        const meta = log.metadata ? ` ${JSON.stringify(log.metadata)}` : '';
        entry.textContent = `[${log.date}] [${log.level.toUpperCase()}] [${log.component}] ${log.message}${meta}`;

        elements.logViewerContent.appendChild(entry);
      });

      elements.logViewerContainer.style.display = 'block';
      updateLogViewerStatus(`${logs.length} logs in buffer (${status.bufferBytes} bytes)`);
    } else {
      updateLogViewerStatus('Failed to load logs');
    }
  } catch (error) {
    updateLogViewerStatus(`Error: ${error.message}`);
  }
}

/**
 * Flush logs to Loki now
 */
async function flushLogs() {
  updateLogViewerStatus('Flushing logs...');

  try {
    const response = await browser.runtime.sendMessage({ action: 'flushLogs' });

    if (response && response.success) {
      updateLogViewerStatus('Logs flushed successfully');
      // Refresh the view
      await viewLogs();
    } else {
      updateLogViewerStatus(`Flush failed: ${response?.error || 'Unknown error'}`);
    }
  } catch (error) {
    updateLogViewerStatus(`Error: ${error.message}`);
  }
}

/**
 * Clear all buffered logs
 */
async function clearLogs() {
  if (!confirm('Are you sure you want to clear all buffered logs? This cannot be undone.')) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({ action: 'clearLogs' });

    if (response && response.success) {
      updateLogViewerStatus('Logs cleared');
      elements.logViewerContent.textContent = '';
      elements.logViewerContainer.style.display = 'none';
    } else {
      updateLogViewerStatus(`Clear failed: ${response?.error || 'Unknown error'}`);
    }
  } catch (error) {
    updateLogViewerStatus(`Error: ${error.message}`);
  }
}

/**
 * Export logs as JSON file
 */
async function exportLogs() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getLogs' });

    if (response && response.logs) {
      const { logs, status } = response;

      const exportData = {
        exportedAt: new Date().toISOString(),
        status: status,
        logs: logs,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `voxpage-logs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      updateLogViewerStatus(`Exported ${logs.length} logs`);
    } else {
      updateLogViewerStatus('No logs to export');
    }
  } catch (error) {
    updateLogViewerStatus(`Error: ${error.message}`);
  }
}

/**
 * Update log viewer status message
 * @param {string} message - Status message
 */
function updateLogViewerStatus(message) {
  if (elements.logViewerStatus) {
    elements.logViewerStatus.textContent = message;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
