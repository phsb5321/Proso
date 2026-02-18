/**
 * TTS Provider Adapter Contract Tests
 *
 * Verifies that all TTS adapters (OpenAI, ElevenLabs, Groq) conform
 * to the TTSProviderPort abstract class contract. Uses mocked fetch()
 * and ConfigService — NOT integration tests hitting real APIs.
 *
 * @module tests/contract/tts-provider.adapter
 */

import type { ConfigService } from '@nestjs/config';
import { ErrorCode, TTSProvider, isErr, isOk } from '@voxpage/shared';
import { ElevenLabsTTSAdapter } from '../../src/adapters/tts/elevenlabs-tts.adapter';
import { GroqTTSAdapter } from '../../src/adapters/tts/groq-tts.adapter';
import { OpenAITTSAdapter } from '../../src/adapters/tts/openai-tts.adapter';
import type { TTSProviderPort, TTSSynthesizeParams } from '../../src/ports/tts-provider.port';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfigService(
  overrides: Record<string, string | undefined> = {},
): jest.Mocked<ConfigService> {
  return {
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as jest.Mocked<ConfigService>;
}

function createSuccessResponse(body: ArrayBuffer = new ArrayBuffer(128)): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(''),
    json: jest.fn().mockResolvedValue({}),
    headers: new Headers(),
  } as unknown as Response;
}

function createErrorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(body),
    arrayBuffer: jest.fn(),
    headers: new Headers(),
  } as unknown as Response;
}

const DEFAULT_REQUEST: TTSSynthesizeParams = {
  text: 'Hello, this is a contract test.',
};

// ---------------------------------------------------------------------------
// Contract: Shared behavior all adapters MUST satisfy
// ---------------------------------------------------------------------------

interface AdapterFactory {
  name: string;
  providerId: TTSProvider;
  apiKeyEnvVar: string;
  create(config: jest.Mocked<ConfigService>): TTSProviderPort;
  expectedUrl: string | RegExp;
  expectedAuthHeader: { key: string; valuePrefix: string };
  defaultVoice: string;
  hasStaticVoices: boolean;
}

const adapters: AdapterFactory[] = [
  {
    name: 'OpenAITTSAdapter',
    providerId: TTSProvider.OpenAI,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    create: (config) => new OpenAITTSAdapter(config),
    expectedUrl: 'https://api.openai.com/v1/audio/speech',
    expectedAuthHeader: { key: 'Authorization', valuePrefix: 'Bearer ' },
    defaultVoice: 'alloy',
    hasStaticVoices: true,
  },
  {
    name: 'ElevenLabsTTSAdapter',
    providerId: TTSProvider.ElevenLabs,
    apiKeyEnvVar: 'ELEVENLABS_API_KEY',
    create: (config) => new ElevenLabsTTSAdapter(config),
    expectedUrl: /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/.+/,
    expectedAuthHeader: { key: 'xi-api-key', valuePrefix: '' },
    defaultVoice: '21m00Tcm4TlvDq8ikWAM',
    hasStaticVoices: false,
  },
  {
    name: 'GroqTTSAdapter',
    providerId: TTSProvider.Groq,
    apiKeyEnvVar: 'GROQ_API_KEY',
    create: (config) => new GroqTTSAdapter(config),
    expectedUrl: 'https://api.groq.com/openai/v1/audio/speech',
    expectedAuthHeader: { key: 'Authorization', valuePrefix: 'Bearer ' },
    defaultVoice: 'Fritz-PlayAI',
    hasStaticVoices: true,
  },
];

// Store original fetch
const originalFetch = global.fetch;

describe('TTS Provider Contract Tests', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // Run the same contract suite for every adapter
  for (const adapterDef of adapters) {
    describe(`${adapterDef.name} contract`, () => {
      // ---------------------------------------------------------------
      // Identity
      // ---------------------------------------------------------------

      describe('identity', () => {
        it(`has providerId === TTSProvider.${TTSProvider[adapterDef.providerId as unknown as keyof typeof TTSProvider] ?? adapterDef.providerId}`, () => {
          const config = createMockConfigService();
          const adapter = adapterDef.create(config);
          expect(adapter.providerId).toBe(adapterDef.providerId);
        });

        it('has a non-empty supportedLanguages array', () => {
          const config = createMockConfigService();
          const adapter = adapterDef.create(config);
          expect(Array.isArray(adapter.supportedLanguages)).toBe(true);
          expect(adapter.supportedLanguages.length).toBeGreaterThan(0);
          adapter.supportedLanguages.forEach((lang) => {
            expect(typeof lang).toBe('string');
          });
        });
      });

      // ---------------------------------------------------------------
      // synthesize() contract
      // ---------------------------------------------------------------

      describe('synthesize()', () => {
        it('returns Err(ProviderUnavailable) when API key is not configured', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: undefined });
          const adapter = adapterDef.create(config);

          const result = await adapter.synthesize(DEFAULT_REQUEST);

          expect(isErr(result)).toBe(true);
          if (!result.ok) {
            expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
          }
          // fetch should NOT be called when key is missing
          expect(mockFetch).not.toHaveBeenCalled();
        });

        it('returns Err(ProviderUnavailable) on HTTP error response', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createErrorResponse(429, 'Rate limited'));

          const result = await adapter.synthesize(DEFAULT_REQUEST);

          expect(isErr(result)).toBe(true);
          if (!result.ok) {
            expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
          }
        });

        it('returns Err(ProviderUnavailable) on network error', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

          const result = await adapter.synthesize(DEFAULT_REQUEST);

          expect(isErr(result)).toBe(true);
          if (!result.ok) {
            expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
          }
        });

        it('returns Ok with audio Buffer and audio/mpeg contentType on success', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          const fakeAudio = new ArrayBuffer(256);
          mockFetch.mockResolvedValue(createSuccessResponse(fakeAudio));

          const result = await adapter.synthesize(DEFAULT_REQUEST);

          expect(isOk(result)).toBe(true);
          if (result.ok) {
            expect(Buffer.isBuffer(result.value.audio)).toBe(true);
            expect(result.value.audio.byteLength).toBe(256);
            expect(result.value.contentType).toBe('audio/mpeg');
            expect(result.value.provider).toBe(adapterDef.providerId);
          }
        });

        it('sends request to the correct API URL', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize(DEFAULT_REQUEST);

          expect(mockFetch).toHaveBeenCalledTimes(1);
          const [calledUrl] = mockFetch.mock.calls[0];
          if (typeof adapterDef.expectedUrl === 'string') {
            expect(calledUrl).toBe(adapterDef.expectedUrl);
          } else {
            expect(calledUrl).toMatch(adapterDef.expectedUrl);
          }
        });

        it('sends the correct auth header', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'my-secret-key' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize(DEFAULT_REQUEST);

          const [, fetchOptions] = mockFetch.mock.calls[0];
          const headers = fetchOptions.headers as Record<string, string>;
          const authValue = headers[adapterDef.expectedAuthHeader.key];
          expect(authValue).toBeDefined();
          expect(authValue).toBe(`${adapterDef.expectedAuthHeader.valuePrefix}my-secret-key`);
        });

        it('uses default voice when request.voice is undefined', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize({ text: 'Test without voice' });

          const [, fetchOptions] = mockFetch.mock.calls[0];
          const body = JSON.parse(fetchOptions.body as string);

          // OpenAI/Groq use 'voice' field, ElevenLabs encodes voice in URL
          if (adapterDef.providerId === TTSProvider.ElevenLabs) {
            const [calledUrl] = mockFetch.mock.calls[0];
            expect(calledUrl).toContain(adapterDef.defaultVoice);
          } else {
            expect(body.voice).toBe(adapterDef.defaultVoice);
          }
        });

        it('uses provided voice when request.voice is set', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize({ text: 'Test with custom voice', voice: 'custom-voice-id' });

          const [, fetchOptions] = mockFetch.mock.calls[0];

          if (adapterDef.providerId === TTSProvider.ElevenLabs) {
            const [calledUrl] = mockFetch.mock.calls[0];
            expect(calledUrl).toContain('custom-voice-id');
          } else {
            const body = JSON.parse(fetchOptions.body as string);
            expect(body.voice).toBe('custom-voice-id');
          }
        });

        it('sends request text in the body', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize({ text: 'Specific test content' });

          const [, fetchOptions] = mockFetch.mock.calls[0];
          const body = JSON.parse(fetchOptions.body as string);

          // OpenAI/Groq use 'input', ElevenLabs uses 'text'
          if (adapterDef.providerId === TTSProvider.ElevenLabs) {
            expect(body.text).toBe('Specific test content');
          } else {
            expect(body.input).toBe('Specific test content');
          }
        });

        it('sends POST method', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize(DEFAULT_REQUEST);

          const [, fetchOptions] = mockFetch.mock.calls[0];
          expect(fetchOptions.method).toBe('POST');
        });

        it('sends Content-Type: application/json header', async () => {
          const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
          const adapter = adapterDef.create(config);
          mockFetch.mockResolvedValue(createSuccessResponse());

          await adapter.synthesize(DEFAULT_REQUEST);

          const [, fetchOptions] = mockFetch.mock.calls[0];
          const headers = fetchOptions.headers as Record<string, string>;
          expect(headers['Content-Type']).toBe('application/json');
        });
      });

      // ---------------------------------------------------------------
      // getVoices() contract
      // ---------------------------------------------------------------

      describe('getVoices()', () => {
        if (adapterDef.hasStaticVoices) {
          it('returns Ok with VoiceInfo[] (static voices, no API call)', async () => {
            const config = createMockConfigService();
            const adapter = adapterDef.create(config);

            const result = await adapter.getVoices();

            expect(isOk(result)).toBe(true);
            if (result.ok) {
              expect(Array.isArray(result.value)).toBe(true);
              expect(result.value.length).toBeGreaterThan(0);
              result.value.forEach((voice) => {
                expect(typeof voice.id).toBe('string');
                expect(typeof voice.name).toBe('string');
              });
            }
            // Static voices should NOT call fetch
            expect(mockFetch).not.toHaveBeenCalled();
          });
        } else {
          // ElevenLabs fetches voices dynamically
          it('returns Err(ProviderUnavailable) when API key is not configured', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: undefined });
            const adapter = adapterDef.create(config);

            const result = await adapter.getVoices();

            expect(isErr(result)).toBe(true);
            if (!result.ok) {
              expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
            }
          });

          it('returns Ok with VoiceInfo[] on successful API response', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
            const adapter = adapterDef.create(config);
            mockFetch.mockResolvedValue({
              ok: true,
              status: 200,
              json: jest.fn().mockResolvedValue({
                voices: [
                  { voice_id: 'v1', name: 'Rachel', labels: { language: 'en', gender: 'female' } },
                  { voice_id: 'v2', name: 'Drew', labels: { language: 'en', gender: 'male' } },
                ],
              }),
              headers: new Headers(),
            } as unknown as Response);

            const result = await adapter.getVoices();

            expect(isOk(result)).toBe(true);
            if (result.ok) {
              expect(result.value).toHaveLength(2);
              expect(result.value[0].id).toBe('v1');
              expect(result.value[0].name).toBe('Rachel');
            }
          });

          it('sends request to voices API with correct auth header', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'voices-key' });
            const adapter = adapterDef.create(config);
            mockFetch.mockResolvedValue({
              ok: true,
              status: 200,
              json: jest.fn().mockResolvedValue({ voices: [] }),
              headers: new Headers(),
            } as unknown as Response);

            await adapter.getVoices();

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [calledUrl, fetchOptions] = mockFetch.mock.calls[0];
            expect(calledUrl).toBe('https://api.elevenlabs.io/v1/voices');
            expect(fetchOptions.method).toBe('GET');
            const headers = fetchOptions.headers as Record<string, string>;
            expect(headers['xi-api-key']).toBe('voices-key');
          });

          it('returns Err(ProviderUnavailable) on voices API error', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
            const adapter = adapterDef.create(config);
            mockFetch.mockResolvedValue(createErrorResponse(500, 'Internal server error'));

            const result = await adapter.getVoices();

            expect(isErr(result)).toBe(true);
            if (!result.ok) {
              expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
            }
          });

          it('returns Err(ProviderUnavailable) on network error', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
            const adapter = adapterDef.create(config);
            mockFetch.mockRejectedValue(new Error('Network down'));

            const result = await adapter.getVoices();

            expect(isErr(result)).toBe(true);
            if (!result.ok) {
              expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
            }
          });

          it('filters voices by language when language param is provided', async () => {
            const config = createMockConfigService({ [adapterDef.apiKeyEnvVar]: 'test-key-123' });
            const adapter = adapterDef.create(config);
            mockFetch.mockResolvedValue({
              ok: true,
              status: 200,
              json: jest.fn().mockResolvedValue({
                voices: [
                  { voice_id: 'v1', name: 'Rachel', labels: { language: 'en', gender: 'female' } },
                  { voice_id: 'v2', name: 'Maria', labels: { language: 'es', gender: 'female' } },
                  { voice_id: 'v3', name: 'Hans', labels: { language: 'de', gender: 'male' } },
                ],
              }),
              headers: new Headers(),
            } as unknown as Response);

            const result = await adapter.getVoices('en');

            expect(isOk(result)).toBe(true);
            if (result.ok) {
              // Should include 'en' voices and voices without language label
              expect(result.value.some((v) => v.id === 'v1')).toBe(true);
              expect(result.value.some((v) => v.id === 'v2')).toBe(false); // es
              expect(result.value.some((v) => v.id === 'v3')).toBe(false); // de
            }
          });
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // Cross-adapter consistency checks
  // ---------------------------------------------------------------

  describe('cross-adapter consistency', () => {
    it('all adapters use distinct provider IDs', () => {
      const ids = adapters.map((a) => {
        const config = createMockConfigService();
        return a.create(config).providerId;
      });
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapters return Result types (not throw) for missing keys', async () => {
      for (const adapterDef of adapters) {
        const config = createMockConfigService();
        const adapter = adapterDef.create(config);
        // Must NOT throw — must return Err Result
        const result = await adapter.synthesize(DEFAULT_REQUEST);
        expect(result).toBeDefined();
        expect(typeof result.ok).toBe('boolean');
      }
    });

    it('all adapters extend TTSProviderPort', () => {
      const { TTSProviderPort } = require('../../src/ports/tts-provider.port');
      for (const adapterDef of adapters) {
        const config = createMockConfigService();
        const adapter = adapterDef.create(config);
        expect(adapter).toBeInstanceOf(TTSProviderPort);
      }
    });
  });
});
