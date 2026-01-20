/**
 * Provider Routing Unit Tests (035-selection-tts-hardening)
 * Tests for provider selection, API key validation, and error handling
 * Post-045: Only ElevenLabs provider is supported
 *
 * @module tests/unit/providers/routing
 */

import type { ProviderId } from '../../../src/core/shared/errors';

/**
 * Mock provider metadata matching real implementation in provider.handlers.ts
 * Post-045: Only ElevenLabs is supported
 */
interface ProviderMetadata {
  id: ProviderId;
  name: string;
  requiresApiKey: boolean;
  supportedLanguages: string[];
}

const PROVIDERS: ProviderMetadata[] = [
  { id: 'elevenlabs', name: 'ElevenLabs', requiresApiKey: true, supportedLanguages: [] },
];

/**
 * Provider Router - Simulates the routing logic in provider.handlers.ts
 * Post-045: Only ElevenLabs provider is supported
 */
class ProviderRouter {
  private apiKeys: Map<ProviderId, string | null> = new Map();
  private selectedProvider: ProviderId = 'elevenlabs';
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
   * Post-045: Only ElevenLabs is supported, so this always validates ElevenLabs
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
  async generateAudio(_text: string): Promise<{ success: boolean; error?: string }> {
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
 * Post-045: Only ElevenLabs validation is used in production
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

    it('should route to ElevenLabs when API key present', () => {
      // Post-045: Only ElevenLabs is supported
      // Configure ElevenLabs with valid API key
      router.setApiKey('elevenlabs', 'abcdef1234567890abcdef1234567890');

      // Select ElevenLabs provider
      const result = router.selectProvider('elevenlabs');

      expect(result.success).toBe(true);
      expect(router.getSelectedProvider()).toBe('elevenlabs');
      expect(notifier.getSentErrors()).toHaveLength(0);
    });

    it('should show error when ElevenLabs has no API key', () => {
      // ElevenLabs requires API key but none is set
      const result = router.selectProvider('elevenlabs');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
      expect(notifier.getSentErrors()).toHaveLength(1);
      expect(notifier.getSentErrors()[0].type).toBe('api_key_missing');
      expect(notifier.getSentErrors()[0].provider).toBe('elevenlabs');
    });

    it('should fail to generate audio when API key is revoked', async () => {
      // Configure ElevenLabs with valid API key
      router.setApiKey('elevenlabs', 'abcdef1234567890abcdef1234567890');
      router.selectProvider('elevenlabs');

      // Clear the API key to simulate key revocation
      router.setApiKey('elevenlabs', null);

      // Try to generate - should fail
      const result = await router.generateAudio('test text');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
      // Provider should still be ElevenLabs
      expect(router.getSelectedProvider()).toBe('elevenlabs');
    });

    it('should generate audio successfully with valid API key', async () => {
      // Post-045: Only ElevenLabs is supported
      router.setApiKey('elevenlabs', 'abcdef1234567890abcdef1234567890');
      router.selectProvider('elevenlabs');

      const result = await router.generateAudio('test text');

      expect(result.success).toBe(true);
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

    it('should return false for empty/missing keys', () => {
      // ElevenLabs validator should return false for empty/null/undefined
      expect(ApiKeyValidator.validateElevenLabs('')).toBe(false);

      // @ts-expect-error - testing null input
      expect(ApiKeyValidator.validateElevenLabs(null)).toBe(false);
      // @ts-expect-error - testing undefined input
      expect(ApiKeyValidator.validateElevenLabs(undefined)).toBe(false);

      // Whitespace-only should also fail
      expect(ApiKeyValidator.validateElevenLabs('   ')).toBe(false);
      expect(ApiKeyValidator.validateElevenLabs('\t\n')).toBe(false);
    });

    it('should validate generic API key format', () => {
      // Generic validation just checks non-empty
      expect(ApiKeyValidator.validateGeneric('anyvalue')).toBe(true);
      expect(ApiKeyValidator.validateGeneric('')).toBe(false);
      expect(ApiKeyValidator.validateGeneric('   ')).toBe(false);
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
      // Post-045: Only ElevenLabs is supported
      router.selectProvider('elevenlabs');

      const errors = notifier.getSentErrors();
      expect(errors).toHaveLength(1);

      // Error should mention ElevenLabs
      expect(errors[0].message).toContain('ElevenLabs');
      expect(errors[0].provider).toBe('elevenlabs');
    });

    it('should log error context for debugging', () => {
      // Trigger an error
      router.selectProvider('elevenlabs');

      const logs = notifier.getLoggedContexts();
      expect(logs).toHaveLength(1);

      // Should have error and context
      expect(logs[0].error.provider).toBe('elevenlabs');
      expect(logs[0].context).toBeDefined();
      expect(logs[0].context).toHaveProperty('timestamp');
      expect(logs[0].context).toHaveProperty('attempt');
    });
  });
});
