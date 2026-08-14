import { describe, expect, it, jest } from '@jest/globals';
import {
  collectLocalHostOrigin,
  persistLocalHostDraft,
} from '../../../src/entrypoints/options/controller';

const CHANGED_ENABLED_ROUTE = {
  url: 'http://127.0.0.1:45020',
  enabled: true,
  localHostVoice: null,
  fallbackProvider: 'local',
} as const;

function makePersistenceEffects() {
  const write = jest.fn(async (_stored: Record<string, unknown>) => undefined);
  const selectLocalProvider = jest.fn(async () => undefined);
  return {
    write,
    selectLocalProvider,
    effects: {
      readCurrent: async () => ({
        provider: 'local',
        localHostEnabled: true,
        localHostUrl: 'http://127.0.0.1:45019',
        localHostVoice: null,
      }),
      readGrantedOrigins: async () => ['http://127.0.0.1/*'],
      write,
      selectLocalProvider,
    },
  };
}

describe('options local-host settings', () => {
  it.each([
    ['https://host.example', 'https://host.example'],
    ['https://host.example/', 'https://host.example'],
    ['http://localhost:45019', 'http://localhost:45019'],
    ['http://127.0.0.1:45019', 'http://127.0.0.1:45019'],
    ['http://[::1]:45019', 'http://[::1]:45019'],
  ])('accepts the same host origin as onboarding: %s', (raw, expected) => {
    expect(collectLocalHostOrigin(raw)).toBe(expected);
  });

  it.each([
    'http://host.example',
    'http://192.168.1.5:45019',
    'https://host.example/settings',
    'http://127.0.0.1:45019/settings',
    'file:///tmp/synthesis-host',
  ])('rejects an origin onboarding rejects: %s', (raw) => {
    expect(collectLocalHostOrigin(raw)).toBeNull();
  });

  it('preserves a granted enabled route when passive input changes its exact origin', async () => {
    const { effects, selectLocalProvider, write } = makePersistenceEffects();
    const result = await persistLocalHostDraft(
      CHANGED_ENABLED_ROUTE,
      { requestPermission: false },
      effects,
    );

    expect(result).toEqual({ saved: false, reason: 'working-route-preserved' });
    expect(write).not.toHaveBeenCalled();
    expect(selectLocalProvider).not.toHaveBeenCalled();
  });

  it('lets a gesture-backed save adopt the changed destination', async () => {
    const { effects, selectLocalProvider, write } = makePersistenceEffects();
    const result = await persistLocalHostDraft(
      CHANGED_ENABLED_ROUTE,
      { requestPermission: true },
      effects,
    );

    expect(result).toEqual({
      saved: true,
      stored: {
        localHostUrl: 'http://127.0.0.1:45020',
        localHostEnabled: true,
        localHostVoice: null,
        provider: 'local',
      },
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(selectLocalProvider).toHaveBeenCalledTimes(1);
  });
});
