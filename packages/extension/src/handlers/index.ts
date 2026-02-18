/**
 * Handler Module
 *
 * Central export for message handlers in the hexagonal architecture.
 * Provides the HandlerRegistry and all domain-specific handler registrations.
 *
 * @module handlers
 */

// Registry exports
export {
  HandlerRegistry,
  createHandlerRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  type Handler,
  type HandlerError,
} from './registry';

// Instrumented registry exports (T015: telemetry)
export {
  InstrumentedRegistry,
  createInstrumentedRegistry,
  getGlobalInstrumentedRegistry,
  resetGlobalInstrumentedRegistry,
  wrapWithInstrumentation,
} from './instrumented-registry';

// Playback handler exports
export {
  registerPlaybackHandlers,
  type PlaybackHandlerError,
  type PlaybackStateResponse,
  type PlaybackOperationResponse,
} from './playback.handlers';

// Cache handler exports
export {
  registerCacheHandlers,
  type CacheHandlerError,
  type CacheStatsResponse,
  type CacheClearResponse,
  type CacheCheckResponse,
  type CacheEvictionResponse,
  type CachedParagraphsResponse,
  type GetCachedParagraphsParams,
  type CostEstimateParams,
  type CostEstimateResponse,
} from './cache.handlers';

// Content handler exports
export {
  registerContentHandlers,
  type ContentHandlerError,
  type ExtractedParagraph,
  type ContentExtractResponse,
  type ContentScoreResponse,
} from './content.handlers';

// Debug handler exports
export {
  registerDebugHandlers,
  type DebugHandlerError,
  type HexagonalStatusResponse,
} from './debug.handlers';

// Audio handler exports (T031)
export {
  registerAudioHandlers,
  type AudioHandlerError,
  type VoicesResponse,
  type SetVoiceResponse,
  type ValidateCredentialsResponse,
  type GenerateAudioResponse,
} from './audio.handlers';

// Provider handler exports (T032)
export {
  registerProviderHandlers,
  type ProviderHandlerError,
  type ProviderInfo,
  type ProviderListResponse,
  type ProviderSelectResponse,
  type LanguageValidationResponse,
} from './provider.handlers';

// Settings handler exports (T041)
export {
  registerSettingsHandlers,
  setSettingsStore,
  type SettingsHandlerError,
  type SettingsGetResponse,
  type SettingsUpdateResponse,
  type ApiKeyGetResponse,
  type ApiKeySetResponse,
  type ApiKeyTestResponse,
} from './settings.handlers';

// Footer handler exports (T042)
export {
  registerFooterHandlers,
  setHighlightSync,
  setActiveTabId,
  getActiveTabId,
  type FooterHandlerError,
  type FooterOperationResponse,
  type FooterActionResponse,
} from './footer.handlers';

// Prefetch handler exports (T052/T053)
export {
  registerPrefetchHandlers,
  type PrefetchHandlerError,
  type PrefetchStartResponse,
  type PrefetchStopResponse,
  type PrefetchStatusResponse,
  type PrefetchClearBufferResponse,
  type PrefetchStartParams,
  type PrefetchClearBufferParams,
} from './prefetch.handlers';

// Queue handler exports (T061/T064)
export {
  registerQueueHandlers,
  type QueueHandlerError,
  type QueueAddParams,
  type QueueAddResponse,
  type QueueRemoveParams,
  type QueueReorderParams,
  type QueueReorderResponse,
  type QueueUpdateStatusParams,
  type QueueUpdateProgressParams,
  type QueueClearParams,
  type QueueClearResponse,
  type QueueGetItemParams,
  type QueueGetItemResponse,
  type QueueItemInfo,
  type QueuePlayParams,
  type QueuePlayResponse,
  type QueuePlayNextResponse,
  type QueuePlayPreviousResponse,
  type QueueStateResponse,
} from './queue.handlers';

// Reader handler exports (045-pdf-removal-page-reader)
export {
  registerReaderHandlers,
  clearArticleCache,
  getCachedArticle,
  onTabRemoved as onReaderTabRemoved,
} from './reader.handlers';

// Highlight handler exports (045-pdf-removal-page-reader Phase 4)
export {
  registerHighlightHandlers,
  setHighlightRepository,
  type HighlightHandlerError,
  type HighlightCreateResponse,
  type HighlightGetResponse,
  type HighlightListResponse,
  type HighlightUpdateResponse,
  type HighlightDeleteResponse,
  type HighlightDeleteByUrlResponse,
} from './highlight.handlers';

// Export handler exports (T066)
export {
  registerExportHandlers,
  setExportDependencies,
  clearActiveJobs,
  cleanupCompletedJobs,
  type ExportHandlerError,
  type ExportStartResponse,
  type ExportCancelResponse,
  type ExportProgressResponse,
  type ExportDownloadResponse,
  type ExportDependencies,
} from './export.handlers';

// Language handler exports (T069)
export {
  registerLanguageHandlers,
  setLanguageDependencies,
  clearLanguageState,
  type LanguageHandlerError,
  type LanguageDetectResponse,
  type LanguageStateResponse,
  type LanguageSetOverrideResponse,
  type LanguageClearOverrideResponse,
  type LanguageDependencies,
} from './language.handlers';

// Logging handler exports (T070)
export {
  registerLoggingHandlers,
  setLoggingDependencies,
  type LoggingHandlerError,
  type LogRemoteResponse,
  type FlushBufferResponse,
  type LoggingStateResponse,
  type LoggingDependencies,
} from './logging.handlers';

// Credit handler exports (T132)
export {
  registerCreditHandlers,
  setCreditApiClient,
  type CreditHandlerError,
  type CreditBalanceHandlerResponse,
  type CreditHistoryHandlerResponse,
  type CreditErrorResponse,
} from './credit.handlers';

// Import handler registration functions
import { registerAudioHandlers as regAudio } from './audio.handlers';
import { registerCacheHandlers as regCache } from './cache.handlers';
import { registerContentHandlers as regContent } from './content.handlers';
import { registerCreditHandlers as regCredit } from './credit.handlers';
import { registerDebugHandlers as regDebug } from './debug.handlers';
import { registerExportHandlers as regExport } from './export.handlers';
import { registerFooterHandlers as regFooter } from './footer.handlers';
import { registerHighlightHandlers as regHighlight } from './highlight.handlers';
import {
  type InstrumentedRegistry as InstrReg,
  createInstrumentedRegistry as createInstrReg,
} from './instrumented-registry';
import { registerLanguageHandlers as regLanguage } from './language.handlers';
import { registerLoggingHandlers as regLogging } from './logging.handlers';
import { registerPlaybackHandlers as regPlayback } from './playback.handlers';
import { registerPrefetchHandlers as regPrefetch } from './prefetch.handlers';
import { registerProviderHandlers as regProvider } from './provider.handlers';
import { registerQueueHandlers as regQueue } from './queue.handlers';
import { registerReaderHandlers as regReader } from './reader.handlers';
import { type HandlerRegistry as Registry, createHandlerRegistry as createReg } from './registry';
import { registerSettingsHandlers as regSettings } from './settings.handlers';
/**
 * Register all handlers on the given registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerAllHandlers(registry: Registry): void {
  regPlayback(registry);
  regCache(registry);
  regContent(registry);
  regDebug(registry);
  regAudio(registry); // T031/T033
  regProvider(registry); // T032/T034
  regSettings(registry); // T041/T043
  regFooter(registry); // T042/T044
  regPrefetch(registry); // T052/T053
  regQueue(registry); // T061/T064
  regReader(registry); // 045-pdf-removal-page-reader
  regHighlight(registry); // 045-pdf-removal-page-reader Phase 4
  regExport(registry); // T066
  regLanguage(registry); // T069
  regLogging(registry); // T070
  regCredit(registry); // T132
}

/**
 * Create a fully configured handler registry with all handlers registered.
 *
 * @returns Configured handler registry
 */
export function createConfiguredRegistry(): Registry {
  const registry = createReg();
  registerAllHandlers(registry);
  return registry;
}

/**
 * Create a fully configured instrumented registry with telemetry.
 * Use this in production to automatically track handler timing and errors.
 *
 * @param options - Configuration options
 * @param options.enableInstrumentation - Whether to enable telemetry (default: true)
 * @returns Configured instrumented registry
 */
export function createInstrumentedConfiguredRegistry(options?: {
  enableInstrumentation?: boolean;
}): InstrReg {
  const registry = createInstrReg();
  registerAllHandlers(registry);

  if (options?.enableInstrumentation === false) {
    registry.setInstrumentationEnabled(false);
  }

  return registry;
}
