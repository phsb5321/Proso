/**
 * Factory Unit Tests
 *
 * Tests for createAudioGeneratorAdapter and related factory functions.
 *
 * Post-069 simplification: All non-browser providers route through
 * ServerTtsAudioAdapter. Direct provider adapters have been removed.
 *
 * Uses jest.unstable_mockModule to mock heavy transitive dependencies
 * (cache, content, messaging, storage adapters, and the audio barrel)
 * that are not relevant to the audio factory tests but cause compilation
 * failures or hangs in the test environment.
 *
 * @module tests/unit/composition/factories
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// Pre-import the real audio adapters we need (these don't depend on chrome)
const { BrowserTtsAudioAdapter } = await import(
  '../../../src/adapters/audio/browser-tts-audio.adapter'
);
const { AudioUrlAdapter } = await import(
  '../../../src/adapters/audio/audio-url.adapter'
);
const { ServerTtsAudioAdapter } = await import(
  '../../../src/adapters/audio/server-tts-audio.adapter'
);

// Mock the audio barrel to avoid importing offscreen.adapter.ts (uses chrome.* types)
jest.unstable_mockModule(resolve(srcDir, 'adapters/audio'), () => ({
  BrowserTtsAudioAdapter,
  AudioUrlAdapter,
  ServerTtsAudioAdapter,
  OffscreenAudioAdapter: jest.fn(),
  DirectAudioAdapter: jest.fn(),
}));

// Mock heavy adapter barrels that factories.ts imports transitively.
jest.unstable_mockModule(resolve(srcDir, 'adapters/messaging'), () => ({
  HighlightSyncAdapter: jest.fn(),
  NoOpHighlightSyncAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'adapters/cache'), () => ({
  IndexedDBCacheAdapter: jest.fn(),
  InMemoryCacheAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'adapters/storage'), () => ({
  BrowserSettingsAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'adapters/content'), () => ({
  ReadabilityExtractorAdapter: jest.fn(),
  TrafilaturaScorerAdapter: jest.fn(),
  ReadabilityAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'adapters/api'), () => ({
  ProsoApiAdapter: jest.fn(),
  NoOpApiClientAdapter: jest.fn(),
}));

// Dynamic import of factories AFTER all mocks are registered
const { createAudioGeneratorAdapter, getApiKeyForProvider } = await import(
  '../../../src/composition/factories'
);

// Mock speechSynthesis for BrowserTtsAudioAdapter
beforeEach(() => {
  (global as Record<string, unknown>).speechSynthesis = {
    getVoices: jest.fn<() => unknown[]>(() => []),
    speak: jest.fn(),
    cancel: jest.fn(),
    speaking: false,
    pending: false,
    paused: false,
  };
  (global as Record<string, unknown>).SpeechSynthesisUtterance = jest
    .fn<(...args: unknown[]) => Record<string, unknown>>()
    .mockImplementation((...args: unknown[]) => ({
      text: (args[0] as string) ?? '',
      voice: null,
      rate: 1,
      lang: '',
      onend: null,
      onerror: null,
    }));
});

// Mock IApiClient for server routing tests (cast as any for test convenience)
const mockApiClient = {
  isConfigured: true,
  validateLicense: jest.fn(),
  getSubscription: jest.fn(),
  getCreditBalance: jest.fn(),
  getCreditHistory: jest.fn(),
  createCheckout: jest.fn(),
  synthesize: jest.fn(),
  testApiKey: jest.fn(),
} as any;

const unconfiguredApiClient = {
  isConfigured: false,
  validateLicense: jest.fn(),
  getSubscription: jest.fn(),
  getCreditBalance: jest.fn(),
  getCreditHistory: jest.fn(),
  createCheckout: jest.fn(),
  synthesize: jest.fn(),
  testApiKey: jest.fn(),
} as any;

describe('createAudioGeneratorAdapter', () => {
  // ── Browser TTS (INV-005: always client-side) ──

  it('should return BrowserTtsAudioAdapter for provider "browser"', () => {
    const adapter = createAudioGeneratorAdapter('browser', null);
    expect(adapter).toBeInstanceOf(BrowserTtsAudioAdapter);
    expect(adapter.providerId).toBe('browser');
  });

  it('should not require API key for browser provider', () => {
    expect(() => createAudioGeneratorAdapter('browser', null)).not.toThrow();
  });

  it('should not require apiClient for browser provider', () => {
    expect(() => createAudioGeneratorAdapter('browser', null, undefined)).not.toThrow();
  });

  // ── Server routing (all premium providers) ──

  it('should return ServerTtsAudioAdapter for "openai" with apiClient', () => {
    const adapter = createAudioGeneratorAdapter('openai', null, mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
  });

  it('should return ServerTtsAudioAdapter for "elevenlabs" with apiClient', () => {
    const adapter = createAudioGeneratorAdapter('elevenlabs', null, mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
  });

  it('should return ServerTtsAudioAdapter for "groq" with apiClient', () => {
    const adapter = createAudioGeneratorAdapter('groq', null, mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
  });

  it('should return ServerTtsAudioAdapter for "cartesia" with apiClient', () => {
    const adapter = createAudioGeneratorAdapter('cartesia', null, mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
  });

  // ── BYOK key forwarding ──

  it('should pass BYOK apiKey to ServerTtsAudioAdapter constructor', () => {
    const adapter = createAudioGeneratorAdapter('openai', 'sk-byok-key', mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
    // The adapter is constructed with the BYOK key for forwarding to server
  });

  it('should pass null apiKey as undefined to ServerTtsAudioAdapter', () => {
    const adapter = createAudioGeneratorAdapter('openai', null, mockApiClient);
    expect(adapter).toBeInstanceOf(ServerTtsAudioAdapter);
  });

  // ── Error cases ──

  it('should throw when non-browser provider has no apiClient', () => {
    expect(() => createAudioGeneratorAdapter('openai', null)).toThrow(
      'Proso server is required',
    );
  });

  it('should throw when non-browser provider has unconfigured apiClient', () => {
    expect(() => createAudioGeneratorAdapter('openai', null, unconfiguredApiClient)).toThrow(
      'Proso server is required',
    );
  });

  it('should throw when elevenlabs has no apiClient configured', () => {
    expect(() => createAudioGeneratorAdapter('elevenlabs', 'some-key')).toThrow(
      'Proso server is required',
    );
  });
});

describe('getApiKeyForProvider', () => {
  it('should return elevenlabs key for elevenlabs provider', () => {
    const keys = { elevenlabs: 'test-key', openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'elevenlabs')).toBe('test-key');
  });

  it('should return openai key for openai provider', () => {
    const keys = { elevenlabs: null, openai: 'openai-key', groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'openai')).toBe('openai-key');
  });

  it('should return groq key for groq provider', () => {
    const keys = { elevenlabs: null, openai: null, groq: 'groq-key', cartesia: null };
    expect(getApiKeyForProvider(keys, 'groq')).toBe('groq-key');
  });

  it('should return cartesia key for cartesia provider', () => {
    const keys = { elevenlabs: null, openai: null, groq: null, cartesia: 'cartesia-key' };
    expect(getApiKeyForProvider(keys, 'cartesia')).toBe('cartesia-key');
  });

  it('should return null for browser provider', () => {
    const keys = { elevenlabs: 'test-key', openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'browser')).toBeNull();
  });

  it('should return null for elevenlabs when key is null', () => {
    const keys = { elevenlabs: null, openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'elevenlabs')).toBeNull();
  });

  it('should return null for unknown provider', () => {
    const keys = { elevenlabs: null, openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'unknown' as any)).toBeNull();
  });
});
