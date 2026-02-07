/**
 * Provider Handler Unit Tests
 *
 * Tests for TTS provider-related message handlers.
 * Covers provider listing, selection, and language validation.
 *
 * @module tests/unit/handlers/provider.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Result } from '../../../src/core/shared/result';
import type {
  ProviderHandlerError,
  ProviderListResponse,
  ProviderSelectResponse,
  LanguageValidationResponse,
} from '../../../src/handlers/provider.handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// --- ESM Mocks (must precede dynamic imports) ---

const mockGetContainer = jest.fn();
const mockIsContainerInitialized = jest.fn<() => boolean>();
const mockReconfigureAudioGenerator = jest.fn();

const mockStorageGet = jest.fn<(keys: string | string[] | null) => Promise<Record<string, unknown>>>();
const mockStorageSet = jest.fn<(items: Record<string, unknown>) => Promise<void>>();

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: mockStorageGet,
        set: mockStorageSet,
      },
    },
  },
}));

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getContainer: mockGetContainer,
  isContainerInitialized: mockIsContainerInitialized,
  reconfigureAudioGenerator: mockReconfigureAudioGenerator,
}));

// --- Dynamic imports after mocks ---

const { registerProviderHandlers } = await import('../../../src/handlers/provider.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');
const { isOk, isErr } = await import('../../../src/core/shared/result');

/**
 * Helper: dispatch a handler and unwrap the outer registry Result.
 * The registry wraps every handler response in Ok(), so the outer layer
 * is always Ok when the handler itself doesn't throw. The inner value
 * is the handler's own Result<T, ProviderHandlerError>.
 */
async function dispatchHandler<T>(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
): Promise<Result<T, ProviderHandlerError>> {
  const outer = await registry.dispatch(name, params);
  if (!isOk(outer)) {
    throw new Error(`Registry dispatch failed unexpectedly: ${JSON.stringify(outer.error)}`);
  }
  return outer.value as Result<T, ProviderHandlerError>;
}

describe('Provider Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new HandlerRegistry();
    mockIsContainerInitialized.mockReturnValue(true);
    mockGetContainer.mockReturnValue({
      config: { provider: 'browser' as const, cacheType: 'indexeddb' as const },
    });
    registerProviderHandlers(registry);
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------
  describe('registration', () => {
    it('should register all three provider handlers', () => {
      expect(registry.has('provider.getList')).toBe(true);
      expect(registry.has('provider.select')).toBe(true);
      expect(registry.has('provider.validateLanguage')).toBe(true);
      expect(registry.size).toBe(3);
    });

    it('should be dispatchable via registry.dispatch()', async () => {
      const result = await registry.dispatch('provider.getList', undefined);
      expect(isOk(result)).toBe(true);
    });

    it('should return not_found for unregistered handler', async () => {
      const result = await registry.dispatch('provider.nonexistent', {});
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'not_found',
        handlerName: 'provider.nonexistent',
      });
    });
  });

  // -------------------------------------------------------------------------
  // provider.getList
  // -------------------------------------------------------------------------
  describe('provider.getList', () => {
    it('should return list of providers with browser and elevenlabs', async () => {
      const result = await dispatchHandler<ProviderListResponse>(
        registry,
        'provider.getList',
        undefined,
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const { providers, currentProvider } = result.value;
      expect(currentProvider).toBe('browser');
      expect(providers).toHaveLength(2);

      const ids = providers.map((p) => p.id);
      expect(ids).toContain('browser');
      expect(ids).toContain('elevenlabs');

      const browserProvider = providers.find((p) => p.id === 'browser');
      expect(browserProvider).toMatchObject({
        id: 'browser',
        name: 'Browser TTS',
        supportsWordTiming: false,
        requiresApiKey: false,
      });

      const elevenProvider = providers.find((p) => p.id === 'elevenlabs');
      expect(elevenProvider).toMatchObject({
        id: 'elevenlabs',
        name: 'ElevenLabs',
        supportsWordTiming: true,
        requiresApiKey: true,
      });
    });

    it('should reflect the current provider from container config', async () => {
      mockGetContainer.mockReturnValue({
        config: { provider: 'elevenlabs', cacheType: 'indexeddb' },
      });

      const result = await dispatchHandler<ProviderListResponse>(
        registry,
        'provider.getList',
        undefined,
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.currentProvider).toBe('elevenlabs');
    });

    it('should return container_not_initialized error when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = await dispatchHandler<ProviderListResponse>(
        registry,
        'provider.getList',
        undefined,
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'container_not_initialized',
        message: 'Container not initialized.',
      });
    });

    it('should return operation_failed error when getContainer throws', async () => {
      mockGetContainer.mockImplementation(() => {
        throw new Error('Internal explosion');
      });

      const result = await dispatchHandler<ProviderListResponse>(
        registry,
        'provider.getList',
        undefined,
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Internal explosion',
      });
    });
  });

  // -------------------------------------------------------------------------
  // provider.select
  // -------------------------------------------------------------------------
  describe('provider.select', () => {
    it('should select a valid provider and persist to storage', async () => {
      mockStorageGet.mockResolvedValue({ elevenlabsApiKey: 'sk-test-key' });
      mockStorageSet.mockResolvedValue(undefined);

      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        { provider: 'elevenlabs' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        success: true,
        provider: 'elevenlabs',
      });

      // Verify storage interactions
      expect(mockStorageGet).toHaveBeenCalledWith(['elevenlabsApiKey']);
      expect(mockReconfigureAudioGenerator).toHaveBeenCalledWith('elevenlabs', 'sk-test-key');
      expect(mockStorageSet).toHaveBeenCalledWith({ provider: 'elevenlabs' });
    });

    it('should select browser provider with null API key when none stored', async () => {
      mockStorageGet.mockResolvedValue({});
      mockStorageSet.mockResolvedValue(undefined);

      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        { provider: 'browser' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        success: true,
        provider: 'browser',
      });

      expect(mockReconfigureAudioGenerator).toHaveBeenCalledWith('browser', null);
      expect(mockStorageSet).toHaveBeenCalledWith({ provider: 'browser' });
    });

    it('should return invalid_params error for invalid provider', async () => {
      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        { provider: 'openai' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('invalid_params');
      expect(result.error.message).toContain('Invalid provider');
      expect(result.error.message).toContain('elevenlabs');
      expect(result.error.message).toContain('browser');
    });

    it('should return invalid_params error when provider is missing', async () => {
      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        {},
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('invalid_params');
    });

    it('should return container_not_initialized error when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        { provider: 'browser' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'container_not_initialized',
        message: 'Container not initialized.',
      });

      // Should not attempt storage or reconfiguration
      expect(mockStorageGet).not.toHaveBeenCalled();
      expect(mockReconfigureAudioGenerator).not.toHaveBeenCalled();
    });

    it('should return operation_failed error when reconfigure throws', async () => {
      mockStorageGet.mockResolvedValue({});
      mockReconfigureAudioGenerator.mockImplementation(() => {
        throw new Error('Reconfigure failed');
      });

      const result = await dispatchHandler<ProviderSelectResponse>(
        registry,
        'provider.select',
        { provider: 'browser' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Reconfigure failed',
      });
    });
  });

  // -------------------------------------------------------------------------
  // provider.validateLanguage
  // -------------------------------------------------------------------------
  describe('provider.validateLanguage', () => {
    it('should report language as supported for multilingual provider', async () => {
      // Both providers have empty supportedLanguages => all languages supported
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'fr-FR' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        supported: true,
        provider: 'browser',
        language: 'fr-FR',
      });
    });

    it('should use specified provider instead of current when provided', async () => {
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'en-US', provider: 'elevenlabs' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toMatchObject({
        supported: true,
        provider: 'elevenlabs',
        language: 'en-US',
      });
    });

    it('should not include suggestedProviders when language is supported', async () => {
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'ja-JP' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.supported).toBe(true);
      expect(result.value.suggestedProviders).toBeUndefined();
    });

    it('should return invalid_params error when language is missing', async () => {
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        {},
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('invalid_params');
      expect(result.error.message).toContain('language is required');
    });

    it('should return invalid_params error when language is not a string', async () => {
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 42 },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('invalid_params');
    });

    it('should return invalid_params error for unknown provider', async () => {
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'en-US', provider: 'nonexistent' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('invalid_params');
      expect(result.error.message).toContain('Unknown provider');
    });

    it('should return container_not_initialized error when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'en-US' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'container_not_initialized',
        message: 'Container not initialized.',
      });
    });

    it('should return operation_failed when getContainer throws', async () => {
      mockGetContainer.mockImplementation(() => {
        throw new Error('Container boom');
      });

      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'de-DE' },
      );
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Container boom',
      });
    });
  });
});
