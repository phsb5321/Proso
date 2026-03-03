// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for audio message handlers.
 *
 * Tests all four audio handlers registered via registerAudioHandlers:
 *   - audio.getVoices
 *   - audio.setVoice
 *   - audio.validateCredentials
 *   - audio.generate
 *
 * @module tests/unit/handlers/audio.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic imports)
// ---------------------------------------------------------------------------

const mockAudioGenerator = {
  getVoices: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  validateCredentials: jest.fn<() => Promise<boolean>>(),
  generateAudio: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  providerId: 'elevenlabs' as string,
  supportsWordTiming: true,
  supportedLanguages: [] as readonly string[],
};

const mockSettingsStore = {
  updateSettings: jest.fn<(...args: unknown[]) => Promise<void>>(),
};

const mockContainer = {
  adapters: {
    audioGenerator: mockAudioGenerator,
    settingsStore: mockSettingsStore,
  },
};

const mockGetContainer = jest.fn(() => mockContainer);
const mockIsContainerInitialized = jest.fn(() => true);

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getContainer: mockGetContainer,
  isContainerInitialized: mockIsContainerInitialized,
}));

const mockCreateAudioUrl = jest.fn<(...args: unknown[]) => Promise<string>>(
  async () => 'blob:mock-url',
);

jest.unstable_mockModule(resolve(srcDir, 'utils/audio/audio-url'), () => ({
  createAudioUrl: mockCreateAudioUrl,
}));

// Dynamic imports after mocks are wired
const { registerAudioHandlers } = await import('../../../src/handlers/audio.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch a handler and unwrap the outer registry Result envelope. */
async function dispatchOk(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
): Promise<unknown> {
  const outer = await registry.dispatch(name, params);
  expect(outer.ok).toBe(true);
  if (!outer.ok) throw new Error('dispatch failed unexpectedly');
  return outer.value;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('audio.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerAudioHandlers(registry);

    // Reset all mocks to defaults
    jest.clearAllMocks();
    mockIsContainerInitialized.mockReturnValue(true);
    mockGetContainer.mockReturnValue(mockContainer);
    mockAudioGenerator.providerId = 'elevenlabs';
    mockCreateAudioUrl.mockImplementation(async () => 'blob:mock-url');
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all four audio handlers', () => {
      expect(registry.has('audio.getVoices')).toBe(true);
      expect(registry.has('audio.setVoice')).toBe(true);
      expect(registry.has('audio.validateCredentials')).toBe(true);
      expect(registry.has('audio.generate')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // audio.getVoices
  // -----------------------------------------------------------------------

  describe('audio.getVoices', () => {
    it('should return voices on success', async () => {
      const voices = [
        { id: 'v1', name: 'Alice', language: 'en', gender: 'female' },
        { id: 'v2', name: 'Bob', language: 'en', gender: 'male' },
      ];
      mockAudioGenerator.getVoices.mockResolvedValue({ ok: true, value: voices });

      const result = (await dispatchOk(registry, 'audio.getVoices', {
        language: 'en',
      })) as { ok: boolean; value?: { voices: unknown[] }; error?: { type: string } };

      expect(result.ok).toBe(true);
      expect(result.value!.voices).toEqual(voices);
      expect(mockAudioGenerator.getVoices).toHaveBeenCalledWith('en');
    });

    it('should return empty voices when audioGenerator returns error', async () => {
      mockAudioGenerator.getVoices.mockResolvedValue({
        ok: false,
        error: { type: 'network', message: 'timeout' },
      });

      const result = (await dispatchOk(registry, 'audio.getVoices', {})) as {
        ok: boolean;
        value?: { voices: unknown[] };
      };

      expect(result.ok).toBe(true);
      expect(result.value!.voices).toEqual([]);
    });

    it('should return container_not_initialized when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'audio.getVoices', {})) as {
        ok: boolean;
        error?: { type: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('container_not_initialized');
    });

    it('should return operation_failed when getVoices throws', async () => {
      mockAudioGenerator.getVoices.mockRejectedValue(new Error('unexpected'));

      const result = (await dispatchOk(registry, 'audio.getVoices', {})) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('operation_failed');
      expect(result.error!.message).toBe('unexpected');
    });
  });

  // -----------------------------------------------------------------------
  // audio.setVoice
  // -----------------------------------------------------------------------

  describe('audio.setVoice', () => {
    it('should update settings and return success', async () => {
      mockSettingsStore.updateSettings.mockResolvedValue(undefined);

      const result = (await dispatchOk(registry, 'audio.setVoice', {
        voiceId: 'v1',
      })) as { ok: boolean; value?: { success: boolean } };

      expect(result.ok).toBe(true);
      expect(result.value!.success).toBe(true);
      expect(mockSettingsStore.updateSettings).toHaveBeenCalledWith({ voice: 'v1' });
    });

    it('should return invalid_params when voiceId is empty', async () => {
      const result = (await dispatchOk(registry, 'audio.setVoice', {
        voiceId: '',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return invalid_params when voiceId is missing', async () => {
      const result = (await dispatchOk(registry, 'audio.setVoice', {})) as {
        ok: boolean;
        error?: { type: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return container_not_initialized when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'audio.setVoice', {
        voiceId: 'v1',
      })) as { ok: boolean; error?: { type: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('container_not_initialized');
    });

    it('should return operation_failed when updateSettings throws', async () => {
      mockSettingsStore.updateSettings.mockRejectedValue(new Error('storage full'));

      const result = (await dispatchOk(registry, 'audio.setVoice', {
        voiceId: 'v1',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('operation_failed');
      expect(result.error!.message).toBe('storage full');
    });
  });

  // -----------------------------------------------------------------------
  // audio.validateCredentials
  // -----------------------------------------------------------------------

  describe('audio.validateCredentials', () => {
    it('should return valid=true when credentials are valid', async () => {
      mockAudioGenerator.validateCredentials.mockResolvedValue(true);

      const result = (await dispatchOk(registry, 'audio.validateCredentials', {})) as {
        ok: boolean;
        value?: { valid: boolean; message?: string };
      };

      expect(result.ok).toBe(true);
      expect(result.value!.valid).toBe(true);
      expect(result.value!.message).toBe('API key is valid');
    });

    it('should return valid=false when credentials are invalid', async () => {
      mockAudioGenerator.validateCredentials.mockResolvedValue(false);

      const result = (await dispatchOk(registry, 'audio.validateCredentials', {})) as {
        ok: boolean;
        value?: { valid: boolean; message?: string };
      };

      expect(result.ok).toBe(true);
      expect(result.value!.valid).toBe(false);
      expect(result.value!.message).toBe('API key validation failed');
    });

    it('should return container_not_initialized when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = (await dispatchOk(
        registry,
        'audio.validateCredentials',
        {},
      )) as { ok: boolean; error?: { type: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('container_not_initialized');
    });

    it('should return valid=false (not Err) when validateCredentials throws', async () => {
      mockAudioGenerator.validateCredentials.mockRejectedValue(
        new Error('network failure'),
      );

      const result = (await dispatchOk(registry, 'audio.validateCredentials', {})) as {
        ok: boolean;
        value?: { valid: boolean; message?: string };
      };

      // The handler wraps thrown errors as Ok({ valid: false, message }) —
      // it intentionally does not return Err here.
      expect(result.ok).toBe(true);
      expect(result.value!.valid).toBe(false);
      expect(result.value!.message).toBe('network failure');
    });
  });

  // -----------------------------------------------------------------------
  // audio.generate
  // -----------------------------------------------------------------------

  describe('audio.generate', () => {
    const validRequest = {
      text: 'Hello world',
      voice: 'v1',
      speed: 1.0,
      language: 'en',
    };

    it('should generate audio and return URL with timings', async () => {
      const wordTimings = [
        { word: 'Hello', startMs: 0, endMs: 500 },
        { word: 'world', startMs: 500, endMs: 1000 },
      ];
      mockAudioGenerator.generateAudio.mockResolvedValue({
        ok: true,
        value: {
          audioBlob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
          durationMs: 1000,
          wordTimings,
        },
      });

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        value?: { audioUrl: string; durationMs: number; wordTimings: unknown[] | null };
      };

      expect(result.ok).toBe(true);
      expect(result.value!.audioUrl).toBe('blob:mock-url');
      expect(result.value!.durationMs).toBe(1000);
      expect(result.value!.wordTimings).toEqual(wordTimings);
      expect(mockAudioGenerator.generateAudio).toHaveBeenCalledWith(validRequest);
      expect(mockCreateAudioUrl).toHaveBeenCalled();
    });

    it('should handle null wordTimings', async () => {
      mockAudioGenerator.generateAudio.mockResolvedValue({
        ok: true,
        value: {
          audioBlob: new Blob(['data']),
          durationMs: 500,
          wordTimings: null,
        },
      });

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        value?: { wordTimings: unknown[] | null };
      };

      expect(result.ok).toBe(true);
      expect(result.value!.wordTimings).toBeNull();
    });

    it('should return invalid_params when text is empty', async () => {
      const result = (await dispatchOk(registry, 'audio.generate', {
        ...validRequest,
        text: '',
      })) as { ok: boolean; error?: { type: string; message: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return invalid_params when text is missing', async () => {
      const result = (await dispatchOk(registry, 'audio.generate', {
        voice: 'v1',
        speed: 1.0,
        language: 'en',
      })) as { ok: boolean; error?: { type: string } };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('invalid_params');
    });

    it('should return container_not_initialized when container is not ready', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        error?: { type: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('container_not_initialized');
    });

    it('should return operation_failed when generateAudio returns an error result', async () => {
      mockAudioGenerator.generateAudio.mockResolvedValue({
        ok: false,
        error: { type: 'network', message: 'Connection refused' },
      });

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('operation_failed');
      expect(result.error!.message).toBeDefined();
    });

    it('should return operation_failed when generateAudio throws', async () => {
      mockAudioGenerator.generateAudio.mockRejectedValue(new Error('out of memory'));

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('operation_failed');
      expect(result.error!.message).toBe('out of memory');
    });

    it('should return operation_failed when createAudioUrl throws', async () => {
      mockAudioGenerator.generateAudio.mockResolvedValue({
        ok: true,
        value: {
          audioBlob: new Blob(['data']),
          durationMs: 500,
          wordTimings: null,
        },
      });
      mockCreateAudioUrl.mockRejectedValue(new Error('blob creation failed'));

      const result = (await dispatchOk(registry, 'audio.generate', validRequest)) as {
        ok: boolean;
        error?: { type: string; message: string };
      };

      expect(result.ok).toBe(false);
      expect(result.error!.type).toBe('operation_failed');
      expect(result.error!.message).toBe('blob creation failed');
    });
  });
});
