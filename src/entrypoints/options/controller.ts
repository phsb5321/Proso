// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Options Page Controller
 * TypeScript conversion from options/options.js
 */

import { browser } from 'wxt/browser';
import { defaults as settingsDefaults, queueDefaults, languageDefaults } from '../../utils/config';
import type { QueueSettings } from '../../utils/config/schema';

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
type LogEntry = {
  timestamp: number;
  date: string;
  level: string;
  message: string;
  component: string;
  metadata?: Record<string, unknown>;
};
type LogViewerResponse = {
  logs: LogEntry[];
  total: number;
  status: {
    bufferBytes: number;
    [key: string]: unknown;
  };
};
type EndpointValidation = { isValid: boolean; error?: string };

import { usageTracker } from '../../utils/telemetry/usage';
import { toast } from './components/toast';
import { showConfirmModal } from './components/modal';
import { testApiKey, saveApiKey } from '../../utils/options/api-key-tester';
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
  // 050-groq-tts-provider: groqKey is primary TTS
  groqKey: HTMLInputElement;
  elevenlabsKey: HTMLInputElement;
  elevenlabsKeyStatus: HTMLElement;

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

  // Language settings elements (048-multilingual-tts-pillar US5)
  languageAutoDetect: HTMLInputElement;
  defaultLanguage: HTMLSelectElement;
  showLanguageBadge: HTMLInputElement;
  voicePreferencesGrid: HTMLElement;
  addVoicePreferenceBtn: HTMLButtonElement;

  // Groq model/voice settings (050-groq-tts-provider T033-T034)
  groqModel: HTMLSelectElement;
  groqVoice: HTMLSelectElement;
  groqModelGroup: HTMLElement;
  groqVoiceGroup: HTMLElement;
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
    // 050-groq-tts-provider: groqKey is primary TTS
    groqKey: getElement<HTMLInputElement>('groqKey'),
    elevenlabsKey: getElement<HTMLInputElement>('elevenlabsKey'),
    elevenlabsKeyStatus: getElement<HTMLElement>('elevenlabsKeyStatus'),

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

    // Language settings elements (048-multilingual-tts-pillar US5)
    languageAutoDetect: getElement<HTMLInputElement>('languageAutoDetect'),
    defaultLanguage: getElement<HTMLSelectElement>('defaultLanguage'),
    showLanguageBadge: getElement<HTMLInputElement>('showLanguageBadge'),
    voicePreferencesGrid: getElement<HTMLElement>('voicePreferencesGrid'),
    addVoicePreferenceBtn: getElement<HTMLButtonElement>('addVoicePreferenceBtn'),

    // Groq model/voice settings (050-groq-tts-provider T033-T034)
    groqModel: getElement<HTMLSelectElement>('groqModel'),
    groqVoice: getElement<HTMLSelectElement>('groqVoice'),
    groqModelGroup: getElement<HTMLElement>('groqModelGroup'),
    groqVoiceGroup: getElement<HTMLElement>('groqVoiceGroup'),
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
  await loadLanguageSettings();

  setupQuickSettingsEventListeners();
  setupEventListeners();
  setupProviderCardEventListeners();
  setupLoggingEventListeners();
  setupQueueEventListeners();
  setupCacheEventListeners();
  setupTelemetryEventListeners();
  setupLanguageEventListeners();
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
 * 050-groq-tts-provider: Added Groq voices, split by model
 */
const PROVIDER_VOICES: Record<string, Array<{ value: string; label: string }>> = {
  groq: [
    // Default to PlayAI voices (most common model)
    { value: 'Fritz-PlayAI', label: 'Fritz (Male)' },
    { value: 'Troy-PlayAI', label: 'Troy (Male)' },
    { value: 'Hannah-PlayAI', label: 'Hannah (Female)' },
    { value: 'Austin-PlayAI', label: 'Austin (Male)' },
    { value: 'Arista-PlayAI', label: 'Arista (Female)' },
    { value: 'Atlas-PlayAI', label: 'Atlas (Male)' },
    { value: 'Basil-PlayAI', label: 'Basil (Male)' },
    { value: 'Briggs-PlayAI', label: 'Briggs (Male)' },
    { value: 'Deedee-PlayAI', label: 'Deedee (Female)' },
    { value: 'Duke-PlayAI', label: 'Duke (Male)' },
    { value: 'Harper-PlayAI', label: 'Harper (Female)' },
    { value: 'Haven-PlayAI', label: 'Haven (Female)' },
    { value: 'Hera-PlayAI', label: 'Hera (Female)' },
    { value: 'Luna-PlayAI', label: 'Luna (Female)' },
    { value: 'Maisie-PlayAI', label: 'Maisie (Female)' },
    { value: 'Nia-PlayAI', label: 'Nia (Female)' },
    { value: 'Nolan-PlayAI', label: 'Nolan (Male)' },
    { value: 'Quinn-PlayAI', label: 'Quinn (Female)' },
    { value: 'Thunder-PlayAI', label: 'Thunder (Male)' },
    { value: 'Tyson-PlayAI', label: 'Tyson (Male)' },
  ],
  elevenlabs: [{ value: 'default', label: 'Default Voice' }],
};

/**
 * Groq model-specific voice configurations (050-groq-tts-provider T034)
 * Voices are filtered based on selected Groq model
 */
const GROQ_MODEL_VOICES: Record<string, Array<{ value: string; label: string }>> = {
  'playai-tts': [
    { value: 'Fritz-PlayAI', label: 'Fritz (Male)' },
    { value: 'Troy-PlayAI', label: 'Troy (Male)' },
    { value: 'Hannah-PlayAI', label: 'Hannah (Female)' },
    { value: 'Austin-PlayAI', label: 'Austin (Male)' },
    { value: 'Arista-PlayAI', label: 'Arista (Female)' },
    { value: 'Atlas-PlayAI', label: 'Atlas (Male)' },
    { value: 'Basil-PlayAI', label: 'Basil (Male)' },
    { value: 'Briggs-PlayAI', label: 'Briggs (Male)' },
    { value: 'Deedee-PlayAI', label: 'Deedee (Female)' },
    { value: 'Duke-PlayAI', label: 'Duke (Male)' },
    { value: 'Harper-PlayAI', label: 'Harper (Female)' },
    { value: 'Haven-PlayAI', label: 'Haven (Female)' },
    { value: 'Hera-PlayAI', label: 'Hera (Female)' },
    { value: 'Luna-PlayAI', label: 'Luna (Female)' },
    { value: 'Maisie-PlayAI', label: 'Maisie (Female)' },
    { value: 'Nia-PlayAI', label: 'Nia (Female)' },
    { value: 'Nolan-PlayAI', label: 'Nolan (Male)' },
    { value: 'Quinn-PlayAI', label: 'Quinn (Female)' },
    { value: 'Thunder-PlayAI', label: 'Thunder (Male)' },
    { value: 'Tyson-PlayAI', label: 'Tyson (Male)' },
  ],
  'distil-whisper-large-v3-en': [
    // Orpheus voices
    { value: 'tara', label: 'Tara (Female)' },
    { value: 'leah', label: 'Leah (Female)' },
    { value: 'jess', label: 'Jess (Female)' },
    { value: 'leo', label: 'Leo (Male)' },
    { value: 'dan', label: 'Dan (Male)' },
    { value: 'mia', label: 'Mia (Female)' },
    { value: 'zac', label: 'Zac (Male)' },
    { value: 'zoe', label: 'Zoe (Female)' },
  ],
};

/**
 * Load Quick Settings from storage
 * T020: Provider dropdown, T021: Voice dropdown, T022: Speed slider
 * 050-groq-tts-provider: Added groqModel and groqVoice loading
 */
async function loadQuickSettings(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get([
      'provider',
      'voice',
      'speed',
      'groqModel',
      'groqVoice',
    ]);

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

    // 050-groq-tts-provider: Load Groq model/voice settings
    const groqModel = (result.groqModel as string) || settingsDefaults.groqModel;
    elements.groqModel.value = groqModel;

    // Update Groq voice dropdown based on model
    await updateGroqVoiceDropdown(groqModel);
    const groqVoice = (result.groqVoice as string) || '';
    if (groqVoice) {
      elements.groqVoice.value = groqVoice;
    }

    // Show/hide Groq model/voice fields based on provider (T039)
    updateGroqSettingsVisibility(provider);
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
 * Update Groq voice dropdown based on selected model (050-groq-tts-provider T035)
 * Filters voice options based on whether PlayAI or Orpheus model is selected
 */
async function updateGroqVoiceDropdown(model: string): Promise<void> {
  if (!elements) return;

  const voiceSelect = elements.groqVoice;

  // Clear existing options using safe DOM method
  while (voiceSelect.firstChild) {
    voiceSelect.removeChild(voiceSelect.firstChild);
  }

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default Voice';
  voiceSelect.appendChild(defaultOption);

  // Get voices for the specific Groq model
  const voices = GROQ_MODEL_VOICES[model] || GROQ_MODEL_VOICES['playai-tts'];

  // Add voice options
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.value;
    option.textContent = voice.label;
    voiceSelect.appendChild(option);
  });
}

/**
 * Show/hide Groq model/voice settings based on provider (050-groq-tts-provider T039)
 * Only shows Groq-specific settings when Groq is selected as provider
 */
function updateGroqSettingsVisibility(provider: string): void {
  if (!elements) return;

  const isGroq = provider === 'groq';
  elements.groqModelGroup.style.display = isGroq ? 'block' : 'none';
  elements.groqVoiceGroup.style.display = isGroq ? 'block' : 'none';
}

/**
 * Setup Quick Settings event listeners
 * T020: Provider auto-save, T022-T023: Speed slider with debounce, T024: Toast notifications
 * 050-groq-tts-provider: Added Groq model/voice handlers
 */
function setupQuickSettingsEventListeners(): void {
  if (!elements) return;

  // T020: Provider dropdown with auto-save
  // T058: Handle provider change for incompatible voice preferences
  elements.quickProvider.addEventListener('change', async () => {
    if (!elements) return;

    const provider = elements.quickProvider.value;

    // Update voice dropdown for new provider
    await updateVoiceDropdown(provider);

    // Auto-save provider
    await saveQuickSetting('provider', provider);

    // T058: Check and reset incompatible voice preferences
    await resetIncompatibleVoicePreferences(provider);

    // Reload language settings to reflect changes
    await loadLanguageSettings();

    // 050-groq-tts-provider (T039): Update Groq settings visibility
    updateGroqSettingsVisibility(provider);

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

  // 050-groq-tts-provider (T035): Groq model change handler
  elements.groqModel.addEventListener('change', async () => {
    if (!elements) return;

    const model = elements.groqModel.value;

    // Update Groq voice dropdown for new model
    await updateGroqVoiceDropdown(model);

    // T036: Reset voice to null when model changes (avoid incompatible voice)
    elements.groqVoice.value = '';
    await browser.storage.local.set({ groqVoice: null });

    // Save model
    await browser.storage.local.set({ groqModel: model });

    toast.success(`Groq model updated to ${model === 'playai-tts' ? 'PlayAI Dialog' : 'Orpheus'}`);
  });

  // 050-groq-tts-provider: Groq voice change handler
  elements.groqVoice.addEventListener('change', async () => {
    if (!elements) return;

    const voice = elements.groqVoice.value;
    await browser.storage.local.set({ groqVoice: voice || null });

    toast.success(voice ? 'Groq voice updated' : 'Using default Groq voice');
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
  const accordionHeaders = document.querySelectorAll('.voxpage-accordion__header');

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
    // 050-groq-tts-provider: groqApiKey instead of anthropic:apiKey
    const result = await browser.storage.local.get([
      'groqApiKey',
      'elevenlabsApiKey',
      'provider',
      'speed',
      'mode',
      'highlightEnabled',
      'autoScroll',
      'showCostEstimate',
    ]);

    // API keys (no defaults, empty if not set)
    // 050-groq-tts-provider: groqKey is primary TTS
    elements.groqKey.value = (result.groqApiKey as string | undefined) || '';
    elements.elevenlabsKey.value = (result.elevenlabsApiKey as string | undefined) || '';

    // Settings with defaults
    elements.defaultProvider.value =
      (result.provider as string | undefined) || settingsDefaults.provider;
    elements.defaultSpeed.value = String(
      (result.speed as number | undefined) || settingsDefaults.speed,
    );
    elements.speedValue.textContent = `${(result.speed as number | undefined) || settingsDefaults.speed}x`;
    elements.defaultMode.value = (result.mode as string | undefined) || settingsDefaults.mode;

    console.log(
      'VoxPage options: Settings loaded, mode:',
      (result.mode as string | undefined) || settingsDefaults.mode,
    );

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
    console.error('Error loading settings:', error);
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

  // Speed slider
  elements.defaultSpeed.addEventListener('input', (e) => {
    if (!elements) return;
    const value = Number.parseFloat((e.target as HTMLInputElement).value);
    elements.speedValue.textContent = `${value.toFixed(1)}x`;
  });

  // NOTE: Legacy testElevenLabsApiKey handler removed.
  // ElevenLabs test button now uses the modern provider card handler
  // (setupProviderCardEventListeners → handleProviderTest) which is
  // attached via .provider-card__test-btn[data-provider="elevenlabs"]

  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);

  // Auto-save on input change (with debounce)
  // 050-groq-tts-provider: groqKey instead of anthropicKey
  const autoSaveInputs: HTMLElement[] = [
    elements.groqKey,
    elements.elevenlabsKey,
    elements.defaultProvider,
    elements.defaultSpeed,
    elements.defaultMode,
  ];

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
 * 050-groq-tts-provider: Added groq
 */
// 050-groq-tts-provider: Groq and ElevenLabs are the only TTS providers
const PROVIDER_INPUT_IDS: Record<string, string> = {
  groq: 'groqKey',
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

    console.log('[Controller] testApiKey returned:', JSON.stringify(result, null, 2));
    console.log('[Controller] result.success:', result.success);

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
 * 050-groq-tts-provider: Added groq
 */
function capitalizeProvider(provider: string): string {
  const names: Record<string, string> = {
    groq: 'Groq',
    elevenlabs: 'ElevenLabs',
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
    // 050-groq-tts-provider: Save groqApiKey (not anthropic:apiKey)
    await browser.storage.local.set({
      groqApiKey: elements.groqKey.value.trim(),
      elevenlabsApiKey: elements.elevenlabsKey.value.trim(),
      provider: elements.defaultProvider.value,
      speed: Number.parseFloat(elements.defaultSpeed.value),
      mode: elements.defaultMode.value,
      highlightEnabled: elements.highlightEnabled.checked,
      autoScroll: elements.autoScroll.checked,
    });

    // T018: Track settings saved event
    trackSettingChange('settings.saved', {
      provider: elements.defaultProvider.value,
      mode: elements.defaultMode.value,
      highlightEnabled: elements.highlightEnabled.checked,
      autoScroll: elements.autoScroll.checked,
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
    const result = await browser.storage.local.get('voxpage_logging_config');
    const config: LoggingConfig = {
      ...loggingDefaults,
      ...((result.voxpage_logging_config as Partial<LoggingConfig>) || {}),
    };

    // Only the toggle is visible - other settings use defaults
    elements.loggingEnabled.checked = config.enabled;
  } catch (error) {
    console.error('Error loading logging config:', error);
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
 * Update visibility of logging config section
 * NOTE: Config section is now hidden - using defaults
 */
function updateLoggingConfigVisibility(): void {
  // No-op: config section removed, using defaults
}

/**
 * Update visibility of auth fields based on selected auth type
 * NOTE: Auth fields are now hidden - using defaults
 */
function updateAuthFieldsVisibility(): void {
  // No-op: auth fields removed, using defaults
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

    await browser.storage.local.set({ voxpage_logging_config: config });
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
      return { isValid: false, error: 'Endpoint must use HTTPS' };
    }

    // Allow both direct Loki endpoints and VoxPage gateway
    const validPaths = ['/loki/api/v1/push', '/ingest', ''];
    const pathValid = validPaths.some((p) => parsed.pathname === p || parsed.pathname.endsWith(p));
    if (!pathValid && !url.includes('voxpage-logs')) {
      return { isValid: false, error: 'Invalid endpoint path' };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
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
  if (!validation.isValid) {
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

  if (
    !confirm(
      'Are you sure you want to clear all items from the reading queue? This cannot be undone.',
    )
  ) {
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
  language: 'Language',
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
    case 'language':
      await loadLanguageSettings();
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
      console.log('[Settings] Telemetry disabled by user');
      return;
    }

    // Only initialize if gateway is configured
    const gatewayUrl =
      (stored.telemetryGatewayUrl as string) || 'https://voxpage-logs.home301server.com.br/ingest';
    const gatewayToken =
      (stored.telemetryGatewayToken as string) || '5Q0LlZ+6fcJ0wAPsSXtJzaf2rfd64fN6vUx84wWlzwY=';

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

    console.log('[Settings] Telemetry initialized');
  } catch (error) {
    console.warn('[Settings] Telemetry init failed:', error);
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
    console.error('Error loading telemetry config:', error);
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
// LANGUAGE SETTINGS (048-multilingual-tts-pillar US5)
// ========================================

/**
 * Language display names for voice preference grid
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  tr: 'Turkish',
  ru: 'Russian',
  nl: 'Dutch',
  cs: 'Czech',
  ar: 'Arabic',
  zh: 'Chinese',
  hu: 'Hungarian',
  ko: 'Korean',
  ja: 'Japanese',
  hi: 'Hindi',
  sv: 'Swedish',
  id: 'Indonesian',
  uk: 'Ukrainian',
  el: 'Greek',
  fi: 'Finnish',
  ro: 'Romanian',
  da: 'Danish',
  bg: 'Bulgarian',
  ms: 'Malay',
  sk: 'Slovak',
  hr: 'Croatian',
  ta: 'Tamil',
  fil: 'Filipino',
};

/**
 * Load language settings from storage
 * T052: Load language settings section
 */
async function loadLanguageSettings(): Promise<void> {
  if (!elements) return;

  try {
    const result = await browser.storage.local.get([
      'languageAutoDetect',
      'languageDefault',
      'showLanguageBadge',
      'languagePreference',
      'provider',
    ]);

    // Auto-detect toggle
    const autoDetect = result.languageAutoDetect !== false; // Default true
    elements.languageAutoDetect.checked = autoDetect;

    // Default language dropdown
    const defaultLang = (result.languageDefault as string) || languageDefaults.languageDefault;
    elements.defaultLanguage.value = defaultLang;

    // Show/hide default language based on auto-detect
    updateDefaultLanguageVisibility(autoDetect);

    // Show language badge toggle
    const showBadge = result.showLanguageBadge !== false; // Default true
    elements.showLanguageBadge.checked = showBadge;

    // Load voice preferences grid
    const provider = (result.provider as string) || settingsDefaults.provider;
    const langPref = result.languagePreference as
      | { voicePreferences?: Record<string, string> }
      | undefined;
    const voicePreferences = langPref?.voicePreferences || {};
    await renderVoicePreferencesGrid(provider, voicePreferences);
  } catch (error) {
    console.error('Error loading language settings:', error);
  }
}

/**
 * Show/hide default language dropdown based on auto-detect toggle
 */
function updateDefaultLanguageVisibility(autoDetect: boolean): void {
  const defaultLanguageGroup = document.getElementById('defaultLanguageGroup');
  if (defaultLanguageGroup) {
    defaultLanguageGroup.style.display = autoDetect ? 'none' : 'block';
  }
}

/**
 * Render voice preferences grid
 * T053: Voice preference grid component
 */
async function renderVoicePreferencesGrid(
  provider: string,
  voicePreferences: Record<string, string>,
): Promise<void> {
  if (!elements) return;

  const grid = elements.voicePreferencesGrid;
  const addBtn = elements.addVoicePreferenceBtn;

  // Clear existing content using safe DOM methods
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  // Check if provider supports multiple voices
  const providerVoices = await getProviderVoices(provider);

  if (!providerVoices || providerVoices.length === 0) {
    // Show empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'voice-preferences-empty';
    const emptyText = document.createElement('p');
    emptyText.textContent = 'Select a TTS provider to configure voice preferences.';
    emptyState.appendChild(emptyText);
    grid.appendChild(emptyState);
    addBtn.disabled = true;
    return;
  }

  addBtn.disabled = false;

  // Render existing preferences
  const entries = Object.entries(voicePreferences);

  if (entries.length === 0) {
    // Show empty state with helpful text
    const emptyState = document.createElement('div');
    emptyState.className = 'voice-preferences-empty';
    const emptyText = document.createElement('p');
    emptyText.textContent =
      'No voice preferences set. Click "Add Language Voice" to set a preferred voice for a language.';
    emptyState.appendChild(emptyText);
    grid.appendChild(emptyState);
    return;
  }

  for (const [langCode, voiceId] of entries) {
    const row = createVoicePreferenceRow(langCode, voiceId, providerVoices);
    grid.appendChild(row);
  }
}

/**
 * Create SVG X icon for remove button using safe DOM methods
 */
function createRemoveIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '18');
  line1.setAttribute('y1', '6');
  line1.setAttribute('x2', '6');
  line1.setAttribute('y2', '18');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '6');
  line2.setAttribute('y1', '6');
  line2.setAttribute('x2', '18');
  line2.setAttribute('y2', '18');
  svg.appendChild(line2);

  return svg;
}

/**
 * Create a voice preference row element
 */
function createVoicePreferenceRow(
  langCode: string,
  voiceId: string,
  voices: Array<{ value: string; label: string }>,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'voice-preference-row';
  row.dataset.language = langCode;

  // Language label
  const langLabel = document.createElement('div');
  langLabel.className = 'voice-preference-row__language';
  langLabel.textContent = LANGUAGE_DISPLAY_NAMES[langCode] || langCode;
  const langCodeSpan = document.createElement('span');
  langCodeSpan.className = 'voice-preference-row__language-code';
  langCodeSpan.textContent = ` (${langCode})`;
  langLabel.appendChild(langCodeSpan);
  row.appendChild(langLabel);

  // Voice dropdown
  const voiceSelect = document.createElement('select');
  voiceSelect.className = 'voxpage-select voice-preference-row__voice-select';
  voiceSelect.dataset.language = langCode;

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Provider Default';
  voiceSelect.appendChild(defaultOption);

  // Add voice options
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = voice.value;
    option.textContent = voice.label;
    if (voice.value === voiceId) {
      option.selected = true;
    }
    voiceSelect.appendChild(option);
  }

  voiceSelect.addEventListener('change', () => {
    void saveVoicePreference(langCode, voiceSelect.value);
  });

  row.appendChild(voiceSelect);

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'voice-preference-row__remove-btn';
  removeBtn.setAttribute(
    'aria-label',
    `Remove ${LANGUAGE_DISPLAY_NAMES[langCode] || langCode} voice preference`,
  );
  removeBtn.appendChild(createRemoveIcon());
  removeBtn.addEventListener('click', () => {
    void removeVoicePreference(langCode);
  });
  row.appendChild(removeBtn);

  return row;
}

/**
 * Get voices for current provider
 */
async function getProviderVoices(
  provider: string,
): Promise<Array<{ value: string; label: string }>> {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'provider.getVoices',
      provider,
    });

    if (response?.success && Array.isArray(response.voices)) {
      return response.voices.map((v: { id: string; name: string }) => ({
        value: v.id,
        label: v.name,
      }));
    }
  } catch (error) {
    console.error('Error fetching provider voices:', error);
  }

  // Fallback for providers that don't support voice listing
  return PROVIDER_VOICES[provider] || [];
}

/**
 * Reset voice preferences that are incompatible with the new provider
 * T058: Handle provider change for incompatible preferences
 * Clears all voice preferences since voice IDs are provider-specific
 */
async function resetIncompatibleVoicePreferences(newProvider: string): Promise<void> {
  try {
    const result = await browser.storage.local.get('languagePreference');
    const langPref =
      (result.languagePreference as { voicePreferences?: Record<string, string> }) || {};
    const voicePreferences = langPref.voicePreferences || {};

    // If there are voice preferences, warn the user and clear them
    const preferenceCount = Object.keys(voicePreferences).length;
    if (preferenceCount > 0) {
      // Clear all voice preferences since they're provider-specific
      await browser.storage.local.set({
        languagePreference: {
          ...langPref,
          voicePreferences: {},
        },
      });

      toast.info(
        `Cleared ${preferenceCount} voice preference${preferenceCount > 1 ? 's' : ''} (voice IDs are provider-specific)`,
      );
      console.log(
        '[Settings] Cleared voice preferences on provider change to',
        newProvider,
        'from',
        voicePreferences,
      );
    }
  } catch (error) {
    console.error('Error resetting voice preferences:', error);
  }
}

/**
 * Save a voice preference for a language
 * T056: Implement voice preference save/load
 */
async function saveVoicePreference(langCode: string, voiceId: string): Promise<void> {
  try {
    const result = await browser.storage.local.get('languagePreference');
    const langPref =
      (result.languagePreference as { voicePreferences?: Record<string, string> }) || {};
    const voicePreferences = langPref.voicePreferences || {};

    if (voiceId) {
      voicePreferences[langCode] = voiceId;
    } else {
      delete voicePreferences[langCode];
    }

    await browser.storage.local.set({
      languagePreference: {
        ...langPref,
        voicePreferences,
      },
    });

    toast.success(`Voice preference saved for ${LANGUAGE_DISPLAY_NAMES[langCode] || langCode}`);
  } catch (error) {
    console.error('Error saving voice preference:', error);
    toast.error('Failed to save voice preference');
  }
}

/**
 * Remove a voice preference
 */
async function removeVoicePreference(langCode: string): Promise<void> {
  try {
    const result = await browser.storage.local.get('languagePreference');
    const langPref =
      (result.languagePreference as { voicePreferences?: Record<string, string> }) || {};
    const voicePreferences = { ...langPref.voicePreferences };

    delete voicePreferences[langCode];

    await browser.storage.local.set({
      languagePreference: {
        ...langPref,
        voicePreferences,
      },
    });

    // Re-render grid
    const provider = await browser.storage.local.get('provider');
    await renderVoicePreferencesGrid(
      (provider.provider as string) || settingsDefaults.provider,
      voicePreferences,
    );

    toast.success(`Removed voice preference for ${LANGUAGE_DISPLAY_NAMES[langCode] || langCode}`);
  } catch (error) {
    console.error('Error removing voice preference:', error);
    toast.error('Failed to remove voice preference');
  }
}

/**
 * Show add language modal
 * T053: Voice preference grid component
 */
async function showAddLanguageModal(): Promise<void> {
  if (!elements) return;

  // Get current preferences to filter out already-configured languages
  const result = await browser.storage.local.get(['languagePreference', 'provider']);
  const langPref = result.languagePreference as
    | { voicePreferences?: Record<string, string> }
    | undefined;
  const voicePreferences = langPref?.voicePreferences || {};
  const provider = (result.provider as string) || settingsDefaults.provider;

  // Get available languages (those not already configured)
  const configuredLanguages = new Set(Object.keys(voicePreferences));
  const availableLanguages = Object.entries(LANGUAGE_DISPLAY_NAMES).filter(
    ([code]) => !configuredLanguages.has(code),
  );

  if (availableLanguages.length === 0) {
    toast.info('All languages have been configured');
    return;
  }

  // Create modal with language selection
  const confirmed = await showConfirmModal({
    title: 'Add Language Voice',
    message: 'Select a language to set a preferred voice:',
    confirmText: 'Add',
    cancelText: 'Cancel',
    customContent: createLanguageSelectGrid(availableLanguages),
    onConfirm: async () => {
      const selected = document.querySelector(
        '.language-select-option--selected',
      ) as HTMLElement | null;
      if (!selected?.dataset.language) {
        throw new Error('Please select a language');
      }
      const langCode = selected.dataset.language;

      // Get provider voices to set initial preference
      const voices = await getProviderVoices(provider);
      const defaultVoice = voices.length > 0 ? voices[0].value : '';

      // Save the new preference
      await saveVoicePreference(langCode, defaultVoice);

      // Re-render grid
      const updatedPref = await browser.storage.local.get('languagePreference');
      const updatedVoicePrefs =
        (updatedPref.languagePreference as { voicePreferences?: Record<string, string> })
          ?.voicePreferences || {};
      await renderVoicePreferencesGrid(provider, updatedVoicePrefs);
    },
  });

  if (!confirmed) {
    // User cancelled
  }
}

/**
 * Create language select grid for modal
 */
function createLanguageSelectGrid(languages: Array<[string, string]>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'language-select-grid';

  for (const [code, name] of languages) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'language-select-option';
    option.dataset.language = code;
    option.textContent = name;

    const codeSpan = document.createElement('span');
    codeSpan.className = 'language-select-option__code';
    codeSpan.textContent = ` ${code}`;
    option.appendChild(codeSpan);

    option.addEventListener('click', () => {
      // Deselect others
      container.querySelectorAll('.language-select-option').forEach((btn) => {
        btn.classList.remove('language-select-option--selected');
      });
      option.classList.add('language-select-option--selected');
    });

    container.appendChild(option);
  }

  return container;
}

/**
 * Setup language settings event listeners
 * T052: Language settings section
 */
function setupLanguageEventListeners(): void {
  if (!elements) return;

  // Auto-detect toggle
  elements.languageAutoDetect.addEventListener('change', async () => {
    if (!elements) return;

    const autoDetect = elements.languageAutoDetect.checked;
    await browser.storage.local.set({ languageAutoDetect: autoDetect });
    updateDefaultLanguageVisibility(autoDetect);

    toast.success(
      autoDetect ? 'Language auto-detection enabled' : 'Language auto-detection disabled',
    );
    trackSettingChange('settings.language_autodetect', { enabled: autoDetect });
  });

  // Default language dropdown
  elements.defaultLanguage.addEventListener('change', async () => {
    if (!elements) return;

    const defaultLang = elements.defaultLanguage.value;
    await browser.storage.local.set({ languageDefault: defaultLang });

    toast.success(`Default language set to ${LANGUAGE_DISPLAY_NAMES[defaultLang] || defaultLang}`);
    trackSettingChange('settings.language_default', { language: defaultLang });
  });

  // Show language badge toggle
  elements.showLanguageBadge.addEventListener('change', async () => {
    if (!elements) return;

    const showBadge = elements.showLanguageBadge.checked;
    await browser.storage.local.set({ showLanguageBadge: showBadge });

    toast.success(showBadge ? 'Language badge enabled' : 'Language badge hidden');
    trackSettingChange('settings.language_badge', { visible: showBadge });
  });

  // Add voice preference button
  elements.addVoicePreferenceBtn.addEventListener('click', () => {
    void showAddLanguageModal();
  });
}
