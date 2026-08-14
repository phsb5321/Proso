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
const mockGetPlaybackState = jest.fn<() => { voice: string | null }>(() => ({
  voice: 'working-voice',
}));
const mockSetVoice = jest.fn<(voice: string | null) => Promise<void>>(async () => undefined);

const mockStorageGet =
  jest.fn<(keys: string | string[] | null) => Promise<Record<string, unknown>>>();
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

async function dispatchHandlerError(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
): Promise<ProviderHandlerError> {
  const result = await dispatchHandler<never>(registry, name, params);
  expect(isErr(result)).toBe(true);
  if (!isErr(result)) throw new Error(`${name} unexpectedly succeeded`);
  return result.error;
}

describe('Provider Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new HandlerRegistry();
    mockIsContainerInitialized.mockReturnValue(true);
    mockReconfigureAudioGenerator.mockReturnValue(true);
    mockGetContainer.mockReturnValue({
      config: { provider: 'elevenlabs' as const, cacheType: 'indexeddb' as const },
      services: {
        playback: {
          getState: mockGetPlaybackState,
          setVoice: mockSetVoice,
        },
      },
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
    it('should return list of providers with elevenlabs, openai, groq, cartesia', async () => {
      const result = await dispatchHandler<ProviderListResponse>(
        registry,
        'provider.getList',
        undefined,
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const { providers, currentProvider } = result.value;
      expect(currentProvider).toBe('elevenlabs');
      expect(providers).toHaveLength(5);

      const ids = providers.map((p) => p.id);
      expect(ids).toContain('elevenlabs');
      expect(ids).toContain('openai');
      expect(ids).toContain('groq');
      expect(ids).toContain('cartesia');
      // PROSO-110: the local synthesis host is a selectable provider.
      expect(ids).toContain('local');
      expect(ids).not.toContain('browser');

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

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'elevenlabs',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        success: true,
        provider: 'elevenlabs',
      });

      // Verify storage interactions
      expect(mockStorageGet).toHaveBeenCalledWith(['elevenlabsApiKey']);
      expect(mockReconfigureAudioGenerator).toHaveBeenCalledWith('elevenlabs', 'sk-test-key', true);
      expect(mockStorageSet).toHaveBeenCalledWith({ provider: 'elevenlabs' });
    });

    it('should select groq provider with null API key when none stored', async () => {
      mockStorageGet.mockResolvedValue({});
      mockStorageSet.mockResolvedValue(undefined);

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'groq',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        success: true,
        provider: 'groq',
      });

      expect(mockReconfigureAudioGenerator).toHaveBeenCalledWith('groq', null, true);
      expect(mockStorageSet).toHaveBeenCalledWith({ provider: 'groq' });
    });

    it('adopts a validated candidate instead of the previously stored key', async () => {
      mockStorageSet.mockResolvedValue(undefined);

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'openai',
        validatedApiKey: 'candidate-key',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(mockStorageGet).toHaveBeenCalledWith(['openaiApiKey', 'elevenlabsApiKey']);
      expect(mockReconfigureAudioGenerator).toHaveBeenCalledWith('openai', 'candidate-key', false);
      expect(mockStorageSet).toHaveBeenCalledWith({
        openaiApiKey: 'candidate-key',
        provider: 'openai',
      });
    });

    it('does not persist a validated candidate when reconfiguration fails', async () => {
      mockReconfigureAudioGenerator.mockImplementation(() => {
        throw new Error('Reconfigure failed');
      });

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'cartesia',
        validatedApiKey: 'candidate-key',
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.type).toBe('operation_failed');
      expect(mockStorageGet).toHaveBeenCalledWith(['cartesiaApiKey', 'elevenlabsApiKey']);
      expect(mockStorageSet).not.toHaveBeenCalled();
    });

    it('restores the previous live route when candidate persistence fails', async () => {
      mockStorageGet.mockResolvedValue({ elevenlabsApiKey: 'working-key' });
      mockStorageSet.mockRejectedValue(new Error('Storage full'));

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'openai',
        validatedApiKey: 'candidate-key',
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(mockReconfigureAudioGenerator.mock.calls).toEqual([
        ['openai', 'candidate-key', false],
        ['elevenlabs', 'working-key'],
      ]);
      expect(mockSetVoice).toHaveBeenCalledWith('working-voice');
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Storage full',
      });
    });

    it('should return invalid_params error for invalid provider', async () => {
      const error = await dispatchHandlerError(registry, 'provider.select', {
        provider: 'google',
      });

      expect(error.type).toBe('invalid_params');
      expect(error.message).toContain('Invalid provider');
    });

    it('should return invalid_params error when provider is missing', async () => {
      const error = await dispatchHandlerError(registry, 'provider.select', {});

      expect(error.type).toBe('invalid_params');
    });

    it('should return container_not_initialized error when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const error = await dispatchHandlerError(registry, 'provider.select', {
        provider: 'elevenlabs',
      });

      expect(error).toEqual({
        type: 'container_not_initialized',
        message: 'Container not initialized.',
      });
      expect(mockStorageGet).not.toHaveBeenCalled();
      expect(mockReconfigureAudioGenerator).not.toHaveBeenCalled();
    });

    it('should return operation_failed error when reconfigure throws', async () => {
      mockStorageGet.mockResolvedValue({});
      mockReconfigureAudioGenerator.mockImplementation(() => {
        throw new Error('Reconfigure failed');
      });

      const result = await dispatchHandler<ProviderSelectResponse>(registry, 'provider.select', {
        provider: 'openai',
      });
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
      // ElevenLabs has empty supportedLanguages => all languages supported
      const result = await dispatchHandler<LanguageValidationResponse>(
        registry,
        'provider.validateLanguage',
        { language: 'fr-FR' },
      );
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value).toEqual({
        supported: true,
        provider: 'elevenlabs',
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
      const error = await dispatchHandlerError(registry, 'provider.validateLanguage', {});

      expect(error.type).toBe('invalid_params');
      expect(error.message).toContain('language is required');
    });

    it('should return invalid_params error when language is not a string', async () => {
      const error = await dispatchHandlerError(registry, 'provider.validateLanguage', {
        language: 42,
      });

      expect(error.type).toBe('invalid_params');
    });

    it('should return invalid_params error for unknown provider', async () => {
      const error = await dispatchHandlerError(registry, 'provider.validateLanguage', {
        language: 'en-US',
        provider: 'nonexistent',
      });

      expect(error.type).toBe('invalid_params');
    });

    it('should return container_not_initialized error when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const error = await dispatchHandlerError(registry, 'provider.validateLanguage', {
        language: 'en-US',
      });

      expect(error).toEqual({
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
