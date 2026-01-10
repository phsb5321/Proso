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
} from '../composition';
import {
  type HandlerRegistry,
  getGlobalRegistry,
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
 */
async function loadApiKeys(): Promise<ApiKeys> {
  const stored = await browser.storage.local.get([
    'elevenlabsApiKey',
    'openaiApiKey',
    'groqApiKey',
    'cartesiaApiKey',
  ]);

  return {
    elevenlabs: (stored.elevenlabsApiKey as string) || null,
    openai: (stored.openaiApiKey as string) || null,
    groq: (stored.groqApiKey as string) || null,
    cartesia: (stored.cartesiaApiKey as string) || null,
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
    return getGlobalRegistry();
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
    // This is critical - dispatchToHexagonal() uses getGlobalRegistry()
    const registry = getGlobalRegistry();

    // Populate the global registry with all handlers
    registerAllHandlers(registry);

    console.log('[Hexagonal] Container initialized with config:', {
      provider: config.provider,
      cacheType: config.cacheType,
      hasElevenLabsKey: !!apiKeys.elevenlabs,
      hasOpenAIKey: !!apiKeys.openai,
      registeredHandlers: registry.getHandlerNames().length,
    });

    return registry;
  } catch (error) {
    console.error('[Hexagonal] Failed to initialize container:', error);
    // Return the global registry - it may be empty, but legacy handlers will work
    return getGlobalRegistry();
  }
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
  const registry = getGlobalRegistry();

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
  const registry = getGlobalRegistry();
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
  const registry = getGlobalRegistry();
  return getDispatchSummary(registry.getHandlerNames(), legacyHandlerNames);
}

/**
 * Reset dispatch statistics.
 * Useful for starting a fresh measurement period.
 */
export function resetHexagonalDispatchStats(): void {
  resetDispatchStats();
}
