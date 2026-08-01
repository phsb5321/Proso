// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Options Page Controller
 * TypeScript conversion from options/options.js
 */

import { browser } from 'wxt/browser';
import { HIGHLIGHT_EXPORT_FILENAME } from '../../core/highlight/highlight-export';
import {
  type QueueSettings,
  queueDefaults,
  defaults as settingsDefaults,
} from '../../utils/config';
import { downloadJson } from '../../utils/download/download-json';
import { createLogger } from '../../utils/logging/logger';
import { confirmDialog } from '../../utils/ui/confirm-dialog';

// UI defaults (inline since they're simple)
const uiDefaults = {
  highlightEnabled: true,
  autoScroll: true,
};

// Logging defaults for options page
const loggingDefaults = {
  enabled: false,
  endpoint: '',
  authType: 'none' as const,
  basicUsername: '',
  basicPassword: '',
  bearerToken: '',
  logLevel: 'warn' as const,
};

// Type definitions
type LoggingConfig = typeof loggingDefaults;
type LogViewerResponse = {
  logs: Array<{
    timestamp: number;
    level: string;
    message: string;
    date?: string;
    component?: string;
    metadata?: Record<string, unknown>;
  }>;
  total: number;
  status?: { bufferBytes: number };
};

import { saveApiKey, testApiKey } from '../../utils/options/api-key-tester';
import { type ScrollSpyInstance, createScrollSpy } from '../../utils/options/scroll-spy';
import { type ThemeMode, getThemeManager } from '../../utils/options/theme-manager';
import { usageTracker } from '../../utils/telemetry/usage';
import { showConfirmModal } from './components/modal';
import { setupSidebarKeyboardNav } from './components/sidebar';
import { toast } from './components/toast';

const log = createLogger('options');

/**
 * DOM element references
 */
interface OptionsElements {
  // Theme selector (027-settings-ux-overhaul T057)
  themeMode: HTMLSelectElement;

  // Quick Settings (027-settings-ux-overhaul T020-T023)
  quickProvider: HTMLSelectElement;
  quickVoice: HTMLSelectElement;
  quickSpeed: HTMLInputElement;
  quickSpeedValue: HTMLElement;

  // API Key inputs
  elevenlabsKey: HTMLInputElement;
  elevenlabsKeyStatus: HTMLElement;

  // Settings inputs
  highlightEnabled: HTMLInputElement;
  autoScroll: HTMLInputElement;

  // UI elements
  saveBtn: HTMLButtonElement;
  saveStatus: HTMLElement;

  // Logging elements
  loggingEnabled: HTMLInputElement;

  // Log viewer elements
  viewLogsBtn: HTMLButtonElement;
  flushLogsBtn: HTMLButtonElement;
  clearLogsBtn: HTMLButtonElement;
  exportLogsBtn: HTMLButtonElement;
  copyLogsBtn: HTMLButtonElement;
  logViewerStatus: HTMLElement;
  logViewerContainer: HTMLElement;
  logViewerContent: HTMLElement;

  // Queue settings elements (T079)
  queueAutoPlayNext: HTMLInputElement;
  queueMaxItems: HTMLSelectElement;
  queueSaveProgress: HTMLInputElement;
  clearCompletedQueue: HTMLButtonElement;
  clearAllQueue: HTMLButtonElement;
  queueStatus: HTMLElement;

  // Telemetry elements (T018)
  telemetryEnabled: HTMLInputElement;

  // Server status elements
  serverStatusDot: HTMLElement;
  serverStatusText: HTMLElement;
  serverStatusRefresh: HTMLButtonElement;
  serverDetailUrl: HTMLElement;
  serverDetailVersion: HTMLElement;
  serverDetailUptime: HTMLElement;
  serverDetailError: HTMLElement;
}

let elements: OptionsElements | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loggingSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let queueSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let quickSettingsSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let scrollSpyInstance: ScrollSpyInstance | null = null;

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
    // Theme selector (027-settings-ux-overhaul T057)
    themeMode: getElement<HTMLSelectElement>('themeMode'),

    // Quick Settings (027-settings-ux-overhaul T020-T023)
    quickProvider: getElement<HTMLSelectElement>('quickProvider'),
    quickVoice: getElement<HTMLSelectElement>('quickVoice'),
    quickSpeed: getElement<HTMLInputElement>('quickSpeed'),
    quickSpeedValue: getElement<HTMLElement>('quickSpeedValue'),

    // API Key inputs
    elevenlabsKey: getElement<HTMLInputElement>('elevenlabsKey'),
    elevenlabsKeyStatus: getElement<HTMLElement>('elevenlabsKeyStatus'),

    // Settings inputs
    highlightEnabled: getElement<HTMLInputElement>('highlightEnabled'),
    autoScroll: getElement<HTMLInputElement>('autoScroll'),
    saveBtn: getElement<HTMLButtonElement>('saveBtn'),
    saveStatus: getElement<HTMLElement>('saveStatus'),
    loggingEnabled: getElement<HTMLInputElement>('loggingEnabled'),
    viewLogsBtn: getElement<HTMLButtonElement>('viewLogsBtn'),
    flushLogsBtn: getElement<HTMLButtonElement>('flushLogsBtn'),
    clearLogsBtn: getElement<HTMLButtonElement>('clearLogsBtn'),
    exportLogsBtn: getElement<HTMLButtonElement>('exportLogsBtn'),
    copyLogsBtn: getElement<HTMLButtonElement>('copyLogsBtn'),
    logViewerStatus: getElement<HTMLElement>('logViewerStatus'),
    logViewerContainer: getElement<HTMLElement>('logViewerContainer'),
    logViewerContent: getElement<HTMLElement>('logViewerContent'),

    // Queue settings elements (T079)
    queueAutoPlayNext: getElement<HTMLInputElement>('queueAutoPlayNext'),
    queueMaxItems: getElement<HTMLSelectElement>('queueMaxItems'),
    queueSaveProgress: getElement<HTMLInputElement>('queueSaveProgress'),
    clearCompletedQueue: getElement<HTMLButtonElement>('clearCompletedQueue'),
    clearAllQueue: getElement<HTMLButtonElement>('clearAllQueue'),
    queueStatus: getElement<HTMLElement>('queueStatus'),

    // Telemetry elements (T018)
    telemetryEnabled: getElement<HTMLInputElement>('telemetryEnabled'),

    // Server status elements
    serverStatusDot: getElement<HTMLElement>('serverStatusDot'),
    serverStatusText: getElement<HTMLElement>('serverStatusText'),
    serverStatusRefresh: getElement<HTMLButtonElement>('serverStatusRefresh'),
    serverDetailUrl: getElement<HTMLElement>('serverDetailUrl'),
    serverDetailVersion: getElement<HTMLElement>('serverDetailVersion'),
    serverDetailUptime: getElement<HTMLElement>('serverDetailUptime'),
    serverDetailError: getElement<HTMLElement>('serverDetailError'),
  };
}

/**
 * Initialize the options page
 */
export async function initOptionsPage(): Promise<void> {
  elements = getElements();

  // T018: Initialize telemetry for settings page
  await initTelemetry();

  await loadSettings();
  await loadQuickSettings();
  await loadLoggingConfig();
  await loadQueueConfig();
  await loadCacheStats();
  await loadThemePreference();
  await loadTelemetryConfig();

  setupQuickSettingsEventListeners();
  setupEventListeners();
  setupProviderCardEventListeners();
  setupLoggingEventListeners();
  setupQueueEventListeners();
  setupCacheEventListeners();
  setupHighlightsEventListeners();
  setupTelemetryEventListeners();
  setupAccordions();
  setupStorageChangeListener();
  setupSidebarNavigation();
  setupThemeEventListener();
  setupResetButtons();
  setupServerStatusListeners();

  // Check server status on page load (non-blocking)
  void checkServerStatus();
}

// ========================================
// QUICK SETTINGS (027-settings-ux-overhaul T020-T024)
// ========================================

/**
 * Voice configurations by provider
 * T021: Voice options filtered by provider
 */
const PROVIDER_VOICES: Record<string, Array<{ value: string; label: string }>> = {
  elevenlabs: [{ value: 'default', label: 'Default Voice' }],
};

/**
 * Load Quick Settings from storage
 * T020: Provider dropdown, T021: Voice dropdown, T022: Speed slider
 */
async function loadQuickSettings(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get(['provider', 'voice', 'speed']);

    // Provider dropdown
    const provider = (result.provider as string) || settingsDefaults.provider;
    elements.quickProvider.value = provider;

    // Voice dropdown - populate based on provider
    await updateVoiceDropdown(provider);
    const voice = (result.voice as string) || '';
    if (voice) {
      elements.quickVoice.value = voice;
    }

    // Speed slider
    const speed = (result.speed as number) || settingsDefaults.speed;
    elements.quickSpeed.value = String(speed);
    elements.quickSpeedValue.textContent = `${speed.toFixed(1)}x`;
  } catch (error) {
    log.error('Error loading Quick Settings', { error });
  }
}

/**
 * Update voice dropdown based on selected provider
 * T021: Voice dropdown filtered by provider
 */
async function updateVoiceDropdown(provider: string): Promise<void> {
  if (!elements) return;

  const voiceSelect = elements.quickVoice;

  // Clear existing options using safe DOM method
  while (voiceSelect.firstChild) {
    voiceSelect.removeChild(voiceSelect.firstChild);
  }

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default Voice';
  voiceSelect.appendChild(defaultOption);

  // Get voices for provider
  const voices = PROVIDER_VOICES[provider] || [];

  // Add voice options
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.value;
    option.textContent = voice.label;
    voiceSelect.appendChild(option);
  });
}

/**
 * Setup Quick Settings event listeners
 * T020: Provider auto-save, T022-T023: Speed slider with debounce, T024: Toast notifications
 */
function setupQuickSettingsEventListeners(): void {
  if (!elements) return;

  // T020: Provider dropdown with auto-save
  elements.quickProvider.addEventListener('change', async () => {
    if (!elements) return;

    const provider = elements.quickProvider.value;

    // Update voice dropdown for new provider
    await updateVoiceDropdown(provider);

    // Auto-save provider
    await saveQuickSetting('provider', provider);

    // Notify background to reconfigure audio generator
    try {
      await browser.runtime.sendMessage({ type: 'provider.select', provider });
    } catch {
      // Background may not be ready yet — storage change listener will pick it up
    }

    toast.success('Provider updated');
  });

  // T021: Voice dropdown with auto-save
  elements.quickVoice.addEventListener('change', async () => {
    if (!elements) return;

    const voice = elements.quickVoice.value;
    await saveQuickSetting('voice', voice);
    toast.success('Voice updated');
  });

  // T022: Speed slider with live value display
  elements.quickSpeed.addEventListener('input', () => {
    if (!elements) return;

    const value = Number.parseFloat(elements.quickSpeed.value);
    elements.quickSpeedValue.textContent = `${value.toFixed(1)}x`;
  });

  // T023: Debounced auto-save for slider on release
  elements.quickSpeed.addEventListener('change', () => {
    if (!elements) return;

    // Clear any pending save
    if (quickSettingsSaveTimeout) {
      clearTimeout(quickSettingsSaveTimeout);
    }

    // Debounce save by 300ms
    quickSettingsSaveTimeout = setTimeout(async () => {
      if (!elements) return;

      const speed = Number.parseFloat(elements.quickSpeed.value);
      await saveQuickSetting('speed', speed);
      toast.success('Speed updated');
    }, 300);
  });
}

/**
 * Save a single Quick Setting to storage
 * T020: Auto-save functionality
 */
async function saveQuickSetting(key: string, value: string | number): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });

    // T018: Track setting changes
    trackSettingChange('settings.quick_setting_changed', { key, value });
  } catch (error) {
    log.error(`Error saving ${key}`, { error });
    toast.error(`Failed to save ${key}`);
  }
}

/**
 * Setup storage change listener for cross-tab sync
 * T013/FR-036: Cross-tab sync
 */
function setupStorageChangeListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !elements) return;

    // Update Quick Settings if changed from another tab
    if (changes.provider) {
      elements.quickProvider.value = changes.provider.newValue as string;
      updateVoiceDropdown(changes.provider.newValue as string);
    }

    if (changes.voice) {
      elements.quickVoice.value = changes.voice.newValue as string;
    }

    if (changes.speed) {
      const speed = changes.speed.newValue as number;
      elements.quickSpeed.value = String(speed);
      elements.quickSpeedValue.textContent = `${speed.toFixed(1)}x`;
    }

    // Update appearance settings
    if (changes.highlightEnabled !== undefined) {
      elements.highlightEnabled.checked = changes.highlightEnabled.newValue as boolean;
    }

    if (changes.autoScroll !== undefined) {
      elements.autoScroll.checked = changes.autoScroll.newValue as boolean;
    }

    // T073: Cost estimate toggle sync (028-smart-audio-cache)
    if (changes.showCostEstimate !== undefined) {
      const showCostEstimateEl = document.getElementById(
        'showCostEstimate',
      ) as HTMLInputElement | null;
      if (showCostEstimateEl) {
        showCostEstimateEl.checked = changes.showCostEstimate.newValue as boolean;
      }
    }
  });
}

/**
 * Setup collapsible accordion sections (018-ui-redesign T084)
 */
function setupAccordions(): void {
  const accordionHeaders = document.querySelectorAll('.proso-accordion__header');

  accordionHeaders.forEach((header) => {
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

// ========================================
// SIDEBAR NAVIGATION (027-settings-ux-overhaul T043-T046)
// ========================================

/**
 * Setup sidebar navigation with scroll-spy and deep linking
 * T043: Smooth scroll on sidebar click
 * T044: URL hash navigation (deep linking)
 * T045: Initialize scroll-spy with IntersectionObserver
 * T046: Add keyboard navigation for sidebar
 */
function setupSidebarNavigation(): void {
  // T045: Initialize scroll-spy
  scrollSpyInstance = createScrollSpy({
    sectionSelector: 'section[id]',
    navLinkSelector: '.sidebar-link',
    onActiveChange: (sectionId) => {
      // Update URL hash silently (without scrolling)
      if (sectionId) {
        const url = new URL(window.location.href);
        url.hash = sectionId;
        window.history.replaceState(null, '', url.toString());
      }
    },
  });

  scrollSpyInstance.start();

  // T043: Smooth scroll on sidebar click
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;

      const sectionId = href.slice(1);
      scrollToSection(sectionId);

      // Update scroll-spy active state immediately
      if (scrollSpyInstance) {
        scrollSpyInstance.setActiveSection(sectionId);
      }
    });
  });

  // T044: Handle initial URL hash on page load
  handleInitialHash();

  // T044: Handle hash changes (e.g., back/forward navigation)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      scrollToSection(hash);
      if (scrollSpyInstance) {
        scrollSpyInstance.setActiveSection(hash);
      }
    }
  });

  // T046: Keyboard navigation for sidebar
  setupSidebarKeyboardNav();
}

/**
 * Scroll to a section with smooth scroll
 * T043: Smooth scroll on sidebar click
 */
function scrollToSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (!section) return;

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  section.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });

  // Update focus for accessibility
  section.setAttribute('tabindex', '-1');
  section.focus({ preventScroll: true });
}

/**
 * Handle initial URL hash on page load
 * T044: URL hash navigation (deep linking)
 */
function handleInitialHash(): void {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  // Wait for DOM to be fully ready
  requestAnimationFrame(() => {
    const section = document.getElementById(hash);
    if (section) {
      // Scroll to section without animation on initial load
      section.scrollIntoView({ block: 'start' });

      if (scrollSpyInstance) {
        scrollSpyInstance.setActiveSection(hash);
      }
    }
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
      'elevenlabsApiKey',
      'provider',
      'speed',
      'mode',
      'highlightEnabled',
      'autoScroll',
      'showCostEstimate',
    ]);

    // API keys (no defaults, empty if not set)
    elements.elevenlabsKey.value = (result.elevenlabsApiKey as string | undefined) || '';

    log.info('Proso options: Settings loaded', {
      mode: (result.mode as string | undefined) || settingsDefaults.mode,
    });

    // Boolean settings with defaults
    elements.highlightEnabled.checked =
      (result.highlightEnabled as boolean | undefined) !== undefined
        ? (result.highlightEnabled as boolean)
        : uiDefaults.highlightEnabled;

    elements.autoScroll.checked =
      (result.autoScroll as boolean | undefined) !== undefined
        ? (result.autoScroll as boolean)
        : uiDefaults.autoScroll;

    // Cost estimate toggle (028-smart-audio-cache T073)
    const showCostEstimateEl = document.getElementById(
      'showCostEstimate',
    ) as HTMLInputElement | null;
    if (showCostEstimateEl) {
      showCostEstimateEl.checked =
        (result.showCostEstimate as boolean | undefined) !== undefined
          ? (result.showCostEstimate as boolean)
          : true; // Default to true
    }
  } catch (error) {
    log.error('Error loading settings', { error });
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  if (!elements) return;

  // Toggle password visibility
  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = (btn as HTMLElement).dataset.target;
      if (!targetId) return;

      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // NOTE: Legacy testElevenLabsApiKey handler removed.
  // ElevenLabs test button now uses the modern provider card handler
  // (setupProviderCardEventListeners -> handleProviderTest) which is
  // attached via .provider-card__test-btn[data-provider="elevenlabs"]

  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);

  // Auto-save on input change (with debounce)
  const autoSaveInputs: HTMLElement[] = [elements.elevenlabsKey];

  autoSaveInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(saveSettings, 500);
    });
  });

  // T049-T051: Appearance toggles with auto-save and toast
  setupAppearanceToggles();
}

// ========================================
// APPEARANCE SETTINGS (027-settings-ux-overhaul T049-T051)
// ========================================

/**
 * Setup appearance toggle event listeners with auto-save and toast
 * T049: highlightEnabled toggle with auto-save
 * T050: autoScroll toggle with auto-save
 * T051: Show toast on appearance setting change
 */
function setupAppearanceToggles(): void {
  if (!elements) return;

  // T049: Highlight toggle
  elements.highlightEnabled.addEventListener('change', async () => {
    if (!elements) return;

    const enabled = elements.highlightEnabled.checked;
    await browser.storage.local.set({ highlightEnabled: enabled });

    toast.success(enabled ? 'Text highlighting enabled' : 'Text highlighting disabled');
  });

  // T050: Auto-scroll toggle
  elements.autoScroll.addEventListener('change', async () => {
    if (!elements) return;

    const enabled = elements.autoScroll.checked;
    await browser.storage.local.set({ autoScroll: enabled });

    toast.success(enabled ? 'Auto-scroll enabled' : 'Auto-scroll disabled');
  });

  // T073: Cost estimate toggle (028-smart-audio-cache)
  const showCostEstimateEl = document.getElementById('showCostEstimate') as HTMLInputElement | null;
  if (showCostEstimateEl) {
    showCostEstimateEl.addEventListener('change', async () => {
      const enabled = showCostEstimateEl.checked;
      await browser.storage.local.set({ showCostEstimate: enabled });

      toast.success(enabled ? 'Cost estimates enabled' : 'Cost estimates hidden');
    });
  }
}

// ========================================
// THEME SETTINGS (027-settings-ux-overhaul T056-T058)
// ========================================

/**
 * Load theme preference from storage and update UI
 * T057: Theme change handler
 */
async function loadThemePreference(): Promise<void> {
  if (!elements) return;

  const themeManager = getThemeManager();
  const currentMode = themeManager.getMode();

  elements.themeMode.value = currentMode;
}

/**
 * Setup theme selector event listener
 * T057: Implement theme change handler with instant apply
 */
function setupThemeEventListener(): void {
  if (!elements) return;

  elements.themeMode.addEventListener('change', async () => {
    if (!elements) return;

    const mode = elements.themeMode.value as ThemeMode;
    const themeManager = getThemeManager();

    await themeManager.setMode(mode);

    const modeLabels: Record<ThemeMode, string> = {
      system: 'system theme',
      light: 'light theme',
      dark: 'dark theme',
    };

    toast.success(`Switched to ${modeLabels[mode]}`);
  });
}

// NOTE: Legacy testElevenLabsApiKey and showApiKeyStatus functions removed.
// ElevenLabs (and all providers) now use the modern handleProviderTest() function
// which is attached via setupProviderCardEventListeners() to .provider-card__test-btn elements.

// ========================================
// PROVIDER CARD HANDLERS (027-settings-ux-overhaul T033-T035)
// ========================================

/**
 * Storage key mapping for each provider's API key
 */
const PROVIDER_INPUT_IDS: Record<string, string> = {
  elevenlabs: 'elevenlabsKey',
};

/**
 * Setup provider card event listeners
 * T033: Test button with loading state
 * T034: Display test results with success/error icons
 * T035: Explicit Save button per provider card
 */
function setupProviderCardEventListeners(): void {
  // Test buttons (T033)
  document.querySelectorAll('.provider-card__test-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      const provider = button.dataset.provider;
      if (!provider) return;

      await handleProviderTest(provider, button);
    });
  });

  // Save buttons (T035)
  document.querySelectorAll('.provider-card__save-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      const provider = button.dataset.provider;
      if (!provider) return;

      await handleProviderSave(provider, button);
    });
  });

  // Auto-trim whitespace on paste for API key inputs (T037)
  document.querySelectorAll('.provider-card__input').forEach((input) => {
    input.addEventListener('paste', (e) => {
      const inputEl = e.target as HTMLInputElement;
      // Let the paste complete, then trim
      setTimeout(() => {
        inputEl.value = inputEl.value.trim();
      }, 0);
    });
  });
}

/**
 * Handle provider API key test
 * T033: Test button with loading state
 * T034: Display test results with success/error icons
 */
async function handleProviderTest(provider: string, button: HTMLButtonElement): Promise<void> {
  const inputId = PROVIDER_INPUT_IDS[provider];
  if (!inputId) return;

  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input) return;

  const apiKey = input.value.trim();
  const statusEl = document.querySelector(
    `.provider-card__status[data-provider="${provider}"]`,
  ) as HTMLElement | null;

  // Validate input
  if (!apiKey) {
    showProviderCardStatus(statusEl, 'No API key entered', 'error');
    toast.error('Please enter an API key first');
    return;
  }

  // Set loading state (T033)
  button.disabled = true;
  button.textContent = 'Testing...';
  button.classList.add('loading');
  showProviderCardStatus(statusEl, 'Testing...', 'loading');

  // T018: Track API key test initiated (not the key itself!)
  trackSettingChange('settings.api_key_tested', { provider });

  try {
    const result = await testApiKey(provider, apiKey);

    log.debug('[Controller] testApiKey returned', {
      result: JSON.stringify(result, null, 2),
      success: result.success,
    });

    if (result.success) {
      // T034: Display success with icon
      const latencyInfo = result.latencyMs ? ` (${result.latencyMs}ms)` : '';
      showProviderCardStatus(statusEl, `✓ Valid${latencyInfo}`, 'success');
      toast.success(`${capitalizeProvider(provider)} API key is valid`);

      // T018: Track successful API key test
      trackSettingChange('settings.api_key_test_success', {
        provider,
        latencyMs: result.latencyMs,
      });
    } else {
      // T034: Display error with icon
      showProviderCardStatus(statusEl, `✗ ${result.message}`, 'error');
      toast.error(result.message);

      // T018: Track failed API key test (not the key, just provider and error type)
      trackSettingChange('settings.api_key_test_failed', {
        provider,
        errorType: 'validation_failed',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Test failed';
    showProviderCardStatus(statusEl, `✗ ${errorMessage}`, 'error');
    toast.error(errorMessage);

    // T018: Track API key test error
    trackSettingChange('settings.api_key_test_failed', {
      provider,
      errorType: 'exception',
    });
  } finally {
    // Reset button state
    button.disabled = false;
    button.textContent = 'Test';
    button.classList.remove('loading');
  }
}

/**
 * Handle provider API key save
 * T035: Explicit Save button per provider card
 */
async function handleProviderSave(provider: string, button: HTMLButtonElement): Promise<void> {
  const inputId = PROVIDER_INPUT_IDS[provider];
  if (!inputId) return;

  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input) return;

  const apiKey = input.value.trim();
  const statusEl = document.querySelector(
    `.provider-card__status[data-provider="${provider}"]`,
  ) as HTMLElement | null;

  // Set loading state
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    await saveApiKey(provider, apiKey);

    showProviderCardStatus(statusEl, '✓ Saved', 'success');
    toast.success(`${capitalizeProvider(provider)} API key saved`);

    // Update legacy elements if they exist
    if (elements) {
      const legacyInput = elements[inputId as keyof OptionsElements] as
        | HTMLInputElement
        | undefined;
      if (legacyInput && legacyInput.value !== undefined) {
        legacyInput.value = apiKey;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Save failed';
    showProviderCardStatus(statusEl, `✗ ${errorMessage}`, 'error');
    toast.error(errorMessage);
  } finally {
    // Reset button state
    button.disabled = false;
    button.textContent = 'Save';
  }
}

/**
 * Show status in provider card status element
 * T034: Display test results with success/error icons
 */
function showProviderCardStatus(
  statusEl: HTMLElement | null,
  message: string,
  type: 'success' | 'error' | 'loading',
): void {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `provider-card__status provider-card__status--${type}`;

  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'provider-card__status';
    }, 5000);
  }
}

/**
 * Capitalize provider name for display
 */
function capitalizeProvider(provider: string): string {
  const names: Record<string, string> = {
    elevenlabs: 'ElevenLabs',
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Save settings to storage
 */
async function saveSettings(): Promise<void> {
  if (!elements) return;

  try {
    await browser.storage.local.set({
      elevenlabsApiKey: elements.elevenlabsKey.value.trim(),
      provider: elements.quickProvider.value,
      speed: Number.parseFloat(elements.quickSpeed.value),
      highlightEnabled: elements.highlightEnabled.checked,
      autoScroll: elements.autoScroll.checked,
    });

    // T018: Track settings saved event
    trackSettingChange('settings.saved', {
      provider: elements.quickProvider.value,
      highlightEnabled: elements.highlightEnabled.checked,
      autoScroll: elements.autoScroll.checked,
    });

    showSaveStatus('Settings saved!');
  } catch (error) {
    log.error('Error saving settings', { error });
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
    const result = await browser.storage.local.get('proso_logging_config');
    const config: LoggingConfig = {
      ...loggingDefaults,
      ...((result.proso_logging_config as Partial<LoggingConfig>) || {}),
    };

    // Only the toggle is visible - other settings use defaults
    elements.loggingEnabled.checked = config.enabled;
  } catch (error) {
    log.error('Error loading logging config', { error });
  }
}

/**
 * Setup logging-specific event listeners
 * Simplified: only toggle and log viewer buttons are active
 */
function setupLoggingEventListeners(): void {
  if (!elements) return;

  // Auto-save when toggle changes
  elements.loggingEnabled.addEventListener('change', () => {
    if (loggingSaveTimeout) {
      clearTimeout(loggingSaveTimeout);
    }
    loggingSaveTimeout = setTimeout(saveLoggingConfig, 500);
  });

  // Log viewer buttons
  elements.viewLogsBtn.addEventListener('click', viewLogs);
  elements.flushLogsBtn.addEventListener('click', flushLogs);
  elements.clearLogsBtn.addEventListener('click', clearLogs);
  elements.exportLogsBtn.addEventListener('click', exportLogs);
  elements.copyLogsBtn.addEventListener('click', copyLogs);
}

/**
 * Save logging configuration to storage
 * Uses defaults for all settings except enabled toggle
 */
async function saveLoggingConfig(): Promise<void> {
  if (!elements) return;

  try {
    const config: LoggingConfig = {
      ...loggingDefaults,
      enabled: elements.loggingEnabled.checked,
    };

    await browser.storage.local.set({ proso_logging_config: config });
    showSaveStatus('Settings saved!');
  } catch (error) {
    log.error('Error saving logging config', { error });
    showSaveStatus('Error saving settings', true);
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
    const response = (await browser.runtime.sendMessage({
      action: 'getLogs',
    })) as LogViewerResponse;

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
      logs.forEach((log) => {
        const entry = document.createElement('div');
        entry.className = `log-entry log-entry--${log.level}`;

        const meta = log.metadata ? ` ${JSON.stringify(log.metadata)}` : '';
        entry.textContent = `[${log.date}] [${log.level.toUpperCase()}] [${log.component}] ${log.message}${meta}`;

        elements?.logViewerContent.appendChild(entry);
      });

      elements.logViewerContainer.style.display = 'block';
      updateLogViewerStatus(`${logs.length} logs in buffer (${status?.bufferBytes ?? 0} bytes)`);
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
      // Handle error which could be a string, object, or undefined
      let errorMsg = 'Unknown error';
      if (response?.error) {
        errorMsg =
          typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
      }
      updateLogViewerStatus(`Flush failed: ${errorMsg}`);
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

  const confirmed = await confirmDialog({
    title: 'Clear buffered logs',
    message: 'Are you sure you want to clear all buffered logs? This cannot be undone.',
    confirmLabel: 'Clear logs',
    destructive: true,
  });
  if (!confirmed) {
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
    const response = (await browser.runtime.sendMessage({
      action: 'getLogs',
    })) as LogViewerResponse;

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
      a.download = `proso-logs-${new Date().toISOString().slice(0, 10)}.json`;
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
 * Copy logs to clipboard as formatted text
 */
async function copyLogs(): Promise<void> {
  try {
    const response = (await browser.runtime.sendMessage({
      action: 'getLogs',
    })) as LogViewerResponse;

    if (response && response.logs && response.logs.length > 0) {
      const { logs } = response;

      // Format logs as readable text
      const logText = logs
        .map((log) => {
          const meta = log.metadata ? ` ${JSON.stringify(log.metadata)}` : '';
          return `[${log.date}] [${log.level.toUpperCase()}] [${log.component}] ${log.message}${meta}`;
        })
        .join('\n');

      await navigator.clipboard.writeText(logText);
      updateLogViewerStatus(`Copied ${logs.length} logs to clipboard`);
    } else {
      updateLogViewerStatus('No logs to copy');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateLogViewerStatus(`Error copying logs: ${errorMessage}`);
  }
}

/**
 * Update log viewer status message
 */
function updateLogViewerStatus(message: string): void {
  if (!elements) return;

  elements.logViewerStatus.textContent = message;
}

// ========================================
// QUEUE SETTINGS (T079)
// ========================================

/**
 * Load queue configuration from storage
 */
async function loadQueueConfig(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get('queue:settings');
    const config: QueueSettings = {
      ...queueDefaults,
      ...((result['queue:settings'] as Partial<QueueSettings>) || {}),
    };

    elements.queueAutoPlayNext.checked = config.autoPlayNext;
    elements.queueMaxItems.value = String(config.maxQueueSize);
    // Note: saveProgress is derived from autoPlayNext for now
    elements.queueSaveProgress.checked = config.autoPlayNext;
  } catch (error) {
    log.error('Error loading queue config', { error });
  }
}

/**
 * Setup queue-specific event listeners
 */
function setupQueueEventListeners(): void {
  if (!elements) return;

  // Clear completed button
  elements.clearCompletedQueue.addEventListener('click', clearCompletedQueue);

  // Clear all button
  elements.clearAllQueue.addEventListener('click', clearAllQueue);

  // Auto-save queue config on change
  const queueInputs: HTMLElement[] = [
    elements.queueAutoPlayNext,
    elements.queueMaxItems,
    elements.queueSaveProgress,
  ];

  queueInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (queueSaveTimeout) {
        clearTimeout(queueSaveTimeout);
      }
      queueSaveTimeout = setTimeout(saveQueueConfig, 500);
    });
  });
}

/**
 * Save queue configuration to storage
 */
async function saveQueueConfig(): Promise<void> {
  if (!elements) return;

  try {
    const config: QueueSettings = {
      autoPlayNext: elements.queueAutoPlayNext.checked,
      autoArchiveCompleted: queueDefaults.autoArchiveCompleted,
      archiveAfterDays: queueDefaults.archiveAfterDays,
      maxQueueSize: Number.parseInt(elements.queueMaxItems.value, 10),
    };

    await browser.storage.local.set({ 'queue:settings': config });
    showSaveStatus('Settings saved!');
  } catch (error) {
    log.error('Error saving queue config', { error });
    showSaveStatus('Error saving settings', true);
  }
}

/**
 * Clear completed queue items
 */
async function clearCompletedQueue(): Promise<void> {
  if (!elements) return;

  showQueueStatus('Clearing completed...', 'loading');

  try {
    const response = await browser.runtime.sendMessage({
      type: 'queue.clear',
      filter: 'completed',
    });

    if (response && response.success) {
      showQueueStatus(`Cleared ${response.removedCount || 0} items`, 'success');
    } else {
      showQueueStatus(response?.error || 'Failed to clear', 'error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showQueueStatus(`Error: ${errorMessage}`, 'error');
  }
}

/**
 * Clear all queue items
 */
async function clearAllQueue(): Promise<void> {
  if (!elements) return;

  const confirmed = await confirmDialog({
    title: 'Clear reading queue',
    message:
      'Are you sure you want to clear all items from the reading queue? This cannot be undone.',
    confirmLabel: 'Clear all',
    destructive: true,
  });
  if (!confirmed) {
    return;
  }

  showQueueStatus('Clearing all...', 'loading');

  try {
    const response = await browser.runtime.sendMessage({
      type: 'queue.clear',
      filter: 'all',
    });

    if (response && response.success) {
      showQueueStatus(`Cleared ${response.removedCount || 0} items`, 'success');
    } else {
      showQueueStatus(response?.error || 'Failed to clear', 'error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showQueueStatus(`Error: ${errorMessage}`, 'error');
  }
}

/**
 * Show queue status message
 */
function showQueueStatus(message: string, type: 'success' | 'error' | 'loading'): void {
  if (!elements) return;

  elements.queueStatus.textContent = message;
  elements.queueStatus.className = `queue-status queue-status--${type}`;

  // Auto-hide success/error messages
  if (type !== 'loading') {
    setTimeout(() => {
      if (elements) {
        elements.queueStatus.textContent = '';
        elements.queueStatus.className = 'queue-status';
      }
    }, 3000);
  }
}

// ========================================
// RESET FUNCTIONALITY (027-settings-ux-overhaul T064-T068)
// ========================================

/**
 * Section display names for confirmation dialogs
 */
const SECTION_DISPLAY_NAMES: Record<string, string> = {
  'quick-settings': 'Quick Settings',
  appearance: 'Appearance',
  'reading-queue': 'Reading Queue',
  developer: 'Developer Settings',
};

/**
 * Setup reset button event listeners
 * T065: Implement reset button click handlers
 */
function setupResetButtons(): void {
  document.querySelectorAll('.section-reset-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      const section = button.dataset.section;
      if (!section) return;

      await handleSectionReset(section);
    });
  });
}

/**
 * Handle section reset with confirmation modal
 * T065: Implement reset button click handlers
 * T066: Show confirmation modal before reset
 * T068: Show toast on successful reset
 */
async function handleSectionReset(section: string): Promise<void> {
  const sectionName = SECTION_DISPLAY_NAMES[section] || section;

  // T066: Show confirmation modal before reset
  const confirmed = await showConfirmModal({
    title: 'Reset Settings',
    message: `Are you sure you want to reset ${sectionName} to defaults? This action cannot be undone.`,
    confirmText: 'Reset',
    cancelText: 'Cancel',
    confirmVariant: 'danger',
    onConfirm: async () => {
      // Send reset message to background
      const response = await browser.runtime.sendMessage({
        type: 'settings.resetSection',
        section,
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Reset failed');
      }
    },
  });

  if (confirmed) {
    // T068: Show toast on successful reset
    toast.success(`${sectionName} reset to defaults`);

    // Reload the settings to reflect changes
    await reloadSectionSettings(section);
  }
}

/**
 * Reload settings for a specific section after reset
 */
async function reloadSectionSettings(section: string): Promise<void> {
  switch (section) {
    case 'quick-settings':
      await loadQuickSettings();
      break;
    case 'appearance':
      await loadSettings();
      await loadThemePreference();
      break;
    case 'reading-queue':
      await loadQueueConfig();
      break;
    case 'developer':
      await loadLoggingConfig();
      break;
    case 'cache':
      await loadCacheStats();
      break;
  }
}

// ========================================
// TELEMETRY (043-usage-observability-loki T018)
// ========================================

/**
 * Initialize usage tracker for settings page context.
 * Loads config from storage and tracks settings.opened event.
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
      log.info('[Settings] Telemetry disabled by user');
      return;
    }

    // Only initialize if gateway is configured (seeded by onInstalled handler)
    const gatewayUrl = stored.telemetryGatewayUrl as string | undefined;
    const gatewayToken = stored.telemetryGatewayToken as string | undefined;

    if (!gatewayUrl || !gatewayToken) {
      return;
    }

    await usageTracker.initialize({
      gatewayUrl,
      gatewayToken,
      entrypoint: 'options',
      debugMode: process.env.NODE_ENV !== 'production',
    });

    // Track settings page opened
    usageTracker.track('settings.opened', {});

    // Track settings page closed on unload
    window.addEventListener('beforeunload', () => {
      usageTracker.track('settings.closed', {});
      // Best-effort flush
      usageTracker.destroy();
    });

    log.info('[Settings] Telemetry initialized');
  } catch (error) {
    log.warn('[Settings] Telemetry init failed', { error });
  }
}

/**
 * Track setting change events with debouncing
 */
const trackSettingDebounce = new Map<string, number>();
const SETTING_DEBOUNCE_MS = 300;

function trackSettingChange(eventType: string, data?: Record<string, unknown>): void {
  const now = Date.now();
  const lastTrack = trackSettingDebounce.get(eventType) || 0;

  if (now - lastTrack < SETTING_DEBOUNCE_MS) {
    return; // Skip duplicate rapid changes
  }

  trackSettingDebounce.set(eventType, now);
  usageTracker.track(eventType, data);
}

/**
 * Load telemetry configuration from storage
 * T018: Telemetry opt-out toggle
 */
async function loadTelemetryConfig(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get('telemetryEnabled');

    // Default to true (opt-in by default)
    const enabled = result.telemetryEnabled !== false;
    elements.telemetryEnabled.checked = enabled;
  } catch (error) {
    log.error('Error loading telemetry config', { error });
    // Default to enabled on error
    elements.telemetryEnabled.checked = true;
  }
}

/**
 * Setup telemetry-specific event listeners
 * T018: Telemetry opt-out toggle
 */
function setupTelemetryEventListeners(): void {
  if (!elements) return;

  elements.telemetryEnabled.addEventListener('change', async () => {
    if (!elements) return;

    const enabled = elements.telemetryEnabled.checked;
    await browser.storage.local.set({ telemetryEnabled: enabled });

    // Track the change (if enabling, track immediately; if disabling, best-effort)
    if (enabled) {
      usageTracker.track('settings.telemetry_enabled', {});
      toast.success('Usage telemetry enabled');
    } else {
      usageTracker.track('settings.telemetry_disabled', {});
      toast.success('Usage telemetry disabled');
    }
  });
}

// ========================================
// CACHE SECTION (028-smart-audio-cache T063-T064)
// ========================================

interface CacheStats {
  entries: number;
  totalSize: number;
  maxSize: number;
  sizePercentage: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  oldestEntryAge?: number;
  newestEntryAge?: number;
}

/**
 * Load and display cache statistics
 */
async function loadCacheStats(): Promise<void> {
  const entriesEl = document.getElementById('cacheEntries');
  const sizeEl = document.getElementById('cacheSizeDisplay');
  const hitRateEl = document.getElementById('cacheHitRate');
  const savingsEl = document.getElementById('cacheSavings');
  const usageFillEl = document.getElementById('cacheUsageFill');
  const usageLabelEl = document.getElementById('cacheUsageLabel');

  if (!entriesEl || !sizeEl || !hitRateEl || !savingsEl || !usageFillEl || !usageLabelEl) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({
      type: 'cache.getStats',
    });

    if (response) {
      const stats = response as CacheStats;

      // Update stats display
      entriesEl.textContent = String(stats.entries);

      // Format size in MB
      const sizeMB = (stats.totalSize / (1024 * 1024)).toFixed(1);
      const maxSizeMB = (stats.maxSize / (1024 * 1024)).toFixed(0);
      sizeEl.textContent = `${sizeMB} / ${maxSizeMB} MB`;

      // Hit rate percentage
      hitRateEl.textContent = `${Math.round(stats.hitRate * 100)}%`;

      // Estimated savings (rough estimate based on hit count * avg cost)
      // Using $0.015 per 1000 chars as average TTS cost
      const estimatedSavings = (stats.hitCount * 0.05).toFixed(2);
      savingsEl.textContent = `~$${estimatedSavings}`;

      // Update usage bar
      const usagePercent = Math.min(100, stats.sizePercentage);
      usageFillEl.style.width = `${usagePercent}%`;
      usageLabelEl.textContent = `${Math.round(usagePercent)}% used`;

      // Add warning/danger classes based on usage
      usageFillEl.classList.remove('cache-usage__fill--warning', 'cache-usage__fill--danger');
      if (usagePercent >= 90) {
        usageFillEl.classList.add('cache-usage__fill--danger');
      } else if (usagePercent >= 70) {
        usageFillEl.classList.add('cache-usage__fill--warning');
      }
    }
  } catch (error) {
    log.error('[Options] Failed to load cache stats', { error });
    entriesEl.textContent = '--';
    sizeEl.textContent = '-- / -- MB';
    hitRateEl.textContent = '--%';
    savingsEl.textContent = '$0.00';
  }
}

/**
 * Clear the audio cache
 */
async function clearCache(): Promise<void> {
  const statusEl = document.getElementById('cacheStatus');
  const clearBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement | null;

  if (!statusEl || !clearBtn) return;

  // Show confirmation modal
  const confirmed = await showConfirmModal({
    title: 'Clear Audio Cache',
    message:
      'This will delete all cached audio. You will need to regenerate audio for pages you revisit. This cannot be undone.',
    confirmText: 'Clear Cache',
    cancelText: 'Cancel',
    confirmVariant: 'danger',
    onConfirm: async () => {
      const response = await browser.runtime.sendMessage({
        type: 'cache.clear',
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to clear cache');
      }
    },
  });

  if (confirmed) {
    toast.success('Audio cache cleared');
    await loadCacheStats();
  }
}

/**
 * Setup cache section event listeners
 */
function setupCacheEventListeners(): void {
  const clearBtn = document.getElementById('clearCacheBtn');
  const refreshBtn = document.getElementById('refreshCacheStatsBtn');

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      void clearCache();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      void loadCacheStats();
    });
  }
}

// ========================================
// HIGHLIGHTS EXPORT
// ========================================

/**
 * Write every stored highlight to a file.
 */
async function exportHighlights(): Promise<void> {
  const statusEl = document.getElementById('highlightsExportStatus');
  const exportBtn = document.getElementById('exportHighlightsBtn') as HTMLButtonElement | null;

  if (!statusEl || !exportBtn) return;

  // The disabled button is the lock, not just its appearance: without this,
  // a second export arriving by any route other than a click — a retained
  // listener, a keyboard activation — would run to its own `finally` and
  // re-enable the button while the first write is still in flight.
  if (exportBtn.disabled) return;

  exportBtn.disabled = true;
  statusEl.className = 'cache-status cache-status--loading';
  statusEl.textContent = 'Exporting…';

  try {
    const response = await browser.runtime.sendMessage({ type: 'highlight.export' });

    // A read failure must not reach the download call: overwriting a good
    // export with an empty file loses the reader's highlights on the one path
    // that was meant to preserve them.
    if (!response?.success || typeof response.json !== 'string') {
      throw new Error(response?.error || 'Could not read stored highlights');
    }

    // Awaited, so the success below is reported about a file that exists
    // rather than about a download the browser merely agreed to start.
    await downloadJson(HIGHLIGHT_EXPORT_FILENAME, response.json);

    const count = (response.count as number | undefined) ?? 0;
    statusEl.className = 'cache-status cache-status--success';
    statusEl.textContent = `${count} highlight${count === 1 ? '' : 's'} → ${HIGHLIGHT_EXPORT_FILENAME}`;
    toast.success(`Exported ${count} highlight${count === 1 ? '' : 's'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    log.error('[Options] Highlight export failed', { error });
    statusEl.className = 'cache-status cache-status--error';
    statusEl.textContent = message;
    toast.error(`Export failed: ${message}`);
  } finally {
    exportBtn.disabled = false;
  }
}

/**
 * Setup highlights section event listeners
 */
function setupHighlightsEventListeners(): void {
  const exportBtn = document.getElementById('exportHighlightsBtn');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      void exportHighlights();
    });
  }
}

// ========================================
// SERVER STATUS INDICATOR
// ========================================

const SERVER_HEALTH_TIMEOUT_MS = 5000;

/**
 * Check server health and update the status indicator
 */
async function checkServerStatus(): Promise<void> {
  if (!elements) return;

  const { serverDetailUrl, serverDetailVersion, serverDetailUptime, serverDetailError } = elements;

  // Read serverUrl from storage
  const result = await browser.storage.local.get('serverUrl');
  const serverUrl = result.serverUrl as string | undefined;

  // Clear detail rows
  serverDetailUrl.textContent = '';
  serverDetailVersion.textContent = '';
  serverDetailUptime.textContent = '';
  serverDetailError.textContent = '';

  if (!serverUrl) {
    setServerStatusState('not-configured', 'Not configured');
    return;
  }

  serverDetailUrl.textContent = `URL: ${serverUrl}`;
  setServerStatusState('checking', 'Checking...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SERVER_HEALTH_TIMEOUT_MS);

    const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      setServerStatusState('disconnected', 'Disconnected');
      serverDetailError.textContent = `Error: HTTP ${response.status}`;
      return;
    }

    const data = await response.json();

    setServerStatusState('connected', 'Connected');
    if (data.version) {
      serverDetailVersion.textContent = `Version: ${data.version}`;
    }
    if (data.uptime != null) {
      serverDetailUptime.textContent = `Uptime: ${formatUptime(data.uptime)}`;
    }
  } catch (error) {
    setServerStatusState('disconnected', 'Disconnected');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    serverDetailError.textContent = `Error: ${msg.includes('abort') ? 'Timeout' : msg}`;
  }
}

/**
 * Set the visual state of the server status indicator
 */
function setServerStatusState(
  state: 'connected' | 'disconnected' | 'checking' | 'not-configured',
  label: string,
): void {
  if (!elements) return;

  elements.serverStatusDot.className = `server-status__dot server-status__dot--${state}`;
  elements.serverStatusText.textContent = label;
}

/**
 * Format uptime seconds into a human-readable string
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Setup server status refresh button listener
 */
function setupServerStatusListeners(): void {
  if (!elements) return;

  elements.serverStatusRefresh.addEventListener('click', async () => {
    if (!elements) return;

    // Add spin animation
    elements.serverStatusRefresh.classList.add('server-status__refresh--spinning');

    await checkServerStatus();

    // Remove spin after animation completes
    setTimeout(() => {
      elements?.serverStatusRefresh.classList.remove('server-status__refresh--spinning');
    }, 800);
  });
}
