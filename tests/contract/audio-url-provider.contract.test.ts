/**
 * IAudioUrlProvider Contract Tests
 *
 * These tests define the contract that all audio URL provider adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/audio-url-provider
 */

import type { IAudioUrlProvider } from '../../src/ports/audio-url.port';

/**
 * Contract test suite for IAudioUrlProvider implementations.
 *
 * Usage:
 * ```typescript
 * runAudioUrlProviderContractTests('AudioUrlAdapter', () => new AudioUrlAdapter());
 * ```
 */
export function runAudioUrlProviderContractTests(
  adapterName: string,
  createAdapter: () => IAudioUrlProvider,
) {
  describe(`${adapterName} implements IAudioUrlProvider contract`, () => {
    let adapter: IAudioUrlProvider;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('createUrl()', () => {
      it('should return a string URL for ArrayBuffer input', async () => {
        const buffer = new ArrayBuffer(100);
        const url = await adapter.createUrl(buffer);

        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(0);
      });

      it('should return a string URL for Blob input', async () => {
        const blob = new Blob([new Uint8Array(100)], { type: 'audio/mpeg' });
        const url = await adapter.createUrl(blob);

        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(0);
      });

      it('should respect the mimeType parameter', async () => {
        const buffer = new ArrayBuffer(100);
        const url = await adapter.createUrl(buffer, 'audio/wav');

        expect(typeof url).toBe('string');
        // Data URLs will contain the mime type
        if (url.startsWith('data:')) {
          expect(url).toContain('audio/wav');
        }
      });

      it('should use audio/mpeg as default mimeType', async () => {
        const buffer = new ArrayBuffer(100);
        const url = await adapter.createUrl(buffer);

        expect(typeof url).toBe('string');
        // Data URLs will contain the mime type
        if (url.startsWith('data:')) {
          expect(url).toContain('audio/mpeg');
        }
      });
    });

    describe('revokeUrl()', () => {
      it('should not throw for null input', () => {
        expect(() => adapter.revokeUrl(null)).not.toThrow();
      });

      it('should not throw for valid URL input', async () => {
        const buffer = new ArrayBuffer(100);
        const url = await adapter.createUrl(buffer);

        expect(() => adapter.revokeUrl(url)).not.toThrow();
      });

      it('should not throw for data URL input', () => {
        const dataUrl = 'data:audio/mpeg;base64,SGVsbG8=';
        expect(() => adapter.revokeUrl(dataUrl)).not.toThrow();
      });

      it('should be idempotent (can be called multiple times)', async () => {
        const buffer = new ArrayBuffer(100);
        const url = await adapter.createUrl(buffer);

        expect(() => {
          adapter.revokeUrl(url);
          adapter.revokeUrl(url);
          adapter.revokeUrl(url);
        }).not.toThrow();
      });
    });
  });
}

// Run contract tests for the production adapter
import { AudioUrlAdapter } from '../../src/adapters/audio/audio-url.adapter';

runAudioUrlProviderContractTests('AudioUrlAdapter', () => new AudioUrlAdapter());

// Run contract tests for the mock adapter
import { MockAudioUrlProvider } from '../mocks/mock-audio-url-provider';

runAudioUrlProviderContractTests('MockAudioUrlProvider', () => new MockAudioUrlProvider());
