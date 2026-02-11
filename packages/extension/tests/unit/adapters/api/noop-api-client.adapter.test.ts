/**
 * NoOpApiClientAdapter Unit Tests
 *
 * Verifies the no-op adapter returns not_configured errors for all methods.
 *
 * @module tests/unit/adapters/api/noop-api-client.adapter
 */

import { describe, it, expect } from '@jest/globals';
import { NoOpApiClientAdapter } from '../../../../src/adapters/api/noop-api-client.adapter';
import { isErr } from '../../../../src/core/shared/result';

describe('NoOpApiClientAdapter', () => {
  const adapter = new NoOpApiClientAdapter();

  it('isConfigured returns false', () => {
    expect(adapter.isConfigured).toBe(false);
  });

  it('validateLicense returns not_configured error', async () => {
    const result = await adapter.validateLicense('any-key');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('not_configured');
    }
  });

  it('getSubscription returns not_configured error', async () => {
    const result = await adapter.getSubscription();
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('not_configured');
    }
  });

  it('getCreditBalance returns not_configured error', async () => {
    const result = await adapter.getCreditBalance();
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('not_configured');
    }
  });

  it('createCheckout returns not_configured error', async () => {
    const result = await adapter.createCheckout('pro');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('not_configured');
    }
  });
});
