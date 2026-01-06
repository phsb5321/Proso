// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Options Page Controller
 * TypeScript conversion from options/options.js
 */

import {
  settingsDefaults,
  loggingDefaults,
  uiDefaults,
  queueDefaults,
  type VoxPageSettings,
  type ApiKeys,
  type UISettings,
  type LoggingConfig,
  type LogEntry,
  type LogViewerResponse,
  type EndpointValidation,
  type QueueSettings
} from '../utils/config';

import { toast } from './components/toast';
import { showConfirmModal } from './components/modal';
import { testApiKey, saveApiKey, API_KEY_STORAGE_KEYS } from '../../utils/options/api-key-tester';
import { createScrollSpy, type ScrollSpyInstance } from '../../utils/options/scroll-spy';
import { setupSidebarKeyboardNav } from './components/sidebar';
import { getThemeManager, type ThemeMode } from '../../utils/options/theme-manager';

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
  openaiKey: HTMLInputElement;
  anthropicKey: HTMLInputElement;
  elevenlabsKey: HTMLInputElement;
  testElevenlabsKey: HTMLButtonElement;
  elevenlabsKeyStatus: HTMLElement;
  cartesiaKey: HTMLInputElement;
  groqKey: HTMLInputElement;

  // Settings inputs (legacy, kept for backwards compatibility)
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

  // Queue settings elements (T079)
  queueAutoPlayNext: HTMLInputElement;
  queueMaxItems: HTMLSelectElement;
  queueSaveProgress: HTMLInputElement;
  clearCompletedQueue: HTMLButtonElement;
  clearAllQueue: HTMLButtonElement;
  queueStatus: HTMLElement;
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
    openaiKey: getElement<HTMLInputElement>('openaiKey'),
    anthropicKey: getElement<HTMLInputElement>('anthropicKey'),
    elevenlabsKey: getElement<HTMLInputElement>('elevenlabsKey'),
    testElevenlabsKey: getElement<HTMLButtonElement>('testElevenlabsKey'),
    elevenlabsKeyStatus: getElement<HTMLElement>('elevenlabsKeyStatus'),
    cartesiaKey: getElement<HTMLInputElement>('cartesiaKey'),
    groqKey: getElement<HTMLInputElement>('groqKey'),

    // Legacy settings inputs (kept for backwards compatibility)
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

    // Queue settings elements (T079)
    queueAutoPlayNext: getElement<HTMLInputElement>('queueAutoPlayNext'),
    queueMaxItems: getElement<HTMLSelectElement>('queueMaxItems'),
    queueSaveProgress: getElement<HTMLInputElement>('queueSaveProgress'),
    clearCompletedQueue: getElement<HTMLButtonElement>('clearCompletedQueue'),
    clearAllQueue: getElement<HTMLButtonElement>('clearAllQueue'),
    queueStatus: getElement<HTMLElement>('queueStatus'),
  };
}

/**
 * Initialize the options page
 */
export async function initOptionsPage(): Promise<void> {
  elements = getElements();

  await loadSettings();
  await loadQuickSettings();
  await loadLoggingConfig();
  await loadQueueConfig();
  await loadCacheStats();
  await loadThemePreference();

  setupQuickSettingsEventListeners();
  setupEventListeners();
  setupProviderCardEventListeners();
  setupLoggingEventListeners();
  setupQueueEventListeners();
  setupCacheEventListeners();
  setupAccordions();
  setupStorageChangeListener();
  setupSidebarNavigation();
  setupThemeEventListener();
  setupResetButtons();
}

// ========================================
// QUICK SETTINGS (027-settings-ux-overhaul T020-T024)
// ========================================

/**
 * Voice configurations by provider
 * T021: Voice options filtered by provider
 */
const PROVIDER_VOICES: Record<string, Array<{ value: string; label: string }>> = {
  browser: [], // Populated dynamically from browser's speech synthesis
  groq: [
    { value: 'default', label: 'Default' },
  ],
  openai: [
    { value: 'alloy', label: 'Alloy' },
    { value: 'echo', label: 'Echo' },
    { value: 'fable', label: 'Fable' },
    { value: 'onyx', label: 'Onyx' },
    { value: 'nova', label: 'Nova' },
    { value: 'shimmer', label: 'Shimmer' },
  ],
  elevenlabs: [
    { value: 'default', label: 'Default Voice' },
    // Additional voices fetched from API when key is configured
  ],
  cartesia: [
    { value: 'default', label: 'Default Voice' },
  ],
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
    console.error('Error loading Quick Settings:', error);
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
  let voices = PROVIDER_VOICES[provider] || [];

  // For browser TTS, get available system voices
  if (provider === 'browser' && 'speechSynthesis' in window) {
    const getVoices = (): SpeechSynthesisVoice[] => {
      return window.speechSynthesis.getVoices();
    };

    let systemVoices = getVoices();

    // Voices may not be loaded yet
    if (systemVoices.length === 0) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.onvoiceschanged = () => {
          systemVoices = getVoices();
          resolve();
        };
        // Timeout fallback
        setTimeout(resolve, 1000);
      });
    }

    voices = systemVoices.map((v) => ({
      value: v.name,
      label: `${v.name} (${v.lang})`,
    }));
  }

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

    const value = parseFloat(elements.quickSpeed.value);
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

      const speed = parseFloat(elements.quickSpeed.value);
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

    // Also update legacy elements if they exist
    if (elements) {
      switch (key) {
        case 'provider':
          if (elements.defaultProvider) {
            elements.defaultProvider.value = value as string;
          }
          break;
        case 'speed':
          if (elements.defaultSpeed) {
            elements.defaultSpeed.value = String(value);
          }
          if (elements.speedValue) {
            elements.speedValue.textContent = `${(value as number).toFixed(1)}x`;
          }
          break;
      }
    }
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
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
      const showCostEstimateEl = document.getElementById('showCostEstimate') as HTMLInputElement | null;
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
  document.querySelectorAll('.sidebar-link').forEach(link => {
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
      'openaiApiKey',
      'anthropic:apiKey',
      'elevenlabsApiKey',
      'cartesiaApiKey',
      'groqApiKey',
      'provider',
      'speed',
      'mode',
      'highlightEnabled',
      'autoScroll',
      'showCostEstimate'
    ]);

    // API keys (no defaults, empty if not set)
    elements.openaiKey.value = (result.openaiApiKey as string | undefined) || '';
    elements.anthropicKey.value = (result['anthropic:apiKey'] as string | undefined) || '';
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

    // Cost estimate toggle (028-smart-audio-cache T073)
    const showCostEstimateEl = document.getElementById('showCostEstimate') as HTMLInputElement | null;
    if (showCostEstimateEl) {
      showCostEstimateEl.checked = (result.showCostEstimate as boolean | undefined) !== undefined
        ? (result.showCostEstimate as boolean)
        : true; // Default to true
    }
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
    elements.anthropicKey,
    elements.elevenlabsKey,
    elements.cartesiaKey,
    elements.groqKey,
    elements.defaultProvider,
    elements.defaultSpeed,
    elements.defaultMode,
  ];

  autoSaveInputs.forEach(input => {
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
 * Show API key test status (legacy - for elevenlabs only)
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

// ========================================
// PROVIDER CARD HANDLERS (027-settings-ux-overhaul T033-T035)
// ========================================

/**
 * Storage key mapping for each provider's API key
 */
const PROVIDER_INPUT_IDS: Record<string, string> = {
  openai: 'openaiKey',
  elevenlabs: 'elevenlabsKey',
  groq: 'groqKey',
  cartesia: 'cartesiaKey',
  anthropic: 'anthropicKey',
};

/**
 * Setup provider card event listeners
 * T033: Test button with loading state
 * T034: Display test results with success/error icons
 * T035: Explicit Save button per provider card
 */
function setupProviderCardEventListeners(): void {
  // Test buttons (T033)
  document.querySelectorAll('.provider-card__test-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      const provider = button.dataset.provider;
      if (!provider) return;

      await handleProviderTest(provider, button);
    });
  });

  // Save buttons (T035)
  document.querySelectorAll('.provider-card__save-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      const provider = button.dataset.provider;
      if (!provider) return;

      await handleProviderSave(provider, button);
    });
  });

  // Auto-trim whitespace on paste for API key inputs (T037)
  document.querySelectorAll('.provider-card__input').forEach(input => {
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
  const statusEl = document.querySelector(`.provider-card__status[data-provider="${provider}"]`) as HTMLElement | null;

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

  try {
    const result = await testApiKey(provider, apiKey);

    if (result.success) {
      // T034: Display success with icon
      const latencyInfo = result.latencyMs ? ` (${result.latencyMs}ms)` : '';
      showProviderCardStatus(statusEl, `✓ Valid${latencyInfo}`, 'success');
      toast.success(`${capitalizeProvider(provider)} API key is valid`);
    } else {
      // T034: Display error with icon
      showProviderCardStatus(statusEl, `✗ ${result.message}`, 'error');
      toast.error(result.message);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Test failed';
    showProviderCardStatus(statusEl, `✗ ${errorMessage}`, 'error');
    toast.error(errorMessage);
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
  const statusEl = document.querySelector(`.provider-card__status[data-provider="${provider}"]`) as HTMLElement | null;

  // Set loading state
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    await saveApiKey(provider, apiKey);

    showProviderCardStatus(statusEl, '✓ Saved', 'success');
    toast.success(`${capitalizeProvider(provider)} API key saved`);

    // Update legacy elements if they exist
    if (elements) {
      const legacyInput = elements[inputId as keyof OptionsElements] as HTMLInputElement | undefined;
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
  type: 'success' | 'error' | 'loading'
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
    openai: 'OpenAI',
    elevenlabs: 'ElevenLabs',
    groq: 'Groq',
    cartesia: 'Cartesia',
    anthropic: 'Anthropic',
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
      openaiApiKey: elements.openaiKey.value.trim(),
      'anthropic:apiKey': elements.anthropicKey.value.trim(),
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
    const config: QueueSettings = { ...queueDefaults, ...(result['queue:settings'] as Partial<QueueSettings> || {}) };

    elements.queueAutoPlayNext.checked = config.autoPlayNext;
    elements.queueMaxItems.value = String(config.maxQueueSize);
    // Note: saveProgress is derived from autoPlayNext for now
    elements.queueSaveProgress.checked = config.autoPlayNext;
  } catch (error) {
    console.error('Error loading queue config:', error);
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

  queueInputs.forEach(input => {
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
      maxQueueSize: parseInt(elements.queueMaxItems.value, 10),
    };

    await browser.storage.local.set({ 'queue:settings': config });
    showSaveStatus('Settings saved!');
  } catch (error) {
    console.error('Error saving queue config:', error);
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

  if (!confirm('Are you sure you want to clear all items from the reading queue? This cannot be undone.')) {
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
  'appearance': 'Appearance',
  'reading-queue': 'Reading Queue',
  'developer': 'Developer Settings',
};

/**
 * Setup reset button event listeners
 * T065: Implement reset button click handlers
 */
function setupResetButtons(): void {
  document.querySelectorAll('.section-reset-btn').forEach(btn => {
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
    console.error('[Options] Failed to load cache stats:', error);
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
    message: 'This will delete all cached audio. You will need to regenerate audio for pages you revisit. This cannot be undone.',
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
