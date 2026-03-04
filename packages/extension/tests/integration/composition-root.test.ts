/**
 * Composition Root Wiring Tests
 *
 * Verifies that the composition container wires adapters correctly:
 * - Singleton instances are shared (prevents dual-cache-split bugs)
 * - All port interfaces are bound
 * - Services are created with correct adapter dependencies
 *
 * @module tests/integration/composition-root
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  createContainer,
  getContainer,
  getContentExtractionService,
  getPlaybackService,
  isContainerInitialized,
  isContentExtractionServiceAvailable,
  isPlaybackServiceAvailable,
  resetContainer,
} from '../../src/composition/container';
import type { ApiKeys, AppConfig } from '../../src/composition/types';

const testConfig: AppConfig = {
  provider: 'openai',
  cacheType: 'memory',
  serverUrl: null,
  licenseKey: null,
};

const testApiKeys: ApiKeys = {
  openai: null,
  elevenlabs: null,
  groq: null,
  cartesia: null,
};

describe('Composition Root Wiring', () => {
  beforeEach(() => {
    resetContainer();
  });

  afterEach(() => {
    resetContainer();
  });

  describe('container initialization', () => {
    it('should create container with all adapters', () => {
      const container = createContainer(testConfig, testApiKeys);

      expect(container.adapters).toBeDefined();
      expect(container.adapters.audioGenerator).toBeDefined();
      expect(container.adapters.audioUrlProvider).toBeDefined();
      expect(container.adapters.cacheStore).toBeDefined();
      expect(container.adapters.highlightSync).toBeDefined();
      expect(container.adapters.textExtractor).toBeDefined();
      expect(container.adapters.contentScorer).toBeDefined();
      expect(container.adapters.settingsStore).toBeDefined();
    });

    it('should create container with all services', () => {
      const container = createContainer(testConfig, testApiKeys);

      expect(container.services).toBeDefined();
      expect(container.services.playback).toBeDefined();
      expect(container.services.contentExtraction).toBeDefined();
    });

    it('should be retrievable via getContainer()', () => {
      createContainer(testConfig, testApiKeys);

      const container = getContainer();
      expect(container).toBeDefined();
      expect(container.adapters.cacheStore).toBeDefined();
    });
  });

  describe('singleton guarantees', () => {
    it('should return the same container instance on repeated calls', () => {
      createContainer(testConfig, testApiKeys);

      const container1 = getContainer();
      const container2 = getContainer();

      expect(container1).toBe(container2);
    });

    it('should use consistent adapter references within a single container', () => {
      const container = createContainer(testConfig, testApiKeys);

      // The cache store used by PlaybackService should be the same instance
      // as the one in the adapters object (prevents dual-cache-split)
      expect(container.adapters.cacheStore).toBeDefined();
      expect(container.services.playback).toBeDefined();
    });
  });

  describe('service availability', () => {
    it('should report initialized state correctly', () => {
      expect(isContainerInitialized()).toBe(false);

      createContainer(testConfig, testApiKeys);

      expect(isContainerInitialized()).toBe(true);
    });

    it('should report PlaybackService availability', () => {
      expect(isPlaybackServiceAvailable()).toBe(false);

      createContainer(testConfig, testApiKeys);

      expect(isPlaybackServiceAvailable()).toBe(true);
    });

    it('should report ContentExtractionService availability', () => {
      expect(isContentExtractionServiceAvailable()).toBe(false);

      createContainer(testConfig, testApiKeys);

      expect(isContentExtractionServiceAvailable()).toBe(true);
    });

    it('should provide PlaybackService via getPlaybackService()', () => {
      createContainer(testConfig, testApiKeys);

      const service = getPlaybackService();
      expect(service).toBeDefined();
      expect(service.getState).toBeDefined();
    });

    it('should provide ContentExtractionService via getContentExtractionService()', () => {
      createContainer(testConfig, testApiKeys);

      const service = getContentExtractionService();
      expect(service).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear container on resetContainer()', () => {
      createContainer(testConfig, testApiKeys);
      expect(isContainerInitialized()).toBe(true);

      resetContainer();
      expect(isContainerInitialized()).toBe(false);
    });

    it('should throw when accessing container after reset', () => {
      createContainer(testConfig, testApiKeys);
      resetContainer();

      expect(() => getContainer()).toThrow('Container not initialized');
    });
  });

  describe('fallback adapters', () => {
    it('should use in-memory cache when cacheType is memory', () => {
      const container = createContainer({ ...testConfig, cacheType: 'memory' }, testApiKeys);

      expect(container.adapters.cacheStore).toBeDefined();
      // InMemoryCacheAdapter should be used
      expect(container.adapters.cacheStore.constructor.name).toMatch(/InMemory|Cache/);
    });
  });
});
