/**
 * Contract Tests for ElevenLabs TTS Provider
 * Verifies request format and response handling per contracts/elevenlabs-tts.md
 *
 * Run with: node tests/contract/test-elevenlabs-provider.js
 */

import { ElevenLabsProvider } from '../../background/providers/elevenlabs-provider.js';

/**
 * Test utilities
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
};

const assertThrows = async (fn, expectedMessage, testName) => {
  try {
    await fn();
    throw new Error(`Expected function to throw: ${testName}`);
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error containing "${expectedMessage}", got "${error.message}"`);
    }
    console.log(`✓ ${testName}`);
  }
};

/**
 * Mock fetch for contract verification
 */
let lastFetchRequest = null;
const originalFetch = globalThis.fetch;

function mockFetch(response, status = 200) {
  globalThis.fetch = async (url, options) => {
    lastFetchRequest = { url, options };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
      arrayBuffer: async () => new ArrayBuffer(100)
    };
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  lastFetchRequest = null;
}

/**
 * Contract Tests
 */
async function runTests() {
  console.log('\n=== ElevenLabs Provider Contract Tests ===\n');

  // Test 1: Provider static properties
  console.log('--- Static Properties ---');
  assert(ElevenLabsProvider.id === 'elevenlabs', 'Provider ID is "elevenlabs"');
  assert(ElevenLabsProvider.name === 'ElevenLabs', 'Provider name is "ElevenLabs"');
  assert(ElevenLabsProvider.requiresApiKey === true, 'Provider requires API key');
  assert(ElevenLabsProvider.supportsStreaming === true, 'Provider supports streaming');

  // Test 2: Instance creation
  console.log('\n--- Instance Creation ---');
  const provider = new ElevenLabsProvider('test-api-key');
  assert(provider.hasApiKey() === true, 'API key is set');

  const providerNoKey = new ElevenLabsProvider(null);
  assert(providerNoKey.hasApiKey() === false, 'No API key returns false');

  // Test 3: Voices match contract
  console.log('\n--- Voices ---');
  const voices = provider.getVoices();
  const expectedVoiceIds = [
    '21m00Tcm4TlvDq8ikWAM', // Rachel
    '29vD33N1CtxCmqQRPOHJ', // Drew
    'EXAVITQu4vr4xnSDxMaL', // Sarah
    'ErXwobaYiN019PkySvjV', // Antoni
    '2EiwWnXFnvU5JabPnv8n', // Clyde
    '5Q0t7uMcjvnagumLfvZi', // Paul
    'AZnzlk1XvdvUeBnXmlld', // Domi
    'CYw3kZ02Hs0563khs1Fj', // Dave
    'D38z5RcWu1voky8WS1ja', // Fin
    'MF3mGyEYCl7XYWbV9V6O'  // Elli
  ];
  assert(voices.length === 10, 'Has 10 voices');
  expectedVoiceIds.forEach(voiceId => {
    const found = voices.find(v => v.id === voiceId);
    assert(found !== undefined, `Has voice ID "${voiceId}"`);
  });

  // Test 4: Request format matches contract
  console.log('\n--- Request Format (Contract Verification) ---');
  const testVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel
  mockFetch({}, 200);

  try {
    await provider.generateAudio('Hello, world!', testVoiceId, {});

    // Verify URL contains voice_id per contract: POST /v1/text-to-speech/{voice_id}
    assert(
      lastFetchRequest.url === `https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}`,
      'Endpoint is /v1/text-to-speech/{voice_id}'
    );

    // Verify method
    assert(lastFetchRequest.options.method === 'POST', 'Method is POST');

    // Verify headers per contract
    const headers = lastFetchRequest.options.headers;
    assert(
      headers['xi-api-key'] === 'test-api-key',
      'xi-api-key header contains API key'
    );
    assert(
      headers['Content-Type'] === 'application/json',
      'Content-Type is application/json'
    );
    assert(
      headers['Accept'] === 'audio/mpeg',
      'Accept header is audio/mpeg'
    );

    // Verify body structure per contract
    const body = JSON.parse(lastFetchRequest.options.body);
    assert(body.text === 'Hello, world!', 'Body contains text field');
    assert(body.model_id === 'eleven_multilingual_v2', 'Default model is eleven_multilingual_v2');
    assert(typeof body.voice_settings === 'object', 'Has voice_settings object');
    assert(body.voice_settings.stability === 0.5, 'Default stability is 0.5');
    assert(body.voice_settings.similarity_boost === 0.75, 'Default similarity_boost is 0.75');
    assert(body.voice_settings.style === 0.5, 'Default style is 0.5');
    assert(body.voice_settings.use_speaker_boost === true, 'use_speaker_boost is true');

  } finally {
    restoreFetch();
  }

  // Test 5: Turbo model option
  console.log('\n--- Turbo Model Option ---');
  mockFetch({}, 200);

  try {
    await provider.generateAudio('Test', testVoiceId, { turbo: true });
    const body = JSON.parse(lastFetchRequest.options.body);
    assert(body.model_id === 'eleven_turbo_v2_5', 'Turbo option uses eleven_turbo_v2_5 model');
  } finally {
    restoreFetch();
  }

  // Test 6: Custom voice settings
  console.log('\n--- Custom Voice Settings ---');
  mockFetch({}, 200);

  try {
    await provider.generateAudio('Test', testVoiceId, {
      stability: 0.8,
      similarityBoost: 0.9,
      style: 0.3
    });
    const body = JSON.parse(lastFetchRequest.options.body);
    assert(body.voice_settings.stability === 0.8, 'Custom stability applied');
    assert(body.voice_settings.similarity_boost === 0.9, 'Custom similarity_boost applied');
    assert(body.voice_settings.style === 0.3, 'Custom style applied');
  } finally {
    restoreFetch();
  }

  // Test 7: Speed clamping - ElevenLabs doesn't support speed in API
  console.log('\n--- Speed Handling ---');
  // ElevenLabs returns 1.0 since speed adjustment is client-side
  assert(provider.clampSpeed(0.5) === 1.0, 'Speed returns 1.0 (client-side adjustment)');
  assert(provider.clampSpeed(2.0) === 1.0, 'Speed returns 1.0 (client-side adjustment)');

  // Test 8: Error handling - missing API key
  console.log('\n--- Error Handling ---');
  const providerNoKey2 = new ElevenLabsProvider(null);
  await assertThrows(
    () => providerNoKey2.generateAudio('Test', testVoiceId),
    'API key not configured',
    'Throws when API key missing'
  );

  // Test 9: Error message building per contract
  console.log('\n--- Error Messages ---');
  const mockResponse401 = { status: 401 };
  const mockResponse422 = { status: 422 };
  const mockResponse429 = { status: 429 };

  assert(
    provider.buildErrorMessage(mockResponse401).includes('Invalid'),
    '401 returns invalid key message'
  );
  assert(
    provider.buildErrorMessage(mockResponse422).includes('voice'),
    '422 returns voice/settings message'
  );
  assert(
    provider.buildErrorMessage(mockResponse429).includes('Rate'),
    '429 returns rate limit message'
  );

  // Test 10: Pricing model per contract
  console.log('\n--- Pricing Model ---');
  const pricing = provider.pricingModel;
  assert(pricing.type === 'per_character', 'Pricing type is per_character');
  assert(pricing.rate === 0.30, 'Rate is $0.30');
  assert(pricing.unit === 1000, 'Unit is 1000 characters');

  // Test 11: Cost estimation
  console.log('\n--- Cost Estimation ---');
  const text1000chars = 'a'.repeat(1000);
  const cost = provider.estimateCost(text1000chars);
  assert(Math.abs(cost - 0.30) < 0.0001, 'Cost for 1000 chars is $0.30');

  console.log('\n=== All ElevenLabs Contract Tests Passed ===\n');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
