import { describe, expect, it, jest } from '@jest/globals';
import {
  RETIRED_TELEMETRY_KEYS,
  clearRetiredTelemetryState,
} from '../../../src/utils/telemetry/retired-state';

function databaseRequest() {
  return {} as IDBOpenDBRequest;
}

describe('clearRetiredTelemetryState', () => {
  it('removes retired storage without requiring IndexedDB', async () => {
    const remove = jest.fn(async () => undefined);

    await clearRetiredTelemetryState({ remove });

    expect(remove).toHaveBeenCalledWith([...RETIRED_TELEMETRY_KEYS]);
  });

  it('deletes the retired event buffer', async () => {
    const remove = jest.fn(async () => undefined);
    const request = databaseRequest();
    const deleteDatabase = jest.fn(() => request);

    const cleanup = clearRetiredTelemetryState({ remove }, { deleteDatabase });
    await Promise.resolve();
    request.onsuccess?.call(request, new Event('success'));

    await expect(cleanup).resolves.toBeUndefined();
    expect(deleteDatabase).toHaveBeenCalledWith('proso_usage');
  });

  it('reports failed or blocked database cleanup', async () => {
    for (const outcome of ['error', 'blocked'] as const) {
      const request = databaseRequest();
      if (outcome === 'error') {
        Object.defineProperty(request, 'error', { value: new DOMException('failed') });
      }
      const onError = jest.fn();
      const cleanup = clearRetiredTelemetryState(
        { remove: async () => undefined },
        { deleteDatabase: () => request },
        onError,
      );
      await Promise.resolve();
      if (outcome === 'error') request.onerror?.call(request, new Event('error'));
      else request.onblocked?.call(request, new Event('blocked') as IDBVersionChangeEvent);

      await expect(cleanup).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(
        'Retired telemetry cleanup failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: outcome === 'error' ? 'failed' : 'telemetry database cleanup was blocked',
          }),
        }),
      );
    }
  });
});
