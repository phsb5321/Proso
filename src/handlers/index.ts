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

// PDF handler exports (T060/T063)
export {
  registerPDFHandlers,
  type PDFHandlerError,
  type PDFExtractParams,
  type PDFExtractResult,
  type PDFParagraphInfo,
  type PDFGetStateParams,
  type PDFSaveStateParams,
  type PDFPlayParams,
  type PDFPlayResult,
  type PDFSeekParams,
  type PDFHighlightParams,
  type PDFScrollToPageParams,
} from './pdf.handlers';

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

// Import handler registration functions
import { registerAudioHandlers as regAudio } from './audio.handlers';
import { registerCacheHandlers as regCache } from './cache.handlers';
import { registerContentHandlers as regContent } from './content.handlers';
import { registerDebugHandlers as regDebug } from './debug.handlers';
import { registerFooterHandlers as regFooter } from './footer.handlers';
import { registerPDFHandlers as regPDF } from './pdf.handlers';
import { registerPlaybackHandlers as regPlayback } from './playback.handlers';
import { registerPrefetchHandlers as regPrefetch } from './prefetch.handlers';
import { registerProviderHandlers as regProvider } from './provider.handlers';
import { registerQueueHandlers as regQueue } from './queue.handlers';
import { registerSettingsHandlers as regSettings } from './settings.handlers';
import { type HandlerRegistry as Registry, createHandlerRegistry as createReg } from './registry';

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
  regPDF(registry); // T060/T063
  regQueue(registry); // T061/T064
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
