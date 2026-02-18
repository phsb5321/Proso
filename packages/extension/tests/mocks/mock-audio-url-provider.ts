/**
 * Mock Audio URL Provider
 *
 * A mock implementation of IAudioUrlProvider for testing.
 * Tracks all calls for verification in tests.
 *
 * @module tests/mocks/mock-audio-url-provider
 */

import type { IAudioUrlProvider } from '../../src/ports/audio-url.port';

/**
 * Configuration options for MockAudioUrlProvider.
 */
export interface MockAudioUrlProviderConfig {
  /** URL prefix to use for generated URLs (default: 'mock://audio/') */
  urlPrefix?: string;
}

/**
 * Mock implementation of IAudioUrlProvider.
 * Generates predictable mock URLs and tracks all calls.
 */
export class MockAudioUrlProvider implements IAudioUrlProvider {
  private readonly urlPrefix: string;
  private urlCounter = 0;

  /** Track all createUrl calls for verification */
  readonly createUrlCalls: Array<{ data: ArrayBuffer | Blob; mimeType: string }> = [];

  /** Track all revokeUrl calls for verification */
  readonly revokeUrlCalls: Array<string | null> = [];

  constructor(config: MockAudioUrlProviderConfig = {}) {
    this.urlPrefix = config.urlPrefix ?? 'mock://audio/';
  }

  async createUrl(data: ArrayBuffer | Blob, mimeType = 'audio/mpeg'): Promise<string> {
    this.createUrlCalls.push({ data, mimeType });
    this.urlCounter++;
    return `${this.urlPrefix}${this.urlCounter}`;
  }

  revokeUrl(url: string | null): void {
    this.revokeUrlCalls.push(url);
  }

  /** Reset all tracking for a fresh test */
  reset(): void {
    this.createUrlCalls.length = 0;
    this.revokeUrlCalls.length = 0;
    this.urlCounter = 0;
  }
}

/**
 * Factory function for creating MockAudioUrlProvider.
 */
export function createMockAudioUrlProvider(
  config: MockAudioUrlProviderConfig = {},
): MockAudioUrlProvider {
  return new MockAudioUrlProvider(config);
}
