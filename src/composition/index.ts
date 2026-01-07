/**
 * Composition Root
 *
 * Exports container creation and access functions.
 * This is the dependency injection entry point for the application.
 *
 * @module composition
 */

// Container types
export type {
  AppConfig,
  ApiKeys,
  PlaybackServiceDependencies,
  ContentExtractionServiceDependencies,
  ContainerAdapters,
  ContainerServices,
  Container,
} from './types';

// Container functions
export {
  createContainer,
  getContainer,
  isContainerInitialized,
  resetContainer,
  reconfigureAudioGenerator,
  getPlaybackService,
  isPlaybackServiceAvailable,
  getContentExtractionService,
  isContentExtractionServiceAvailable,
  ensureContainerInitialized,
} from './container';

// Factories (for direct adapter creation if needed)
export {
  createAudioGeneratorAdapter,
  createCacheStoreAdapter,
  createHighlightSyncAdapter,
  createTextExtractorAdapter,
  createContentScorerAdapter,
  createSettingsStoreAdapter,
  getApiKeyForProvider,
} from './factories';
