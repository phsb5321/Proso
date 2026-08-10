/**
 * dispatchToHexagonal Contract Tests (T035)
 *
 * Verifies the three return contracts of the hexagonal dispatch bridge:
 *   1. Unknown handler            -> null   (legacy fallback signal)
 *   2. Handler returns Ok(value)  -> value  (inner Result unwrapped)
 *   3. Handler fails / returns Err -> { _hexError: true, error }
 *
 * Drives the REAL dispatch path through the real global instrumented
 * registry (reset per test) rather than mocking modules, so the inner/outer
 * Result unwrapping is exercised end-to-end.
 *
 * @module tests/unit/background/dispatch-to-hexagonal
 * @feature 062-hexagonal-wiring-recovery
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { dispatchToHexagonal } from '../../../src/background/init-hexagonal';
import {
  getGlobalInstrumentedRegistry,
  resetGlobalInstrumentedRegistry,
} from '../../../src/handlers';
import { Ok, Err } from '../../../src/core/shared/result';

/**
 * Discriminated error shape dispatchToHexagonal returns on failure (T033).
 */
interface HexError {
  readonly _hexError: true;
  readonly error: string;
}

function isHexError(value: unknown): value is HexError {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_hexError' in value &&
    (value as { _hexError: unknown })._hexError === true
  );
}

describe('dispatchToHexagonal (T035)', () => {
  beforeEach(() => {
    // Start each test from a clean global registry so handler sets don't leak.
    resetGlobalInstrumentedRegistry();
  });

  it('returns null when no handler is registered for the type', async () => {
    const result = await dispatchToHexagonal('does.not.exist', { foo: 'bar' });
    expect(result).toBeNull();
  });

  it('returns the unwrapped value when the handler resolves Ok', async () => {
    const registry = getGlobalInstrumentedRegistry();
    const payload = { count: 7, label: 'ok' };
    registry.register('test.success', async () => Ok(payload));

    const result = await dispatchToHexagonal<typeof payload>('test.success', undefined);

    expect(result).toEqual(payload);
    expect(isHexError(result)).toBe(false);
  });

  it('returns a _hexError with a string error when the handler returns Err', async () => {
    // Inner-Result-is-Err path: handler resolves Err(...). The source stringifies
    // the error via String(), so the discriminated shape carries a string field.
    const registry = getGlobalInstrumentedRegistry();
    registry.register('test.innerErr', async () => Err('inner failure'));

    const result = await dispatchToHexagonal('test.innerErr', undefined);

    expect(isHexError(result)).toBe(true);
    if (isHexError(result)) {
      expect(result._hexError).toBe(true);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('inner failure');
    }
  });

  it('returns a _hexError with a string error when the handler throws', async () => {
    // Registry-dispatch-failed path: handler throws, registry returns
    // Err({ type: 'execution_failed', ... }), which dispatchToHexagonal
    // stringifies into the discriminated error shape.
    const registry = getGlobalInstrumentedRegistry();
    registry.register('test.throws', async () => {
      throw new Error('handler exploded');
    });

    const result = await dispatchToHexagonal('test.throws', undefined);

    expect(isHexError(result)).toBe(true);
    if (isHexError(result)) {
      expect(result._hexError).toBe(true);
      expect(typeof result.error).toBe('string');
    }
  });

  // PROSO-90 race precondition: BEFORE registerAllHandlers, the real dispatch
  // path mis-answers playback messages with null (the legacy "Unknown message
  // type" fallback); AFTER registration the same message is served. The gate
  // in background.ts exists to keep messages out of that window — this pins
  // what the gate protects.
  it('serves playback.getState once handlers are registered (PROSO-90 race target)', async () => {
    const before = await dispatchToHexagonal('playback.getState', undefined);
    expect(before).toBeNull(); // would be mis-answered as Unknown message type

    const registry = getGlobalInstrumentedRegistry();
    registry.register('playback.getState', async () => Ok({ status: 'stopped' }));

    const after = await dispatchToHexagonal('playback.getState', undefined);
    expect(after).toEqual({ status: 'stopped' }); // served, not mis-answered
  });
});
