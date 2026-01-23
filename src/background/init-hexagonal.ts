/**
 * Hexagonal Architecture Initialization
 *
 * Initializes the composition container and handler registry for the
 * hexagonal architecture. This module is the bridge between the legacy
 * background.ts and the new architecture.
 *
 * Uses Strangler Fig pattern: new handlers coexist with legacy handlers
 * until migration is complete.
 *
 * @module background/init-hexagonal
 */

import { browser } from 'wxt/browser';
import {
  type ApiKeys,
  type AppConfig,
  createContainer,
  getContainer,
  isContainerInitialized,
  reconfigureAudioGenerator,
} from '../composition';
import {
  type HandlerRegistry,
  getGlobalInstrumentedRegistry,
  registerAllHandlers,
  setSettingsStore,
} from '../handlers';
import {
  type DispatchStats,
  type DispatchSummary,
  getDispatchStats,
  getDispatchSummary,
  logDispatch,
  resetDispatchStats,
} from '../utils/telemetry';

/**
 * Load API keys from browser storage.
 * 050-groq-tts-provider: Added groqApiKey loading
 */
async function loadApiKeys(): Promise<ApiKeys> {
  const stored = await browser.storage.local.get(['groqApiKey', 'elevenlabsApiKey']);

  return {
    groq: (stored.groqApiKey as string) || null,
    elevenlabs: (stored.elevenlabsApiKey as string) || null,
    browser: null, // Browser TTS has no API key
  };
}

/**
 * Load app configuration from browser storage.
 */
async function loadAppConfig(): Promise<AppConfig> {
  const stored = await browser.storage.local.get(['provider', 'cacheType']);

  return {
    provider: (stored.provider as AppConfig['provider']) || 'browser',
    cacheType: (stored.cacheType as 'indexeddb' | 'memory') || 'indexeddb',
  };
}

/**
 * Initialize the hexagonal architecture container and handler registry.
 *
 * This should be called once during background script startup.
 * Safe to call multiple times - will skip if already initialized.
 *
 * @returns The initialized handler registry
 */
export async function initHexagonalArchitecture(): Promise<HandlerRegistry> {
  // Skip if already initialized
  if (isContainerInitialized()) {
    console.log('[Hexagonal] Container already initialized');
    return getGlobalInstrumentedRegistry();
  }

  console.log('[Hexagonal] Initializing composition container...');

  try {
    // Load configuration
    const apiKeys = await loadApiKeys();
    const config = await loadAppConfig();

    // Create and initialize the container
    createContainer(config, apiKeys);

    // Wire up the settings store for handlers that need it
    const container = getContainer();
    setSettingsStore(container.adapters.settingsStore);

    // Register all handlers on the GLOBAL registry
    // This is critical - dispatchToHexagonal() uses getGlobalInstrumentedRegistry()
    const registry = getGlobalInstrumentedRegistry();

    // Populate the global registry with all handlers
    registerAllHandlers(registry);

    // Setup storage change listener for API key hot-reload
    setupStorageChangeListener();

    console.log('[Hexagonal] Container initialized with config:', {
      provider: config.provider,
      cacheType: config.cacheType,
      hasGroqKey: !!apiKeys.groq,
      hasElevenLabsKey: !!apiKeys.elevenlabs,
      registeredHandlers: registry.getHandlerNames().length,
    });

    return registry;
  } catch (error) {
    console.error('[Hexagonal] Failed to initialize container:', error);
    // Return the global registry - it may be empty, but legacy handlers will work
    return getGlobalInstrumentedRegistry();
  }
}

/**
 * Setup storage change listener to reconfigure container when API keys change.
 * 050-groq-tts-provider: Added to support hot-reloading of API keys.
 */
function setupStorageChangeListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if API keys changed
    const groqKeyChanged = 'groqApiKey' in changes;
    const elevenlabsKeyChanged = 'elevenlabsApiKey' in changes;
    const providerChanged = 'provider' in changes;

    if (!groqKeyChanged && !elevenlabsKeyChanged && !providerChanged) {
      return;
    }

    // Only reconfigure if container is initialized
    if (!isContainerInitialized()) {
      console.log('[Hexagonal] Container not initialized, skipping reconfiguration');
      return;
    }

    // Get current provider and new API keys
    const container = getContainer();
    const currentProvider = container.config.provider;

    // Determine which provider to use
    let newProvider = currentProvider;
    if (providerChanged && changes.provider?.newValue) {
      newProvider = changes.provider.newValue as AppConfig['provider'];
    }

    // Get the API key for the new/current provider
    let apiKey: string | null = null;
    if (newProvider === 'groq') {
      if (groqKeyChanged) {
        apiKey = (changes.groqApiKey?.newValue as string) || null;
      } else {
        // Key didn't change, get from container's stored keys
        // We need to re-fetch from storage
        browser.storage.local.get('groqApiKey').then((result) => {
          const key = (result.groqApiKey as string) || null;
          if (key) {
            try {
              reconfigureAudioGenerator(newProvider, key);
              console.log('[Hexagonal] Reconfigured audio generator for provider:', newProvider);
            } catch (error) {
              console.error('[Hexagonal] Failed to reconfigure audio generator:', error);
            }
          }
        });
        return;
      }
    } else if (newProvider === 'elevenlabs') {
      if (elevenlabsKeyChanged) {
        apiKey = (changes.elevenlabsApiKey?.newValue as string) || null;
      } else {
        browser.storage.local.get('elevenlabsApiKey').then((result) => {
          const key = (result.elevenlabsApiKey as string) || null;
          if (key) {
            try {
              reconfigureAudioGenerator(newProvider, key);
              console.log('[Hexagonal] Reconfigured audio generator for provider:', newProvider);
            } catch (error) {
              console.error('[Hexagonal] Failed to reconfigure audio generator:', error);
            }
          }
        });
        return;
      }
    } else if (newProvider === 'browser') {
      apiKey = null; // Browser TTS doesn't need API key
    }

    // Reconfigure the audio generator
    try {
      reconfigureAudioGenerator(newProvider, apiKey);
      console.log(
        '[Hexagonal] Reconfigured audio generator for provider:',
        newProvider,
        'hasKey:',
        !!apiKey,
      );
    } catch (error) {
      console.error('[Hexagonal] Failed to reconfigure audio generator:', error);
    }
  });

  console.log('[Hexagonal] Storage change listener setup for API key hot-reload');
}

/**
 * Get the current container status for debugging.
 */
export function getContainerStatus(): {
  initialized: boolean;
  adapters: string[];
  services: string[];
  handlers: string[];
} {
  if (!isContainerInitialized()) {
    return {
      initialized: false,
      adapters: [],
      services: [],
      handlers: [],
    };
  }

  const container = getContainer();
  const registry = getGlobalInstrumentedRegistry();

  const adapters = Object.entries(container.adapters)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  const services = Object.entries(container.services)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);

  return {
    initialized: true,
    adapters,
    services,
    handlers: registry.getHandlerNames(),
  };
}

/**
 * Dispatch a message through the hexagonal handler registry.
 *
 * This can be used alongside legacy handlers during the transition period.
 * Returns null if the handler is not found, allowing fallback to legacy.
 * Logs dispatch telemetry for migration tracking.
 *
 * @param type - Message type (e.g., 'playback.start', 'cache.getStats')
 * @param data - Message data
 * @returns Handler response or null if not found
 */
export async function dispatchToHexagonal<T = unknown>(
  type: string,
  data: unknown,
): Promise<T | null> {
  const registry = getGlobalInstrumentedRegistry();
  const startTime = Date.now();

  if (!registry.has(type)) {
    // Debug: Log when handler not found
    if (type.startsWith('queue.')) {
      console.log(
        '[Hexagonal] Handler not found for:',
        type,
        'Registered handlers:',
        registry.getHandlerNames().filter((n) => n.startsWith('queue.')),
      );
    }
    return null;
  }

  const result = await registry.dispatch(type, data);
  const durationMs = Date.now() - startTime;

  // Registry dispatch failed (exception in handler)
  if (!result.ok) {
    logDispatch({
      type,
      path: 'hex',
      durationMs,
      success: false,
      error: String(result.error),
      timestamp: startTime,
    });
    console.warn('[Hexagonal] Handler error:', result.error);
    return null;
  }

  // Handlers return Result<T, E>, which gets wrapped by registry.dispatch in another Result.
  // We need to unwrap the inner Result to return the actual value.
  // Check if result.value is itself a Result (has ok property)
  const handlerResult = result.value as unknown;

  // Debug: Log what we're receiving for queue.getState
  if (type === 'queue.getState') {
    console.log('[Hexagonal] queue.getState raw result.value:', JSON.stringify(handlerResult));
  }

  if (
    handlerResult &&
    typeof handlerResult === 'object' &&
    'ok' in handlerResult &&
    typeof (handlerResult as { ok: boolean }).ok === 'boolean'
  ) {
    const innerResult = handlerResult as { ok: boolean; value?: unknown; error?: unknown };
    if (innerResult.ok) {
      // Inner Result is Ok - log success and return unwrapped value
      logDispatch({
        type,
        path: 'hex',
        durationMs,
        success: true,
        timestamp: startTime,
      });

      // Debug: Log what we're returning for queue.getState
      if (type === 'queue.getState') {
        console.log(
          '[Hexagonal] queue.getState unwrapped value:',
          JSON.stringify(innerResult.value),
        );
      }

      return innerResult.value as T;
    } else {
      // Inner Result is Err - log failure and return null
      logDispatch({
        type,
        path: 'hex',
        durationMs,
        success: false,
        error: String(innerResult.error),
        timestamp: startTime,
      });
      console.warn('[Hexagonal] Handler returned error:', innerResult.error);
      return null;
    }
  }

  // If not a Result, return as-is (for handlers that don't use Result pattern)
  logDispatch({
    type,
    path: 'hex',
    durationMs,
    success: true,
    timestamp: startTime,
  });
  return result.value as T;
}

/**
 * Log a legacy dispatch for telemetry tracking.
 *
 * Call this when a message falls back to a legacy handler.
 *
 * @param type - Message type that used legacy handler
 * @param durationMs - How long the legacy handler took
 * @param success - Whether the legacy handler succeeded
 * @param error - Error message if failed
 */
export function logLegacyDispatch(
  type: string,
  durationMs: number,
  success: boolean,
  error?: string,
): void {
  logDispatch({
    type,
    path: 'legacy',
    durationMs,
    success,
    error,
    timestamp: Date.now() - durationMs,
  });
}

/**
 * Get current dispatch statistics.
 *
 * @returns Dispatch statistics
 */
export function getHexagonalDispatchStats(): DispatchStats {
  return getDispatchStats();
}

/**
 * Get dispatch summary with handler analysis.
 *
 * @param legacyHandlerNames - Names of legacy handlers for comparison
 * @returns Dispatch summary with migration status
 */
export function getHexagonalDispatchSummary(legacyHandlerNames: string[] = []): DispatchSummary {
  const registry = getGlobalInstrumentedRegistry();
  return getDispatchSummary(registry.getHandlerNames(), legacyHandlerNames);
}

/**
 * Reset dispatch statistics.
 * Useful for starting a fresh measurement period.
 */
export function resetHexagonalDispatchStats(): void {
  resetDispatchStats();
}
