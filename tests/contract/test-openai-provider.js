/**
 * Contract Tests for OpenAI TTS Provider
 * Verifies request format and response handling per contracts/openai-tts.md
 *
 * Run with: node tests/contract/test-openai-provider.js
 */

import { OpenAIProvider } from '../../background/providers/openai-provider.js';

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
  console.log('\n=== OpenAI Provider Contract Tests ===\n');

  // Test 1: Provider static properties
  console.log('--- Static Properties ---');
  assert(OpenAIProvider.id === 'openai', 'Provider ID is "openai"');
  assert(OpenAIProvider.name === 'OpenAI', 'Provider name is "OpenAI"');
  assert(OpenAIProvider.requiresApiKey === true, 'Provider requires API key');
  assert(OpenAIProvider.supportsStreaming === true, 'Provider supports streaming');

  // Test 2: Instance creation
  console.log('\n--- Instance Creation ---');
  const provider = new OpenAIProvider('test-api-key');
  assert(provider.hasApiKey() === true, 'API key is set');

  const providerNoKey = new OpenAIProvider(null);
  assert(providerNoKey.hasApiKey() === false, 'No API key returns false');

  // Test 3: Voices match contract
  console.log('\n--- Voices ---');
  const voices = provider.getVoices();
  const expectedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  assert(voices.length === 6, 'Has 6 voices');
  expectedVoices.forEach(voiceId => {
    const found = voices.find(v => v.id === voiceId);
    assert(found !== undefined, `Has voice "${voiceId}"`);
  });

  // Test 4: Request format matches contract
  console.log('\n--- Request Format (Contract Verification) ---');
  mockFetch({}, 200);

  try {
    await provider.generateAudio('Hello, world!', 'alloy', { speed: 1.0 });

    // Verify URL
    assert(
      lastFetchRequest.url === 'https://api.openai.com/v1/audio/speech',
      'Endpoint is /v1/audio/speech'
    );

    // Verify method
    assert(lastFetchRequest.options.method === 'POST', 'Method is POST');

    // Verify headers per contract
    const headers = lastFetchRequest.options.headers;
    assert(
      headers['Authorization'] === 'Bearer test-api-key',
      'Authorization header format: Bearer {key}'
    );
    assert(
      headers['Content-Type'] === 'application/json',
      'Content-Type is application/json'
    );

    // Verify body structure per contract
    const body = JSON.parse(lastFetchRequest.options.body);
    assert(body.model === 'tts-1', 'Default model is tts-1');
    assert(body.input === 'Hello, world!', 'Input contains text');
    assert(body.voice === 'alloy', 'Voice ID is passed');
    assert(body.response_format === 'mp3', 'Response format is mp3');
    assert(body.speed === 1.0, 'Speed is passed');

  } finally {
    restoreFetch();
  }

  // Test 5: HD model option
  console.log('\n--- HD Model Option ---');
  mockFetch({}, 200);

  try {
    await provider.generateAudio('Test', 'nova', { hd: true });
    const body = JSON.parse(lastFetchRequest.options.body);
    assert(body.model === 'tts-1-hd', 'HD option uses tts-1-hd model');
  } finally {
    restoreFetch();
  }

  // Test 6: Speed clamping per contract (0.25 - 4.0)
  console.log('\n--- Speed Clamping ---');
  assert(provider.clampSpeed(0.1) === 0.25, 'Speed clamped to minimum 0.25');
  assert(provider.clampSpeed(5.0) === 4.0, 'Speed clamped to maximum 4.0');
  assert(provider.clampSpeed(1.5) === 1.5, 'Valid speed unchanged');

  // Test 7: Error handling - missing API key
  console.log('\n--- Error Handling ---');
  const providerNoKey2 = new OpenAIProvider(null);
  await assertThrows(
    () => providerNoKey2.generateAudio('Test', 'alloy'),
    'API key not configured',
    'Throws when API key missing'
  );

  // Test 8: Pricing model per contract
  console.log('\n--- Pricing Model ---');
  const pricing = provider.pricingModel;
  assert(pricing.type === 'per_character', 'Pricing type is per_character');
  assert(pricing.rate === 0.015, 'Rate is $0.015');
  assert(pricing.unit === 1000, 'Unit is 1000 characters');

  // Test 9: Cost estimation
  console.log('\n--- Cost Estimation ---');
  const text1000chars = 'a'.repeat(1000);
  const cost = provider.estimateCost(text1000chars);
  assert(Math.abs(cost - 0.015) < 0.0001, 'Cost for 1000 chars is $0.015');

  console.log('\n=== All OpenAI Contract Tests Passed ===\n');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
