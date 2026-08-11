/**
 * BYOK provider-card persistence tests (PROSO-113).
 *
 * The three new provider cards (OpenAI, Groq, Cartesia) must persist through
 * the same storage + validation path ElevenLabs already uses: the Save button
 * writes `openaiApiKey`/`groqApiKey`/`cartesiaApiKey`, the loader reads them
 * back, and the settings handler routes every provider to the server's
 * test-key endpoint with the entered key (INV-002 BYOK forwarding).
 *
 * @module tests/unit/utils/options/api-key-tester
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: jest.fn<() => Promise<Record<string, unknown>>>(),
        set: jest.fn<() => Promise<void>>(),
      },
    },
    runtime: {
      sendMessage: jest.fn<() => Promise<unknown>>(),
    },
  },
}));

// Dynamic imports only: static imports would resolve before the mock above.
const { browser } = await import('wxt/browser');
const { saveApiKey, loadApiKeys, testApiKey } = await import(
  '../../../../src/utils/options/api-key-tester'
);

describe('api-key-tester BYOK storage (PROSO-113)', () => {
  beforeEach(() => {
    (browser.storage.local.set as jest.Mock).mockClear();
    (browser.storage.local.get as jest.Mock).mockClear();
    (browser.runtime.sendMessage as jest.Mock).mockClear();
  });

  it('saves each provider key to its canonical storage key', async () => {
    await saveApiKey('openai', 'sk-openai-123');
    await saveApiKey('groq', 'gsk-groq-456');
    await saveApiKey('cartesia', 'sk_cartesia-789');

    const sets = (browser.storage.local.set as jest.Mock).mock.calls;
    expect(sets[0]?.[0]).toEqual({ openaiApiKey: 'sk-openai-123' });
    expect(sets[1]?.[0]).toEqual({ groqApiKey: 'gsk-groq-456' });
    expect(sets[2]?.[0]).toEqual({ cartesiaApiKey: 'sk_cartesia-789' });
  });

  it('loads every provider key back from storage', async () => {
    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      elevenlabsApiKey: 'xi-1',
      openaiApiKey: 'sk-2',
      groqApiKey: 'gsk-3',
      cartesiaApiKey: 'sk_4',
    });

    const keys = await loadApiKeys();
    expect(keys).toMatchObject({
      elevenlabs: 'xi-1',
      openai: 'sk-2',
      groq: 'gsk-3',
      cartesia: 'sk_4',
    });
  });

  it('routes a groq test through the background handler with the entered key', async () => {
    (browser.runtime.sendMessage as jest.Mock).mockResolvedValue({
      success: true,
      message: 'API key is valid',
    });

    const result = await testApiKey('groq', 'gsk-real-key');
    expect(result.success).toBe(true);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'settings.testApiKey',
      data: { provider: 'groq', apiKey: 'gsk-real-key' },
    });
  });

  it('reports a server-side failure truthfully (bad key never passes silently)', async () => {
    (browser.runtime.sendMessage as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Invalid API key',
    });

    const result = await testApiKey('cartesia', 'sk-bad-key');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid API key');
  });
});
