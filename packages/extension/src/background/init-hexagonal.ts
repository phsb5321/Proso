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
import { createHighlightRepository } from '../adapters/storage/highlight-indexeddb.adapter';
import {
  type ApiKeys,
  type AppConfig,
  createContainer,
  getContainer,
  isContainerInitialized,
} from '../composition';
import { getContainerStatus as getCompositionStatus } from '../composition/status';
import {
  type HandlerRegistry,
  getGlobalInstrumentedRegistry,
  registerAllHandlers,
  setActiveTabId,
  setCreditApiClient,
  setExportDependencies,
  setHighlightRepository,
  setHighlightSync,
  setLanguageDependencies,
  setLoggingDependencies,
  setSettingsApiClient,
  setSettingsStore,
} from '../handlers';
import { detectLanguageFromText } from '../utils/language/detector';
import { createLogBuffer } from '../utils/logging/buffer';
import { createLogger } from '../utils/logging/logger';
import {
  type DispatchStats,
  type DispatchSummary,
  getDispatchStats,
  getDispatchSummary,
  logDispatch,
  resetDispatchStats,
} from '../utils/telemetry';

const log = createLogger('background');

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
  const stored = await browser.storage.local.get([
    'provider',
    'cacheType',
    'serverUrl',
    'licenseKey',
  ]);

  return {
    provider: (stored.provider as AppConfig['provider']) || 'elevenlabs',
    cacheType: (stored.cacheType as 'indexeddb' | 'memory') || 'indexeddb',
    serverUrl: (stored.serverUrl as string) || 'https://api.proso.com.br',
    licenseKey: (stored.licenseKey as string) || null,
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
    log.info('[Hexagonal] Container already initialized');
    return getGlobalInstrumentedRegistry();
  }

  log.info('[Hexagonal] Initializing composition container...');

  // Register all handlers FIRST on the GLOBAL registry (defense-in-depth).
  // Handlers call getPlaybackService() lazily at dispatch time and already
  // handle missing services gracefully. This ensures no "Unknown message type"
  // spam even if container init fails below.
  const registry = getGlobalInstrumentedRegistry();
  registerAllHandlers(registry);

  try {
    // Load configuration
    const apiKeys = await loadApiKeys();
    const config = await loadAppConfig();

    // Create and initialize the container
    createContainer(config, apiKeys);

    // Wire up dependencies for all handler subsystems
    const container = getContainer();
    setSettingsStore(container.adapters.settingsStore);

    // T132: Wire API client for credit handlers
    setCreditApiClient(container.adapters.apiClient);

    // 069: Wire API client for settings handlers (TTS key validation via server)
    setSettingsApiClient(container.adapters.apiClient);

    // T001: Wire highlight sync for footer handlers
    setHighlightSync(container.adapters.highlightSync);

    // T017: Subscribe PlaybackService to settings changes for reactive updates
    container.services.playback.subscribeToSettings();

    // T002: Wire language detection using franc-min
    setLanguageDependencies({
      detectLanguage: (text: string) => detectLanguageFromText(text)?.code ?? 'en',
    });

    // T003: Wire highlight repository for highlight CRUD handlers
    setHighlightRepository(createHighlightRepository());

    // T004: Wire export dependencies (graceful — export is a secondary feature)
    try {
      setExportDependencies({
        generateAudio: async (request) => {
          // Delegate to the container's audio generator
          const audioGen = container.adapters.audioGenerator;
          const result = await audioGen.generateAudio({
            text: request.text,
            voice: request.voice ?? null,
            speed: request.speed,
            language: null,
          });
          if (result.ok && result.value.audioBlob.size > 0) {
            const url = URL.createObjectURL(result.value.audioBlob);
            return { audioUrl: url, success: true };
          }
          return { success: false, error: result.ok ? 'Empty audio' : String(result.error) };
        },
        downloadFile: async (url, filename) => {
          await browser.downloads.download({ url, filename });
        },
        encodeToMp3: async (audioBlobs) => {
          // MP3 encoding is best-effort — return concatenated blob if encoder unavailable
          const blob = new Blob(audioBlobs, { type: 'audio/mpeg' });
          return { blob, durationMs: 0, sizeBytes: blob.size };
        },
        createAudioUrl: async (blob) => URL.createObjectURL(blob),
        revokeAudioUrl: (url) => {
          if (url) URL.revokeObjectURL(url);
        },
        saveExportHistory: async (entry) => {
          const result = await browser.storage.local.get('exportHistory');
          const history = (result.exportHistory as unknown[]) || [];
          history.push(entry);
          // Keep last 50 entries
          if (history.length > 50) history.splice(0, history.length - 50);
          await browser.storage.local.set({ exportHistory: history });
        },
      });
    } catch (error) {
      log.warn('[Hexagonal] Failed to wire export dependencies', { error });
    }

    // T005: Wire logging dependencies (graceful — logging handlers return disabled state if unwired)
    try {
      const logBuffer = createLogBuffer();
      setLoggingDependencies({
        addToBuffer: (entry) => {
          // Convert millisecond timestamp to nanosecond string (19 digits)
          const nsTimestamp = String(entry.timestamp * 1_000_000).padStart(19, '0');
          logBuffer.add({
            level: entry.level,
            message: entry.message,
            component: 'background' as const,
            metadata: entry.metadata,
            timestamp: nsTimestamp,
          });
        },
        flushBuffer: async () => {
          const entries = logBuffer.flush();
          return entries.length;
        },
        getBufferSize: () => logBuffer.count,
        isEnabled: () => !logBuffer.isCircuitBroken(),
        getLastFlushAttempt: () => logBuffer.getState().lastFlushAttempt,
        getConsecutiveFailures: () => logBuffer.getState().consecutiveFailures,
        isCircuitBreakerOpen: () => logBuffer.isCircuitBroken(),
      });
    } catch (error) {
      log.warn('[Hexagonal] Failed to wire logging dependencies', { error });
    }

    // T006: Track active tab for footer handlers
    browser.tabs.onActivated.addListener((activeInfo) => {
      setActiveTabId(activeInfo.tabId);
    });

    log.info('[Hexagonal] Container initialized with config', {
      provider: config.provider,
      cacheType: config.cacheType,
      hasElevenLabsKey: !!apiKeys.elevenlabs,
      registeredHandlers: registry.getHandlerNames().length,
    });
  } catch (error) {
    log.error('[Hexagonal] Failed to initialize container', { error });
    log.warn('[Hexagonal] Handlers are still registered — dispatches will use graceful fallbacks');
  }

  return registry;
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
  const registry = getGlobalInstrumentedRegistry();
  return getCompositionStatus(registry.getHandlerNames());
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
      log.debug('[Hexagonal] Handler not found for type', {
        type,
        registeredHandlers: registry.getHandlerNames().filter((n) => n.startsWith('queue.')),
      });
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
    log.warn('[Hexagonal] Handler error', { error: result.error });
    // T033: Return discriminated error instead of null
    return { _hexError: true, error: String(result.error) } as T;
  }

  // Handlers return Result<T, E>, which gets wrapped by registry.dispatch in another Result.
  // We need to unwrap the inner Result to return the actual value.
  // Check if result.value is itself a Result (has ok property)
  const handlerResult = result.value as unknown;

  // Debug: Log what we're receiving for queue.getState
  if (type === 'queue.getState') {
    log.debug('[Hexagonal] queue.getState raw result.value', {
      value: JSON.stringify(handlerResult),
    });
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
        log.debug('[Hexagonal] queue.getState unwrapped value', {
          value: JSON.stringify(innerResult.value),
        });
      }

      return innerResult.value as T;
    } else {
      // Inner Result is Err - log failure and return discriminated error
      logDispatch({
        type,
        path: 'hex',
        durationMs,
        success: false,
        error: String(innerResult.error),
        timestamp: startTime,
      });
      log.warn('[Hexagonal] Handler returned error', { error: innerResult.error });
      // T033: Return discriminated error instead of null
      return { _hexError: true, error: String(innerResult.error) } as T;
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
