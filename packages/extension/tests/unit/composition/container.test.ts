/**
 * Container Unit Tests
 *
 * Tests for the dependency injection container: creation, singleton behavior,
 * service retrieval, reconfiguration, and reset.
 *
 * Uses jest.unstable_mockModule to mock the factory functions and service
 * constructors, avoiding transitive dependency issues (IndexedDB, Readability,
 * browser APIs, etc.).
 *
 * @module tests/unit/composition/container
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// --- Stub objects for adapters and services ---

function createStubAudioGenerator(id = 'browser') {
  return { providerId: id, generateAudio: jest.fn(), getVoices: jest.fn() };
}

function createStubAudioUrlProvider() {
  return { createUrl: jest.fn(), revokeUrl: jest.fn() };
}

function createStubCacheStore() {
  return { get: jest.fn(), set: jest.fn(), delete: jest.fn(), clear: jest.fn(), getStats: jest.fn() };
}

function createStubHighlightSync() {
  return {
    highlightParagraph: jest.fn(),
    clearHighlights: jest.fn(),
    showFooter: jest.fn(),
    hideFooter: jest.fn(),
    updateFooterState: jest.fn(),
  };
}

function createStubTextExtractor() {
  return { extract: jest.fn() };
}

function createStubContentScorer() {
  return { score: jest.fn() };
}

function createStubSettingsStore() {
  return { load: jest.fn(), save: jest.fn(), subscribe: jest.fn() };
}

// Stub InMemoryCacheAdapter and NoOpHighlightSyncAdapter classes
const StubInMemoryCacheAdapter = jest.fn(() => createStubCacheStore());
const StubNoOpHighlightSyncAdapter = jest.fn(() => createStubHighlightSync());

// Stub PlaybackService class
const mockSetAudioGenerator = jest.fn();
const StubPlaybackService = jest.fn().mockImplementation(() => ({
  getState: jest.fn().mockReturnValue({ status: 'idle' }),
  setAudioGenerator: mockSetAudioGenerator,
  start: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
}));

// Stub ContentExtractionService class
const StubContentExtractionService = jest.fn().mockImplementation(() => ({
  extract: jest.fn(),
}));

// Mock factory return values (mutable so we can control them per test)
let stubAudioGenerator = createStubAudioGenerator();
let stubAudioUrlProvider = createStubAudioUrlProvider();
let stubCacheStore = createStubCacheStore();
let stubHighlightSync = createStubHighlightSync();
let stubTextExtractor = createStubTextExtractor();
let stubContentScorer = createStubContentScorer();
let stubSettingsStore = createStubSettingsStore();

const mockCreateAudioGeneratorAdapter = jest.fn(() => stubAudioGenerator);
const mockCreateAudioUrlAdapter = jest.fn(() => stubAudioUrlProvider);
const mockCreateCacheStoreAdapter = jest.fn(() => stubCacheStore);
const mockCreateHighlightSyncAdapter = jest.fn(() => stubHighlightSync);
const mockCreateTextExtractorAdapter = jest.fn(() => stubTextExtractor);
const mockCreateContentScorerAdapter = jest.fn(() => stubContentScorer);
const mockCreateSettingsStoreAdapter = jest.fn(() => stubSettingsStore);
const mockCreateApiClientAdapter = jest.fn(() => ({ isConfigured: false, validateLicense: jest.fn(), getSubscription: jest.fn(), getCreditBalance: jest.fn(), createCheckout: jest.fn() }));
const mockGetApiKeyForProvider = jest.fn(
  (keys: Record<string, string | null>, provider: string) => {
    return (keys as Record<string, string | null>)[provider] ?? null;
  },
);

// --- Register mocks BEFORE importing container ---

jest.unstable_mockModule(resolve(srcDir, 'composition/factories'), () => ({
  createAudioGeneratorAdapter: mockCreateAudioGeneratorAdapter,
  createAudioUrlAdapter: mockCreateAudioUrlAdapter,
  createCacheStoreAdapter: mockCreateCacheStoreAdapter,
  createHighlightSyncAdapter: mockCreateHighlightSyncAdapter,
  createTextExtractorAdapter: mockCreateTextExtractorAdapter,
  createContentScorerAdapter: mockCreateContentScorerAdapter,
  createSettingsStoreAdapter: mockCreateSettingsStoreAdapter,
  createApiClientAdapter: mockCreateApiClientAdapter,
  getApiKeyForProvider: mockGetApiKeyForProvider,
}));

jest.unstable_mockModule(resolve(srcDir, 'core/playback/playback-service'), () => ({
  PlaybackService: StubPlaybackService,
}));

jest.unstable_mockModule(
  resolve(srcDir, 'core/content-extraction/extraction-service'),
  () => ({
    ContentExtractionService: StubContentExtractionService,
  }),
);

jest.unstable_mockModule(resolve(srcDir, 'adapters/cache'), () => ({
  InMemoryCacheAdapter: StubInMemoryCacheAdapter,
  IndexedDBCacheAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'adapters/messaging'), () => ({
  HighlightSyncAdapter: jest.fn(),
  NoOpHighlightSyncAdapter: StubNoOpHighlightSyncAdapter,
}));

// Dynamic import of container AFTER all mocks are registered
const {
  createContainer,
  getContainer,
  ensureContainerInitialized,
  isContainerInitialized,
  resetContainer,
  reconfigureAudioGenerator,
  getPlaybackService,
  isPlaybackServiceAvailable,
  getContentExtractionService,
  isContentExtractionServiceAvailable,
} = await import('../../../src/composition/container');

// --- Test data ---

const defaultConfig = {
  provider: 'browser' as const,
  cacheType: 'memory' as const,
  serverUrl: null,
  licenseKey: null,
};

const defaultApiKeys = {
  elevenlabs: null,
  openai: null,
  groq: null,
  cartesia: null,
};

// --- Tests ---

describe('Container', () => {
  beforeEach(() => {
    // Reset the container singleton between tests
    resetContainer();

    // Reset all stubs so each test starts clean
    stubAudioGenerator = createStubAudioGenerator();
    stubAudioUrlProvider = createStubAudioUrlProvider();
    stubCacheStore = createStubCacheStore();
    stubHighlightSync = createStubHighlightSync();
    stubTextExtractor = createStubTextExtractor();
    stubContentScorer = createStubContentScorer();
    stubSettingsStore = createStubSettingsStore();

    // Reset mock implementations
    mockCreateAudioGeneratorAdapter.mockReturnValue(stubAudioGenerator);
    mockCreateAudioUrlAdapter.mockReturnValue(stubAudioUrlProvider);
    mockCreateCacheStoreAdapter.mockReturnValue(stubCacheStore);
    mockCreateHighlightSyncAdapter.mockReturnValue(stubHighlightSync);
    mockCreateTextExtractorAdapter.mockReturnValue(stubTextExtractor);
    mockCreateContentScorerAdapter.mockReturnValue(stubContentScorer);
    mockCreateSettingsStoreAdapter.mockReturnValue(stubSettingsStore);

    // Clear call counts
    jest.clearAllMocks();
  });

  describe('createContainer', () => {
    it('should create a container with adapters and services', () => {
      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(container).toBeDefined();
      expect(container.adapters).toBeDefined();
      expect(container.services).toBeDefined();
      expect(container.config).toBe(defaultConfig);
    });

    it('should call factory functions to create adapters', () => {
      createContainer(defaultConfig, defaultApiKeys);

      expect(mockCreateAudioGeneratorAdapter).toHaveBeenCalledTimes(1);
      expect(mockCreateAudioUrlAdapter).toHaveBeenCalledTimes(1);
      expect(mockCreateCacheStoreAdapter).toHaveBeenCalledWith('memory');
      expect(mockCreateHighlightSyncAdapter).toHaveBeenCalledTimes(1);
      expect(mockCreateTextExtractorAdapter).toHaveBeenCalledTimes(1);
      expect(mockCreateContentScorerAdapter).toHaveBeenCalledTimes(1);
      expect(mockCreateSettingsStoreAdapter).toHaveBeenCalledTimes(1);
    });

    it('should call getApiKeyForProvider with correct arguments', () => {
      const apiKeys = { elevenlabs: 'ek-test', openai: null, groq: null, cartesia: null };
      createContainer({ ...defaultConfig, provider: 'elevenlabs' as const }, apiKeys);

      expect(mockGetApiKeyForProvider).toHaveBeenCalledWith(apiKeys, 'elevenlabs');
    });

    it('should create PlaybackService with correct adapters', () => {
      createContainer(defaultConfig, defaultApiKeys);

      expect(StubPlaybackService).toHaveBeenCalledTimes(1);
      const deps = StubPlaybackService.mock.calls[0][0] as Record<string, unknown>;
      expect(deps.audioGenerator).toBe(stubAudioGenerator);
      expect(deps.audioUrlProvider).toBe(stubAudioUrlProvider);
      expect(deps.cacheStore).toBe(stubCacheStore);
      expect(deps.highlightSync).toBe(stubHighlightSync);
      expect(deps.settingsStore).toBe(stubSettingsStore);
    });

    it('should create ContentExtractionService with correct adapters', () => {
      createContainer(defaultConfig, defaultApiKeys);

      expect(StubContentExtractionService).toHaveBeenCalledTimes(1);
      const deps = StubContentExtractionService.mock.calls[0][0] as Record<string, unknown>;
      expect(deps.textExtractor).toBe(stubTextExtractor);
      expect(deps.contentScorer).toBe(stubContentScorer);
    });

    it('should store the container as singleton', () => {
      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(isContainerInitialized()).toBe(true);
      expect(getContainer()).toBe(container);
    });

    it('should overwrite previous container on second call', () => {
      const first = createContainer(defaultConfig, defaultApiKeys);
      const second = createContainer(defaultConfig, defaultApiKeys);

      expect(getContainer()).toBe(second);
      expect(getContainer()).not.toBe(first);
    });
  });

  describe('createContainer fallback behavior', () => {
    it('should use InMemoryCacheAdapter when createCacheStoreAdapter throws', () => {
      mockCreateCacheStoreAdapter.mockImplementation(() => {
        throw new Error('IndexedDB not available');
      });

      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(StubInMemoryCacheAdapter).toHaveBeenCalledTimes(1);
      expect(container).toBeDefined();
    });

    it('should use NoOpHighlightSyncAdapter when createHighlightSyncAdapter throws', () => {
      mockCreateHighlightSyncAdapter.mockImplementation(() => {
        throw new Error('HighlightSync init failed');
      });

      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(StubNoOpHighlightSyncAdapter).toHaveBeenCalledTimes(1);
      expect(container).toBeDefined();
    });

    it('should re-throw when createSettingsStoreAdapter throws', () => {
      mockCreateSettingsStoreAdapter.mockImplementation(() => {
        throw new Error('Settings store critical failure');
      });

      expect(() => createContainer(defaultConfig, defaultApiKeys)).toThrow(
        'Settings store critical failure',
      );
    });
  });

  describe('getContainer', () => {
    it('should return the container when initialized', () => {
      const container = createContainer(defaultConfig, defaultApiKeys);
      expect(getContainer()).toBe(container);
    });

    it('should throw when container is not initialized', () => {
      expect(() => getContainer()).toThrow('Container not initialized');
    });

    it('should throw with instruction to call createContainer', () => {
      expect(() => getContainer()).toThrow('Call createContainer() first');
    });
  });

  describe('isContainerInitialized', () => {
    it('should return false before creation', () => {
      expect(isContainerInitialized()).toBe(false);
    });

    it('should return true after creation', () => {
      createContainer(defaultConfig, defaultApiKeys);
      expect(isContainerInitialized()).toBe(true);
    });

    it('should return false after reset', () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();
      expect(isContainerInitialized()).toBe(false);
    });
  });

  describe('resetContainer', () => {
    it('should set container to null', () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();

      expect(isContainerInitialized()).toBe(false);
      expect(() => getContainer()).toThrow();
    });

    it('should be safe to call when already null', () => {
      expect(() => resetContainer()).not.toThrow();
    });

    it('should allow re-creation after reset', () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();
      const newContainer = createContainer(defaultConfig, defaultApiKeys);

      expect(isContainerInitialized()).toBe(true);
      expect(getContainer()).toBe(newContainer);
    });
  });

  describe('ensureContainerInitialized', () => {
    it('should return existing container if already initialized', async () => {
      const container = createContainer(defaultConfig, defaultApiKeys);

      const result = await ensureContainerInitialized(defaultConfig, defaultApiKeys);

      expect(result).toBe(container);
      // Factory functions should only be called once (from createContainer)
      expect(mockCreateAudioGeneratorAdapter).toHaveBeenCalledTimes(1);
    });

    it('should create a new container if not initialized', async () => {
      const result = await ensureContainerInitialized(defaultConfig, defaultApiKeys);

      expect(result).toBeDefined();
      expect(isContainerInitialized()).toBe(true);
      expect(mockCreateAudioGeneratorAdapter).toHaveBeenCalledTimes(1);
    });

    it('should re-create after reset', async () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();

      const result = await ensureContainerInitialized(defaultConfig, defaultApiKeys);

      expect(result).toBeDefined();
      expect(isContainerInitialized()).toBe(true);
    });
  });

  describe('reconfigureAudioGenerator', () => {
    it('should throw if container is not initialized', () => {
      expect(() => reconfigureAudioGenerator('openai', 'test-key')).toThrow(
        'Container not initialized',
      );
    });

    it('should call createAudioGeneratorAdapter with new provider and key', () => {
      createContainer(defaultConfig, defaultApiKeys);
      jest.clearAllMocks();

      const newGenerator = createStubAudioGenerator('openai');
      mockCreateAudioGeneratorAdapter.mockReturnValue(newGenerator);

      reconfigureAudioGenerator('openai', 'test-key');

      expect(mockCreateAudioGeneratorAdapter).toHaveBeenCalledWith('openai', 'test-key');
    });

    it('should update the container adapters with new audio generator', () => {
      createContainer(defaultConfig, defaultApiKeys);

      const newGenerator = createStubAudioGenerator('elevenlabs');
      mockCreateAudioGeneratorAdapter.mockReturnValue(newGenerator);

      reconfigureAudioGenerator('elevenlabs', 'el-key');

      const container = getContainer();
      expect(container.adapters.audioGenerator).toBe(newGenerator);
    });

    it('should update the container config provider', () => {
      createContainer(defaultConfig, defaultApiKeys);

      const newGenerator = createStubAudioGenerator('openai');
      mockCreateAudioGeneratorAdapter.mockReturnValue(newGenerator);

      reconfigureAudioGenerator('openai', 'oai-key');

      const container = getContainer();
      expect(container.config.provider).toBe('openai');
    });

    it('should call setAudioGenerator on PlaybackService', () => {
      createContainer(defaultConfig, defaultApiKeys);
      mockSetAudioGenerator.mockClear();

      const newGenerator = createStubAudioGenerator('groq');
      mockCreateAudioGeneratorAdapter.mockReturnValue(newGenerator);

      reconfigureAudioGenerator('groq', 'groq-key');

      expect(mockSetAudioGenerator).toHaveBeenCalledWith(newGenerator);
    });

    it('should preserve other adapters when reconfiguring', () => {
      createContainer(defaultConfig, defaultApiKeys);
      const originalContainer = getContainer();
      const originalCacheStore = originalContainer.adapters.cacheStore;
      const originalHighlightSync = originalContainer.adapters.highlightSync;

      const newGenerator = createStubAudioGenerator('openai');
      mockCreateAudioGeneratorAdapter.mockReturnValue(newGenerator);

      reconfigureAudioGenerator('openai', 'key');

      const updated = getContainer();
      expect(updated.adapters.cacheStore).toBe(originalCacheStore);
      expect(updated.adapters.highlightSync).toBe(originalHighlightSync);
    });
  });

  describe('getPlaybackService', () => {
    it('should return the PlaybackService from container', () => {
      createContainer(defaultConfig, defaultApiKeys);

      const service = getPlaybackService();

      expect(service).toBeDefined();
      expect(service.getState).toBeDefined();
    });

    it('should throw if container is not initialized', () => {
      expect(() => getPlaybackService()).toThrow('Container not initialized');
    });
  });

  describe('isPlaybackServiceAvailable', () => {
    it('should return false when container is not initialized', () => {
      expect(isPlaybackServiceAvailable()).toBe(false);
    });

    it('should return true when container is initialized', () => {
      createContainer(defaultConfig, defaultApiKeys);
      expect(isPlaybackServiceAvailable()).toBe(true);
    });

    it('should return false after reset', () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();
      expect(isPlaybackServiceAvailable()).toBe(false);
    });
  });

  describe('getContentExtractionService', () => {
    it('should return the ContentExtractionService from container', () => {
      createContainer(defaultConfig, defaultApiKeys);

      const service = getContentExtractionService();

      expect(service).toBeDefined();
      expect(service.extract).toBeDefined();
    });

    it('should throw if container is not initialized', () => {
      expect(() => getContentExtractionService()).toThrow('Container not initialized');
    });
  });

  describe('isContentExtractionServiceAvailable', () => {
    it('should return false when container is not initialized', () => {
      expect(isContentExtractionServiceAvailable()).toBe(false);
    });

    it('should return true when container is initialized', () => {
      createContainer(defaultConfig, defaultApiKeys);
      expect(isContentExtractionServiceAvailable()).toBe(true);
    });

    it('should return false after reset', () => {
      createContainer(defaultConfig, defaultApiKeys);
      resetContainer();
      expect(isContentExtractionServiceAvailable()).toBe(false);
    });
  });

  describe('container structure', () => {
    it('should expose config on the container object', () => {
      const config = { provider: 'elevenlabs' as const, cacheType: 'memory' as const, serverUrl: null, licenseKey: null };
      const container = createContainer(config, defaultApiKeys);

      expect(container.config).toBe(config);
    });

    it('should expose all eight adapters', () => {
      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(container.adapters).toHaveProperty('audioGenerator');
      expect(container.adapters).toHaveProperty('audioUrlProvider');
      expect(container.adapters).toHaveProperty('cacheStore');
      expect(container.adapters).toHaveProperty('highlightSync');
      expect(container.adapters).toHaveProperty('textExtractor');
      expect(container.adapters).toHaveProperty('contentScorer');
      expect(container.adapters).toHaveProperty('settingsStore');
      expect(container.adapters).toHaveProperty('apiClient');
    });

    it('should expose both services', () => {
      const container = createContainer(defaultConfig, defaultApiKeys);

      expect(container.services).toHaveProperty('playback');
      expect(container.services).toHaveProperty('contentExtraction');
    });
  });
});
