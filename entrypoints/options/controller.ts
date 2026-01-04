/**
 * VoxPage Options Page Controller
 * TypeScript conversion from options/options.js
 */

import {
  settingsDefaults,
  loggingDefaults,
  uiDefaults,
  type VoxPageSettings,
  type ApiKeys,
  type UISettings,
  type LoggingConfig,
  type LogEntry,
  type LogViewerResponse,
  type EndpointValidation
} from '../utils/config';

/**
 * DOM element references
 */
interface OptionsElements {
  // API Key inputs
  openaiKey: HTMLInputElement;
  elevenlabsKey: HTMLInputElement;
  testElevenlabsKey: HTMLButtonElement;
  elevenlabsKeyStatus: HTMLElement;
  cartesiaKey: HTMLInputElement;
  groqKey: HTMLInputElement;

  // Settings inputs
  defaultProvider: HTMLSelectElement;
  defaultSpeed: HTMLInputElement;
  speedValue: HTMLElement;
  defaultMode: HTMLSelectElement;
  highlightEnabled: HTMLInputElement;
  autoScroll: HTMLInputElement;

  // UI elements
  saveBtn: HTMLButtonElement;
  saveStatus: HTMLElement;

  // Logging elements
  loggingEnabled: HTMLInputElement;
  loggingConfigSection: HTMLElement;
  loggingEndpoint: HTMLInputElement;
  loggingAuthType: HTMLSelectElement;
  loggingUsername: HTMLInputElement;
  loggingPassword: HTMLInputElement;
  loggingBearerToken: HTMLInputElement;
  loggingCfClientId: HTMLInputElement;
  loggingCfClientSecret: HTMLInputElement;
  loggingLogLevel: HTMLSelectElement;
  basicAuthFields: HTMLElement;
  bearerAuthFields: HTMLElement;
  cloudflareAuthFields: HTMLElement;
  testLoggingConnection: HTMLButtonElement;
  loggingTestStatus: HTMLElement;

  // Log viewer elements
  viewLogsBtn: HTMLButtonElement;
  flushLogsBtn: HTMLButtonElement;
  clearLogsBtn: HTMLButtonElement;
  exportLogsBtn: HTMLButtonElement;
  logViewerStatus: HTMLElement;
  logViewerContainer: HTMLElement;
  logViewerContent: HTMLElement;
}

let elements: OptionsElements | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loggingSaveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Get DOM elements with type safety
 */
function getElements(): OptionsElements {
  const getElement = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id) as T | null;
    if (!el) {
      throw new Error(`Required element not found: ${id}`);
    }
    return el;
  };

  return {
    openaiKey: getElement<HTMLInputElement>('openaiKey'),
    elevenlabsKey: getElement<HTMLInputElement>('elevenlabsKey'),
    testElevenlabsKey: getElement<HTMLButtonElement>('testElevenlabsKey'),
    elevenlabsKeyStatus: getElement<HTMLElement>('elevenlabsKeyStatus'),
    cartesiaKey: getElement<HTMLInputElement>('cartesiaKey'),
    groqKey: getElement<HTMLInputElement>('groqKey'),
    defaultProvider: getElement<HTMLSelectElement>('defaultProvider'),
    defaultSpeed: getElement<HTMLInputElement>('defaultSpeed'),
    speedValue: getElement<HTMLElement>('speedValue'),
    defaultMode: getElement<HTMLSelectElement>('defaultMode'),
    highlightEnabled: getElement<HTMLInputElement>('highlightEnabled'),
    autoScroll: getElement<HTMLInputElement>('autoScroll'),
    saveBtn: getElement<HTMLButtonElement>('saveBtn'),
    saveStatus: getElement<HTMLElement>('saveStatus'),
    loggingEnabled: getElement<HTMLInputElement>('loggingEnabled'),
    loggingConfigSection: getElement<HTMLElement>('loggingConfigSection'),
    loggingEndpoint: getElement<HTMLInputElement>('loggingEndpoint'),
    loggingAuthType: getElement<HTMLSelectElement>('loggingAuthType'),
    loggingUsername: getElement<HTMLInputElement>('loggingUsername'),
    loggingPassword: getElement<HTMLInputElement>('loggingPassword'),
    loggingBearerToken: getElement<HTMLInputElement>('loggingBearerToken'),
    loggingCfClientId: getElement<HTMLInputElement>('loggingCfClientId'),
    loggingCfClientSecret: getElement<HTMLInputElement>('loggingCfClientSecret'),
    loggingLogLevel: getElement<HTMLSelectElement>('loggingLogLevel'),
    basicAuthFields: getElement<HTMLElement>('basicAuthFields'),
    bearerAuthFields: getElement<HTMLElement>('bearerAuthFields'),
    cloudflareAuthFields: getElement<HTMLElement>('cloudflareAuthFields'),
    testLoggingConnection: getElement<HTMLButtonElement>('testLoggingConnection'),
    loggingTestStatus: getElement<HTMLElement>('loggingTestStatus'),
    viewLogsBtn: getElement<HTMLButtonElement>('viewLogsBtn'),
    flushLogsBtn: getElement<HTMLButtonElement>('flushLogsBtn'),
    clearLogsBtn: getElement<HTMLButtonElement>('clearLogsBtn'),
    exportLogsBtn: getElement<HTMLButtonElement>('exportLogsBtn'),
    logViewerStatus: getElement<HTMLElement>('logViewerStatus'),
    logViewerContainer: getElement<HTMLElement>('logViewerContainer'),
    logViewerContent: getElement<HTMLElement>('logViewerContent'),
  };
}

/**
 * Initialize the options page
 */
export async function initOptionsPage(): Promise<void> {
  elements = getElements();

  await loadSettings();
  await loadLoggingConfig();

  setupEventListeners();
  setupLoggingEventListeners();
  setupAccordions();
}

/**
 * Setup collapsible accordion sections (018-ui-redesign T084)
 */
function setupAccordions(): void {
  const accordionHeaders = document.querySelectorAll('.voxpage-accordion__header');

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      const contentId = header.getAttribute('aria-controls');

      if (!contentId) return;

      const content = document.getElementById(contentId);
      if (!content) return;

      // Toggle expanded state
      header.setAttribute('aria-expanded', String(!expanded));

      if (expanded) {
        // Collapse
        content.setAttribute('hidden', '');
      } else {
        // Expand
        content.removeAttribute('hidden');
      }
    });

    // Add keyboard support
    header.addEventListener('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        (header as HTMLElement).click();
      }
    }) as EventListener);
  });
}

/**
 * Load settings from storage using browser.storage.local directly
 */
async function loadSettings(): Promise<void> {
  if (!elements) return;

  try {
    // Load all settings from storage
    const result = await browser.storage.local.get([
      'openaiApiKey',
      'elevenlabsApiKey',
      'cartesiaApiKey',
      'groqApiKey',
      'provider',
      'speed',
      'mode',
      'highlightEnabled',
      'autoScroll'
    ]);

    // API keys (no defaults, empty if not set)
    elements.openaiKey.value = (result.openaiApiKey as string | undefined) || '';
    elements.elevenlabsKey.value = (result.elevenlabsApiKey as string | undefined) || '';
    elements.cartesiaKey.value = (result.cartesiaApiKey as string | undefined) || '';
    elements.groqKey.value = (result.groqApiKey as string | undefined) || '';

    // Settings with defaults
    elements.defaultProvider.value = (result.provider as string | undefined) || settingsDefaults.provider;
    elements.defaultSpeed.value = String((result.speed as number | undefined) || settingsDefaults.speed);
    elements.speedValue.textContent = `${(result.speed as number | undefined) || settingsDefaults.speed}x`;
    elements.defaultMode.value = (result.mode as string | undefined) || settingsDefaults.mode;

    console.log('VoxPage options: Settings loaded, mode:', (result.mode as string | undefined) || settingsDefaults.mode);

    // Boolean settings with defaults
    elements.highlightEnabled.checked = (result.highlightEnabled as boolean | undefined) !== undefined
      ? (result.highlightEnabled as boolean)
      : uiDefaults.highlightEnabled;

    elements.autoScroll.checked = (result.autoScroll as boolean | undefined) !== undefined
      ? (result.autoScroll as boolean)
      : uiDefaults.autoScroll;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  if (!elements) return;

  // Toggle password visibility
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = (btn as HTMLElement).dataset.target;
      if (!targetId) return;

      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Speed slider
  elements.defaultSpeed.addEventListener('input', (e) => {
    if (!elements) return;
    const value = parseFloat((e.target as HTMLInputElement).value);
    elements.speedValue.textContent = `${value.toFixed(1)}x`;
  });

  // Test ElevenLabs API key button
  elements.testElevenlabsKey.addEventListener('click', testElevenLabsApiKey);

  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);

  // Auto-save on input change (with debounce)
  const autoSaveInputs: HTMLElement[] = [
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
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(saveSettings, 500);
    });
  });
}

/**
 * Test ElevenLabs API key
 */
async function testElevenLabsApiKey(): Promise<void> {
  if (!elements) return;

  // Save the key first to ensure it's in storage
  const key = elements.elevenlabsKey.value.trim();
  if (!key) {
    showApiKeyStatus('elevenlabs', 'No API key entered', 'error');
    return;
  }

  // Save to storage first
  await browser.storage.local.set({ elevenlabsApiKey: key });

  showApiKeyStatus('elevenlabs', 'Testing...', 'loading');

  try {
    const response = await browser.runtime.sendMessage({
      type: 'testApiKey',
      provider: 'elevenlabs',
    });

    if (response && response.success) {
      showApiKeyStatus('elevenlabs', response.message || 'Valid!', 'success');
    } else {
      showApiKeyStatus('elevenlabs', response?.error || 'Invalid key', 'error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Test failed';
    showApiKeyStatus('elevenlabs', errorMessage, 'error');
  }
}

/**
 * Show API key test status
 */
function showApiKeyStatus(provider: string, message: string, type: 'success' | 'error' | 'loading'): void {
  if (!elements) return;

  const statusElement = elements.elevenlabsKeyStatus;
  statusElement.textContent = message;
  statusElement.className = `api-key-status api-key-status--${type}`;
  statusElement.style.display = 'block';

  // Auto-hide success/error messages after 5 seconds
  if (type !== 'loading') {
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 5000);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(): Promise<void> {
  if (!elements) return;

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
function showSaveStatus(message: string, isError = false): void {
  if (!elements) return;

  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = isError ? '#ef4444' : '#10b981';
  elements.saveStatus.classList.add('show');

  // Add success pulse animation to save button
  if (!isError && elements.saveBtn) {
    elements.saveBtn.classList.add('save-success');
    setTimeout(() => {
      elements?.saveBtn.classList.remove('save-success');
    }, 500);
  }

  setTimeout(() => {
    elements?.saveStatus.classList.remove('show');
  }, 2000);
}

// ========================================
// LOGGING CONFIGURATION (014-loki-remote-logging)
// ========================================

/**
 * Load logging configuration from storage
 */
async function loadLoggingConfig(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get('loggingConfig');
    const config: LoggingConfig = { ...loggingDefaults, ...(result.loggingConfig as Partial<LoggingConfig> || {}) };

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
function setupLoggingEventListeners(): void {
  if (!elements) return;

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
  elements.viewLogsBtn.addEventListener('click', viewLogs);
  elements.flushLogsBtn.addEventListener('click', flushLogs);
  elements.clearLogsBtn.addEventListener('click', clearLogs);
  elements.exportLogsBtn.addEventListener('click', exportLogs);

  // Auto-save logging config on change
  const loggingInputs: HTMLElement[] = [
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

  loggingInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (loggingSaveTimeout) {
        clearTimeout(loggingSaveTimeout);
      }
      loggingSaveTimeout = setTimeout(saveLoggingConfig, 500);
    });
  });
}

/**
 * Update visibility of logging config section
 */
function updateLoggingConfigVisibility(): void {
  if (!elements) return;

  elements.loggingConfigSection.style.display =
    elements.loggingEnabled.checked ? 'block' : 'none';
}

/**
 * Update visibility of auth fields based on selected auth type
 */
function updateAuthFieldsVisibility(): void {
  if (!elements) return;

  const authType = elements.loggingAuthType.value;

  // Hide all auth fields first
  elements.basicAuthFields.style.display = 'none';
  elements.bearerAuthFields.style.display = 'none';
  elements.cloudflareAuthFields.style.display = 'none';

  // Show relevant auth fields
  switch (authType) {
    case 'basic':
      elements.basicAuthFields.style.display = 'block';
      break;
    case 'bearer':
      elements.bearerAuthFields.style.display = 'block';
      break;
    case 'cloudflare':
      elements.cloudflareAuthFields.style.display = 'block';
      break;
  }
}

/**
 * Save logging configuration to storage
 */
async function saveLoggingConfig(): Promise<void> {
  if (!elements) return;

  try {
    const config: LoggingConfig = {
      enabled: elements.loggingEnabled.checked,
      endpoint: elements.loggingEndpoint.value.trim() || null,
      authType: elements.loggingAuthType.value as LoggingConfig['authType'],
      username: elements.loggingUsername.value.trim() || null,
      password: elements.loggingPassword.value || null,
      bearerToken: elements.loggingBearerToken.value || null,
      cfAccessClientId: elements.loggingCfClientId.value.trim() || null,
      cfAccessClientSecret: elements.loggingCfClientSecret.value || null,
      logLevel: elements.loggingLogLevel.value as LoggingConfig['logLevel'],
      batchIntervalMs: loggingDefaults.batchIntervalMs,
      maxBatchSize: loggingDefaults.maxBatchSize,
      maxBufferBytes: loggingDefaults.maxBufferBytes,
    };

    // Validate endpoint URL if enabled
    if (config.enabled && config.endpoint) {
      const validation = validateLoggingEndpoint(config.endpoint);
      if (!validation.valid) {
        showLoggingStatus(validation.error || 'Invalid endpoint', 'error');
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
 */
function validateLoggingEndpoint(url: string): EndpointValidation {
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
async function testLoggingConnection(): Promise<void> {
  if (!elements) return;

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
    showLoggingStatus(validation.error || 'Invalid endpoint', 'error');
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showLoggingStatus(`Connection failed: ${errorMessage}`, 'error');
  }
}

/**
 * Show logging test status message
 */
function showLoggingStatus(message: string, type: 'success' | 'error' | 'loading'): void {
  if (!elements) return;

  elements.loggingTestStatus.textContent = message;
  elements.loggingTestStatus.className = `logging-test-status show ${type}`;

  // Auto-hide success/error messages
  if (type !== 'loading') {
    setTimeout(() => {
      elements?.loggingTestStatus.classList.remove('show');
    }, 5000);
  }
}

// ========================================
// LOG VIEWER FUNCTIONS
// ========================================

/**
 * View buffered logs
 */
async function viewLogs(): Promise<void> {
  if (!elements) return;

  updateLogViewerStatus('Loading logs...');

  try {
    const response = await browser.runtime.sendMessage({ action: 'getLogs' }) as LogViewerResponse;

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

        elements?.logViewerContent.appendChild(entry);
      });

      elements.logViewerContainer.style.display = 'block';
      updateLogViewerStatus(`${logs.length} logs in buffer (${status.bufferBytes} bytes)`);
    } else {
      updateLogViewerStatus('Failed to load logs');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateLogViewerStatus(`Error: ${errorMessage}`);
  }
}

/**
 * Flush logs to Loki now
 */
async function flushLogs(): Promise<void> {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateLogViewerStatus(`Error: ${errorMessage}`);
  }
}

/**
 * Clear all buffered logs
 */
async function clearLogs(): Promise<void> {
  if (!elements) return;

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateLogViewerStatus(`Error: ${errorMessage}`);
  }
}

/**
 * Export logs as JSON file
 */
async function exportLogs(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getLogs' }) as LogViewerResponse;

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateLogViewerStatus(`Error: ${errorMessage}`);
  }
}

/**
 * Update log viewer status message
 */
function updateLogViewerStatus(message: string): void {
  if (!elements) return;

  elements.logViewerStatus.textContent = message;
}
