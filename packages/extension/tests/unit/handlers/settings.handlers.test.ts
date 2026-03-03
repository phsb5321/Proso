/**
 * Settings Handlers Unit Tests
 *
 * Tests all settings handler functions:
 *   - settings.get
 *   - settings.update
 *   - settings.getApiKey
 *   - settings.setApiKey
 *   - settings.testApiKey (TTS providers → server, anthropic → direct fetch)
 *
 * Uses ESM mocking via jest.unstable_mockModule for wxt/browser.
 * Injects a mock ISettingsStore via setSettingsStore() and
 * a mock IApiClient via setSettingsApiClient().
 *
 * @module tests/unit/handlers/settings.handlers
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ============================================
// ESM Mocks — must precede dynamic imports
// ============================================

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: jest.fn<(keys: string | string[]) => Promise<Record<string, unknown>>>(),
      },
    },
  },
}));

// Dynamic imports after mock registration
const { browser } = await import('wxt/browser');
const { registerSettingsHandlers, setSettingsStore, setSettingsApiClient } = await import(
  '../../../src/handlers/settings.handlers'
);
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ============================================
// Mock ISettingsStore
// ============================================

type MockSettingsStore = {
  getSettings: jest.Mock<() => Promise<Record<string, unknown>>>;
  updateSettings: jest.Mock<(updates: Record<string, unknown>) => Promise<void>>;
  getApiKey: jest.Mock<(provider: string) => Promise<string | null>>;
  setApiKey: jest.Mock<(provider: string, key: string) => Promise<void>>;
  subscribe: jest.Mock<(cb: (settings: unknown) => void) => () => void>;
};

function createMockStore(): MockSettingsStore {
  return {
    getSettings: jest.fn<() => Promise<Record<string, unknown>>>(),
    updateSettings: jest.fn<(updates: Record<string, unknown>) => Promise<void>>(),
    getApiKey: jest.fn<(provider: string) => Promise<string | null>>(),
    setApiKey: jest.fn<(provider: string, key: string) => Promise<void>>(),
    subscribe: jest.fn<(cb: (settings: unknown) => void) => () => void>(),
  };
}

// ============================================
// Mock IApiClient for TTS key validation
// ============================================

function createMockApiClient(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: true,
    validateLicense: jest.fn(),
    getSubscription: jest.fn(),
    getCreditBalance: jest.fn(),
    getCreditHistory: jest.fn(),
    createCheckout: jest.fn(),
    synthesize: jest.fn(),
    testApiKey: jest.fn(),
    ...overrides,
  } as any;
}

// ============================================
// Default settings fixture
// ============================================

const DEFAULT_SETTINGS = {
  mode: 'article' as const,
  provider: 'elevenlabs' as const,
  voice: 'Rachel',
  speed: 1.0,
  showCostEstimate: true,
  cacheEnabled: true,
  maxCacheSize: 100,
  wordSyncEnabled: false,
};

// ============================================
// Mock Response for jsdom (not natively available)
// ============================================

function createMockResponse(body: string, init: { status: number }): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: '',
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    body: null,
    bodyUsed: false,
    clone: () => createMockResponse(body, init),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ============================================
// Tests
// ============================================

describe('Settings Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockStore: MockSettingsStore;
  let mockApiClient: ReturnType<typeof createMockApiClient>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    registry = new HandlerRegistry();
    mockStore = createMockStore();
    mockApiClient = createMockApiClient();
    setSettingsStore(mockStore as never);
    setSettingsApiClient(mockApiClient);
    registerSettingsHandlers(registry);
    originalFetch = globalThis.fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ------------------------------------------
  // Registration
  // ------------------------------------------

  describe('registration', () => {
    it('should register all settings handlers', () => {
      expect(registry.has('settings.get')).toBe(true);
      expect(registry.has('settings.update')).toBe(true);
      expect(registry.has('settings.getApiKey')).toBe(true);
      expect(registry.has('settings.setApiKey')).toBe(true);
      expect(registry.has('settings.testApiKey')).toBe(true);
      expect(registry.has('settings.getTheme')).toBe(true);
      expect(registry.has('settings.setTheme')).toBe(true);
      expect(registry.has('settings.resetSection')).toBe(true);
    });
  });

  // ------------------------------------------
  // settings.get
  // ------------------------------------------

  describe('settings.get', () => {
    it('should return settings from the store', async () => {
      mockStore.getSettings.mockResolvedValue(DEFAULT_SETTINGS);

      const result = await registry.dispatch('settings.get', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; settings: typeof DEFAULT_SETTINGS };
        expect(response.success).toBe(true);
        expect(response.settings).toEqual(DEFAULT_SETTINGS);
      }
      expect(mockStore.getSettings).toHaveBeenCalledTimes(1);
    });

    it('should propagate store errors as execution_failed', async () => {
      mockStore.getSettings.mockRejectedValue(new Error('Storage read failure'));

      const result = await registry.dispatch('settings.get', {});

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('Storage read failure');
      }
    });
  });

  // ------------------------------------------
  // settings.update
  // ------------------------------------------

  describe('settings.update', () => {
    it('should update settings using a settings object', async () => {
      mockStore.updateSettings.mockResolvedValue(undefined);

      const updates = { speed: 1.5, cacheEnabled: false };
      const result = await registry.dispatch('settings.update', { settings: updates });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean };
        expect(response.success).toBe(true);
      }
      expect(mockStore.updateSettings).toHaveBeenCalledWith(updates);
    });

    it('should update settings using individual fields (backward compat)', async () => {
      mockStore.updateSettings.mockResolvedValue(undefined);

      const result = await registry.dispatch('settings.update', {
        mode: 'selection',
        speed: 2.0,
        wordSyncEnabled: true,
      });

      expect(result.ok).toBe(true);
      expect(mockStore.updateSettings).toHaveBeenCalledWith({
        mode: 'selection',
        speed: 2.0,
        wordSyncEnabled: true,
      });
    });

    it('should merge individual fields over settings object', async () => {
      mockStore.updateSettings.mockResolvedValue(undefined);

      const result = await registry.dispatch('settings.update', {
        settings: { speed: 1.0 },
        speed: 2.0,
      });

      expect(result.ok).toBe(true);
      // Individual field overrides settings object
      expect(mockStore.updateSettings).toHaveBeenCalledWith({ speed: 2.0 });
    });

    it('should propagate store errors as execution_failed', async () => {
      mockStore.updateSettings.mockRejectedValue(new Error('Write failed'));

      const result = await registry.dispatch('settings.update', { speed: 1.5 });

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('Write failed');
      }
    });
  });

  // ------------------------------------------
  // settings.getApiKey
  // ------------------------------------------

  describe('settings.getApiKey', () => {
    it('should return hasKey:true when key exists', async () => {
      mockStore.getApiKey.mockResolvedValue('sk-test-key-123');

      const result = await registry.dispatch('settings.getApiKey', { provider: 'elevenlabs' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; hasKey: boolean };
        expect(response.success).toBe(true);
        expect(response.hasKey).toBe(true);
      }
    });

    it('should return hasKey:false when key is null', async () => {
      mockStore.getApiKey.mockResolvedValue(null);

      const result = await registry.dispatch('settings.getApiKey', { provider: 'elevenlabs' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; hasKey: boolean };
        expect(response.hasKey).toBe(false);
      }
    });

    it('should return hasKey:false for invalid provider without calling store', async () => {
      const result = await registry.dispatch('settings.getApiKey', {
        provider: 'invalid-provider',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; hasKey: boolean };
        expect(response.hasKey).toBe(false);
      }
      expect(mockStore.getApiKey).not.toHaveBeenCalled();
    });

  });

  // ------------------------------------------
  // settings.setApiKey
  // ------------------------------------------

  describe('settings.setApiKey', () => {
    it('should set API key for a valid provider', async () => {
      mockStore.setApiKey.mockResolvedValue(undefined);

      const result = await registry.dispatch('settings.setApiKey', {
        provider: 'elevenlabs',
        key: 'sk-new-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean };
        expect(response.success).toBe(true);
      }
      expect(mockStore.setApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-new-key');
    });

    it('should throw for invalid provider', async () => {
      const result = await registry.dispatch('settings.setApiKey', {
        provider: 'invalid-provider',
        key: 'sk-key',
      });

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('Invalid provider: invalid-provider');
      }
      expect(mockStore.setApiKey).not.toHaveBeenCalled();
    });

    it('should throw when key is missing', async () => {
      const result = await registry.dispatch('settings.setApiKey', {
        provider: 'elevenlabs',
      });

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('API key is required');
      }
      expect(mockStore.setApiKey).not.toHaveBeenCalled();
    });

    it('should throw when key is empty string', async () => {
      const result = await registry.dispatch('settings.setApiKey', {
        provider: 'elevenlabs',
        key: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('API key is required');
      }
    });

  });

  // ------------------------------------------
  // settings.testApiKey — TTS providers via server
  // ------------------------------------------

  describe('settings.testApiKey (TTS providers via server)', () => {
    it('should route elevenlabs through settingsApiClient.testApiKey', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'elevenlabs', latencyMs: 120 },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: 'sk-valid-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
        expect(response.message).toBe('API key is valid');
      }
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-valid-key');
    });

    it('should route openai through settingsApiClient.testApiKey', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'openai', latencyMs: 80 },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'openai',
        apiKey: 'sk-openai-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
      }
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('openai', 'sk-openai-key');
    });

    it('should route groq through settingsApiClient.testApiKey', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'groq' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'groq',
        apiKey: 'gsk-groq-key',
      });

      expect(result.ok).toBe(true);
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('groq', 'gsk-groq-key');
    });

    it('should route cartesia through settingsApiClient.testApiKey', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'cartesia' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'cartesia',
        apiKey: 'cart-key',
      });

      expect(result.ok).toBe(true);
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('cartesia', 'cart-key');
    });

    it('should return failure when server reports invalid key', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: false, provider: 'elevenlabs', error: 'Invalid API key' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: 'sk-bad-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toBe('Invalid API key');
      }
    });

    it('should return failure when api client returns Err', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: false,
        error: { type: 'network', message: 'Network error' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: 'sk-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toBe('Network error');
      }
    });

    it('should return failure when settingsApiClient is not configured', async () => {
      setSettingsApiClient(createMockApiClient({ isConfigured: false }));

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: 'sk-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toContain('Proso server not configured');
      }
    });

    it('should return failure when settingsApiClient is null', async () => {
      setSettingsApiClient(null as any);

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: 'sk-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toContain('Proso server not configured');
      }
    });

    it('should handle wrapped data format for TTS provider', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'elevenlabs' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: '',
        data: { provider: 'elevenlabs', apiKey: 'sk-wrapped-key' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
      }
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-wrapped-key');
    });

    it('should trim whitespace from API key before testing via server', async () => {
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'elevenlabs' },
      });

      await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
        apiKey: '  sk-spaced-key  ',
      });

      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-spaced-key');
    });

    it('should fall back to storage when no key in params', async () => {
      mockStore.getApiKey.mockResolvedValue('sk-stored-key');
      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'elevenlabs' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
      }
      expect(mockStore.getApiKey).toHaveBeenCalledWith('elevenlabs');
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-stored-key');
    });
  });

  // ------------------------------------------
  // settings.testApiKey — Non-TTS providers (anthropic) via direct fetch
  // ------------------------------------------

  describe('settings.testApiKey (anthropic via direct fetch)', () => {
    it('should test anthropic provider with POST and correct headers', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
        createMockResponse(JSON.stringify({}), { status: 200 }),
      );

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'anthropic',
        apiKey: 'ant-key-123',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
      }
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'x-api-key': 'ant-key-123',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: expect.any(String),
        }),
      );
      // Should NOT go through settingsApiClient for anthropic
      expect(mockApiClient.testApiKey).not.toHaveBeenCalled();
    });

    it('should return failure on anthropic 401 response', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
        createMockResponse('Unauthorized', { status: 401 }),
      );

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'anthropic',
        apiKey: 'ant-bad-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toBe('Invalid API key');
      }
    });

    it('should return failure on anthropic network error', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(
        new Error('Failed to fetch'),
      );

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'anthropic',
        apiKey: 'ant-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toBe('Failed to fetch');
      }
    });

    it('should handle anthropic rate limiting (429)', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
        createMockResponse('Rate limited', { status: 429 }),
      );

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'anthropic',
        apiKey: 'ant-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toContain('Rate limited');
      }
    });

    it('should handle anthropic unexpected HTTP status codes', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
        createMockResponse('Server Error', { status: 500 }),
      );

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'anthropic',
        apiKey: 'ant-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toContain('500');
      }
    });
  });

  // ------------------------------------------
  // settings.testApiKey — Common behavior
  // ------------------------------------------

  describe('settings.testApiKey (common)', () => {
    it('should return failure for completely invalid provider', async () => {
      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'invalid-provider',
        apiKey: 'sk-key',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toContain('Invalid provider');
      }
    });

    it('should return failure when no API key is provided or stored', async () => {
      mockStore.getApiKey.mockResolvedValue(null);

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; error?: string };
        expect(response.success).toBe(false);
        expect(response.error).toBe('No API key provided');
      }
    });

    it('should fall back to browser.storage.local when store throws', async () => {
      mockStore.getApiKey.mockRejectedValue(new Error('Store broken'));

      const mockGet = browser.storage.local.get as unknown as jest.Mock<
        (keys: string | string[]) => Promise<Record<string, unknown>>
      >;
      mockGet.mockResolvedValue({ elevenlabsApiKey: 'sk-browser-key' });

      mockApiClient.testApiKey.mockResolvedValue({
        ok: true,
        value: { success: true, provider: 'elevenlabs' },
      });

      const result = await registry.dispatch('settings.testApiKey', {
        provider: 'elevenlabs',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; message?: string };
        expect(response.success).toBe(true);
      }
      expect(mockGet).toHaveBeenCalledWith('elevenlabsApiKey');
      expect(mockApiClient.testApiKey).toHaveBeenCalledWith('elevenlabs', 'sk-browser-key');
    });
  });

  // ------------------------------------------
  // Store not initialized
  // ------------------------------------------

  describe('store not initialized', () => {
    it('should surface initialization error via execution_failed', async () => {
      const freshRegistry = new HandlerRegistry();
      mockStore.getSettings.mockRejectedValue(
        new Error('Settings store not initialized. Call setSettingsStore() first.'),
      );
      registerSettingsHandlers(freshRegistry);

      const result = await freshRegistry.dispatch('settings.get', {});

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'execution_failed') {
        expect(result.error.message).toContain('Settings store not initialized');
      }
    });
  });

  // ------------------------------------------
  // Dispatch via registry
  // ------------------------------------------

  describe('dispatch via registry', () => {
    it('should return not_found for unregistered handler', async () => {
      const result = await registry.dispatch('settings.nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('settings.nonexistent');
      }
    });

    it('should dispatch multiple handlers on the same registry', async () => {
      mockStore.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStore.getApiKey.mockResolvedValue('sk-key');

      const [getResult, apiKeyResult] = await Promise.all([
        registry.dispatch('settings.get', {}),
        registry.dispatch('settings.getApiKey', { provider: 'elevenlabs' }),
      ]);

      expect(getResult.ok).toBe(true);
      expect(apiKeyResult.ok).toBe(true);
    });
  });
});
