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
  MockAudioUrlProvider,
  createMockAudioUrlProvider,
  type MockAudioUrlProviderConfig,
} from './mock-audio-url-provider';

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

export {
  MockReader,
  createMockReader,
  createTestParagraphsForArticle,
  type MockReaderConfig,
} from './mock-reader';

// Re-export test fixtures for convenience
export {
  createBrowserRuntimeMock,
  createBrowserTabsMock,
  setupBrowserMock,
  FOOTER_STATE_UPDATE,
  PARAGRAPH_CLICKED,
  HIGHLIGHT_UPDATE,
} from '../fixtures/browser-message-mock';

export {
  createMockAudioElement,
  createTimeupdateSimulator,
  assertFooterState,
  assertTimerWithinDrift,
  formatTime,
  parseTime,
  createFooterStateMessageCapture,
} from '../fixtures/timer-helpers';

export {
  createMockExtractedParagraphs,
  createParagraphDOMElements,
  createSelectionState,
  simulateClick,
  simulateRapidClicks,
  selectionAssertions,
  createClickMessageCapture,
  createTestArticle,
  cleanupTestArticle,
  waitForAnimationFrame,
  waitForDebounce,
} from '../fixtures/selection-helpers';
