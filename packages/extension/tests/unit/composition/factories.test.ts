/**
 * Factory Unit Tests
 *
 * Tests for createAudioGeneratorAdapter and related factory functions.
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
const { ElevenLabsAudioAdapter } = await import(
  '../../../src/adapters/audio/elevenlabs-audio.adapter'
);
const { OpenAiAudioAdapter } = await import(
  '../../../src/adapters/audio/openai-audio.adapter'
);
const { GroqAudioAdapter } = await import(
  '../../../src/adapters/audio/groq-audio.adapter'
);
const { CartesiaAudioAdapter } = await import(
  '../../../src/adapters/audio/cartesia-audio.adapter'
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
  ElevenLabsAudioAdapter,
  OpenAiAudioAdapter,
  GroqAudioAdapter,
  CartesiaAudioAdapter,
  AudioUrlAdapter,
  ServerTtsAudioAdapter,
  OffscreenAudioAdapter: jest.fn(),
  DirectAudioAdapter: jest.fn(),
}));

// Mock heavy adapter barrels that factories.ts imports transitively.
// These are not needed for audio factory tests and may hang in jsdom
// (e.g., Dexie/IndexedDB init, Readability DOM parsing).
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

describe('createAudioGeneratorAdapter', () => {
  it('should return BrowserTtsAudioAdapter for provider "browser"', () => {
    const adapter = createAudioGeneratorAdapter('browser', null);
    expect(adapter).toBeInstanceOf(BrowserTtsAudioAdapter);
    expect(adapter.providerId).toBe('browser');
  });

  it('should return ElevenLabsAudioAdapter for provider "elevenlabs"', () => {
    const adapter = createAudioGeneratorAdapter('elevenlabs', 'test-api-key');
    expect(adapter).toBeInstanceOf(ElevenLabsAudioAdapter);
    expect(adapter.providerId).toBe('elevenlabs');
  });

  it('should throw for ElevenLabs when no API key is provided', () => {
    expect(() => createAudioGeneratorAdapter('elevenlabs', null)).toThrow(
      'API key is required',
    );
  });

  it('should throw for unknown provider', () => {
    expect(() =>
      createAudioGeneratorAdapter('unknown-provider' as any, null),
    ).toThrow('API key is required');
  });

  it('should not require API key for browser provider', () => {
    // Should not throw even with null apiKey
    expect(() => createAudioGeneratorAdapter('browser', null)).not.toThrow();
  });
});

describe('getApiKeyForProvider', () => {
  it('should return elevenlabs key for elevenlabs provider', () => {
    const keys = { elevenlabs: 'test-key', openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'elevenlabs')).toBe('test-key');
  });

  it('should return null for browser provider', () => {
    const keys = { elevenlabs: 'test-key', openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'browser')).toBeNull();
  });

  it('should return null for elevenlabs when key is null', () => {
    const keys = { elevenlabs: null, openai: null, groq: null, cartesia: null };
    expect(getApiKeyForProvider(keys, 'elevenlabs')).toBeNull();
  });
});
