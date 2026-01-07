/**
 * Mock Exports
 *
 * Barrel export for all mock implementations.
 *
 * @module tests/mocks
 */

export {
  MockAudioGenerator,
  createMockAudioGenerator,
  type MockAudioGeneratorConfig,
} from './mock-audio-generator';

export {
  MockCacheStore,
  createMockCacheStore,
  type MockCacheStoreConfig,
} from './mock-cache-store';

export {
  MockHighlightSync,
  createMockHighlightSync,
  type MockHighlightSyncConfig,
  type ParagraphHighlightCall,
  type WordHighlightCall,
  type FooterStateUpdateCall,
} from './mock-highlight-sync';

export {
  MockSettingsStore,
  createMockSettingsStore,
  type MockSettingsStoreConfig,
} from './mock-settings-store';

export {
  MockTextExtractor,
  createMockTextExtractor,
  createTestParagraphs,
  createTestExtractedContent,
  type MockTextExtractorConfig,
} from './mock-text-extractor';

export {
  MockContentScorer,
  createMockContentScorer,
  type MockContentScorerConfig,
} from './mock-content-scorer';
