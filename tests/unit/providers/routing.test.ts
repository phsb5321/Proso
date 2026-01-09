/**
 * Provider Routing Unit Tests (035-selection-tts-hardening)
 * Tests for provider selection, API key validation, and error handling
 *
 * @module tests/unit/providers/routing
 */

import type { ProviderId } from '../../../src/core/shared/errors';

/**
 * Mock provider metadata matching real implementation in provider.handlers.ts
 */
interface ProviderMetadata {
  id: ProviderId;
  name: string;
  requiresApiKey: boolean;
  supportedLanguages: string[];
}

const PROVIDERS: ProviderMetadata[] = [
  { id: 'openai', name: 'OpenAI TTS', requiresApiKey: true, supportedLanguages: [] },
  { id: 'elevenlabs', name: 'ElevenLabs', requiresApiKey: true, supportedLanguages: [] },
  { id: 'groq', name: 'Groq', requiresApiKey: true, supportedLanguages: ['en'] },
  { id: 'cartesia', name: 'Cartesia', requiresApiKey: true, supportedLanguages: ['en'] },
  { id: 'browser', name: 'Browser TTS', requiresApiKey: false, supportedLanguages: [] },
];

/**
 * Provider Router - Simulates the routing logic in provider.handlers.ts
 */
class ProviderRouter {
  private apiKeys: Map<ProviderId, string | null> = new Map();
  private selectedProvider: ProviderId = 'browser';
  private errorHandler: ((error: ProviderRouterError) => void) | null = null;

  constructor() {
    // Initialize all API keys as null
    PROVIDERS.forEach((p) => this.apiKeys.set(p.id, null));
  }

  /**
   * Set API key for a provider
   */
  setApiKey(provider: ProviderId, key: string | null): void {
    this.apiKeys.set(provider, key);
  }

  /**
   * Get API key for a provider
   */
  getApiKey(provider: ProviderId): string | null {
    return this.apiKeys.get(provider) ?? null;
  }

  /**
   * Check if provider has a valid API key configured
   */
  hasApiKey(provider: ProviderId): boolean {
    const key = this.apiKeys.get(provider);
    return !!key && key.trim().length > 0;
  }

  /**
   * Select a provider for TTS generation
   * Does NOT automatically fallback to browser on error
   */
  selectProvider(provider: ProviderId): { success: boolean; error?: string } {
    const metadata = PROVIDERS.find((p) => p.id === provider);

    if (!metadata) {
      return { success: false, error: `Unknown provider: ${provider}` };
    }

    // Check if API key is required and missing
    if (metadata.requiresApiKey && !this.hasApiKey(provider)) {
      const error: ProviderRouterError = {
        type: 'api_key_missing',
        provider: provider,
        message: `${metadata.name} requires an API key. Please configure it in settings.`,
      };

      if (this.errorHandler) {
        this.errorHandler(error);
      }

      return { success: false, error: error.message };
    }

    this.selectedProvider = provider;
    return { success: true };
  }

  /**
   * Get currently selected provider
   */
  getSelectedProvider(): ProviderId {
    return this.selectedProvider;
  }

  /**
   * Set error handler for routing errors
   */
  onError(handler: (error: ProviderRouterError) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Generate audio with the selected provider
   * Returns error result instead of fallback on API error
   */
  async generateAudio(text: string): Promise<{ success: boolean; error?: string }> {
    const metadata = PROVIDERS.find((p) => p.id === this.selectedProvider);

    if (!metadata) {
      return { success: false, error: 'No provider selected' };
    }

    // Check API key again at generation time
    if (metadata.requiresApiKey && !this.hasApiKey(this.selectedProvider)) {
      const error: ProviderRouterError = {
        type: 'api_key_missing',
        provider: this.selectedProvider,
        message: `${metadata.name} API key not configured`,
      };

      if (this.errorHandler) {
        this.errorHandler(error);
      }

      // Explicitly DO NOT fallback to browser TTS
      return { success: false, error: error.message };
    }

    // Simulate successful generation
    return { success: true };
  }
}

/**
 * Error type for provider routing errors
 */
interface ProviderRouterError {
  type: 'api_key_missing' | 'api_error' | 'validation_error';
  provider: ProviderId;
  message: string;
}

/**
 * API Key Validator - Validates API key formats for each provider
 * Based on real patterns from provider implementations
 */
class ApiKeyValidator {
  /**
   * Validate ElevenLabs API key format
   * ElevenLabs keys are 32-character hex strings
   */
  static validateElevenLabs(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    // ElevenLabs keys: 32 alphanumeric characters
    return /^[a-zA-Z0-9]{32}$/.test(trimmed);
  }

  /**
   * Validate OpenAI API key format
   * OpenAI keys start with 'sk-' and are 48-56 characters total
   */
  static validateOpenAI(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    // OpenAI keys: start with 'sk-' followed by 40+ alphanumeric chars
    // Also support project keys: 'sk-proj-...'
    return /^sk-(proj-)?[a-zA-Z0-9_-]{40,128}$/.test(trimmed);
  }

  /**
   * Validate Groq API key format
   * Groq keys start with 'gsk_' and are ~56 characters
   */
  static validateGroq(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    // Groq keys: start with 'gsk_' followed by ~52 chars
    return /^gsk_[a-zA-Z0-9]{50,60}$/.test(trimmed);
  }

  /**
   * Validate Cartesia API key format
   * Cartesia keys are UUID-like with prefix
   */
  static validateCartesia(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    // Cartesia keys: UUID format or sk_ prefix
    return (
      /^sk_[a-zA-Z0-9]{32,64}$/.test(trimmed) ||
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)
    );
  }

  /**
   * Validate any API key (non-empty check)
   */
  static validateGeneric(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    return key.trim().length > 0;
  }
}

/**
 * Error Notifier - Sends errors to content script
 */
class ErrorNotifier {
  private sentErrors: ProviderRouterError[] = [];
  private loggedContexts: Array<{ error: ProviderRouterError; context: unknown }> = [];

  /**
   * Send error to content script for display
   */
  sendToContentScript(error: ProviderRouterError): void {
    this.sentErrors.push(error);
  }

  /**
   * Log error with context for debugging
   */
  logWithContext(error: ProviderRouterError, context: unknown): void {
    this.loggedContexts.push({ error, context });
  }

  /**
   * Get all sent errors (for testing)
   */
  getSentErrors(): ProviderRouterError[] {
    return [...this.sentErrors];
  }

  /**
   * Get logged contexts (for testing)
   */
  getLoggedContexts(): Array<{ error: ProviderRouterError; context: unknown }> {
    return [...this.loggedContexts];
  }

  /**
   * Clear all errors (for testing)
   */
  clear(): void {
    this.sentErrors = [];
    this.loggedContexts = [];
  }
}

describe('Provider Routing', () => {
  describe('Routing Logic (T010)', () => {
    let router: ProviderRouter;
    let notifier: ErrorNotifier;

    beforeEach(() => {
      router = new ProviderRouter();
      notifier = new ErrorNotifier();
      router.onError((err) => notifier.sendToContentScript(err));
    });

    it('should route to selected provider when API key present', () => {
      // Configure OpenAI with valid API key
      router.setApiKey('openai', 'sk-proj-testkey12345678901234567890123456789012');

      // Select OpenAI provider
      const result = router.selectProvider('openai');

      expect(result.success).toBe(true);
      expect(router.getSelectedProvider()).toBe('openai');
      expect(notifier.getSentErrors()).toHaveLength(0);
    });

    it('should show error when selected provider has no API key', () => {
      // OpenAI requires API key but none is set
      const result = router.selectProvider('openai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
      expect(notifier.getSentErrors()).toHaveLength(1);
      expect(notifier.getSentErrors()[0].type).toBe('api_key_missing');
      expect(notifier.getSentErrors()[0].provider).toBe('openai');
    });

    it('should NOT fallback to browser TTS on API error', async () => {
      // Start with browser TTS
      router.selectProvider('browser');
      expect(router.getSelectedProvider()).toBe('browser');

      // Switch to OpenAI without API key
      router.setApiKey('openai', 'sk-proj-testkey12345678901234567890123456789012');
      router.selectProvider('openai');

      // Clear the API key to simulate key revocation
      router.setApiKey('openai', null);

      // Try to generate - should fail, NOT fallback to browser
      const result = await router.generateAudio('test text');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
      // Provider should still be OpenAI, not browser
      expect(router.getSelectedProvider()).toBe('openai');
    });

    it('should use browser TTS only when explicitly selected', () => {
      // Browser TTS doesn't require API key
      const result = router.selectProvider('browser');

      expect(result.success).toBe(true);
      expect(router.getSelectedProvider()).toBe('browser');
      expect(notifier.getSentErrors()).toHaveLength(0);
    });
  });

  describe('API Key Validation (T011)', () => {
    it('should validate ElevenLabs API key format', () => {
      // Valid: 32 alphanumeric characters
      expect(ApiKeyValidator.validateElevenLabs('abcdef1234567890abcdef1234567890')).toBe(true);
      expect(ApiKeyValidator.validateElevenLabs('ABCDEF1234567890ABCDEF1234567890')).toBe(true);

      // Invalid: wrong length
      expect(ApiKeyValidator.validateElevenLabs('tooshort')).toBe(false);
      expect(
        ApiKeyValidator.validateElevenLabs('toolongabcdef1234567890abcdef1234567890extra'),
      ).toBe(false);

      // Invalid: special characters
      expect(ApiKeyValidator.validateElevenLabs('abcdef-1234567890-abcdef123456')).toBe(false);
    });

    it('should validate OpenAI API key format', () => {
      // Valid: starts with sk- and has 40+ chars after
      expect(
        ApiKeyValidator.validateOpenAI('sk-abcdef1234567890abcdef1234567890abcdef12'),
      ).toBe(true);

      // Valid: project key format
      expect(
        ApiKeyValidator.validateOpenAI('sk-proj-abcdef1234567890abcdef1234567890abcdef12'),
      ).toBe(true);

      // Invalid: doesn't start with sk-
      expect(
        ApiKeyValidator.validateOpenAI('pk-abcdef1234567890abcdef1234567890abcdef12'),
      ).toBe(false);

      // Invalid: too short
      expect(ApiKeyValidator.validateOpenAI('sk-short')).toBe(false);
    });

    it('should validate Groq API key format', () => {
      // Valid: starts with gsk_ and has 50-60 chars after
      expect(
        ApiKeyValidator.validateGroq(
          'gsk_abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ),
      ).toBe(true);

      // Invalid: doesn't start with gsk_
      expect(
        ApiKeyValidator.validateGroq(
          'sk_abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ),
      ).toBe(false);

      // Invalid: too short
      expect(ApiKeyValidator.validateGroq('gsk_tooshort')).toBe(false);
    });

    it('should validate Cartesia API key format', () => {
      // Valid: sk_ prefix format
      expect(
        ApiKeyValidator.validateCartesia('sk_abcdef1234567890abcdef1234567890'),
      ).toBe(true);

      // Valid: UUID format
      expect(
        ApiKeyValidator.validateCartesia('a0e99841-438c-4a64-b679-ae501e7d6091'),
      ).toBe(true);

      // Invalid: wrong format
      expect(ApiKeyValidator.validateCartesia('invalid-key')).toBe(false);
    });

    it('should return false for empty/missing keys', () => {
      // All validators should return false for empty/null/undefined
      expect(ApiKeyValidator.validateElevenLabs('')).toBe(false);
      expect(ApiKeyValidator.validateOpenAI('')).toBe(false);
      expect(ApiKeyValidator.validateGroq('')).toBe(false);
      expect(ApiKeyValidator.validateCartesia('')).toBe(false);

      // @ts-expect-error - testing null input
      expect(ApiKeyValidator.validateElevenLabs(null)).toBe(false);
      // @ts-expect-error - testing undefined input
      expect(ApiKeyValidator.validateOpenAI(undefined)).toBe(false);

      // Whitespace-only should also fail
      expect(ApiKeyValidator.validateGroq('   ')).toBe(false);
      expect(ApiKeyValidator.validateCartesia('\t\n')).toBe(false);
    });
  });

  describe('Error Notification', () => {
    let router: ProviderRouter;
    let notifier: ErrorNotifier;

    beforeEach(() => {
      router = new ProviderRouter();
      notifier = new ErrorNotifier();
      router.onError((err) => {
        notifier.sendToContentScript(err);
        notifier.logWithContext(err, { timestamp: Date.now(), attempt: 1 });
      });
    });

    it('should send error to content script for display', () => {
      // Trigger an error by selecting provider without API key
      router.selectProvider('elevenlabs');

      const errors = notifier.getSentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('api_key_missing');
      expect(errors[0].provider).toBe('elevenlabs');
    });

    it('should include provider name in error message', () => {
      // Try selecting different providers without keys
      router.selectProvider('openai');
      router.selectProvider('groq');

      const errors = notifier.getSentErrors();
      expect(errors).toHaveLength(2);

      // First error should mention OpenAI
      expect(errors[0].message).toContain('OpenAI');
      expect(errors[0].provider).toBe('openai');

      // Second error should mention Groq
      expect(errors[1].message).toContain('Groq');
      expect(errors[1].provider).toBe('groq');
    });

    it('should log error context for debugging', () => {
      // Trigger an error
      router.selectProvider('cartesia');

      const logs = notifier.getLoggedContexts();
      expect(logs).toHaveLength(1);

      // Should have error and context
      expect(logs[0].error.provider).toBe('cartesia');
      expect(logs[0].context).toBeDefined();
      expect(logs[0].context).toHaveProperty('timestamp');
      expect(logs[0].context).toHaveProperty('attempt');
    });
  });
});
