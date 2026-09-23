import { describe, expect, it } from '@jest/globals';
import {
  READING_SOURCE_LIVE_TRAFFIC_ENABLED,
  authorizeSourceRequest,
  connectionStorageKey,
  parseConnectionConfig,
  validateStoredCredential,
} from '../../../../src/core/reading-source/connection-credentials';
import type { StoredConnectionCredential } from '../../../../src/ports/connection-credentials.port';

const credential: StoredConnectionCredential = {
  connectionId: 'fixture',
  baseUrl: 'https://miniflux.test:8443/reader',
  token: 'synthetic-token',
};

describe('connection credential core', () => {
  describe('parseConnectionConfig binds the exact HTTPS origin and port', () => {
    it('keeps an explicit non-default port and strips trailing base-path slashes', () => {
      expect(parseConnectionConfig('https://miniflux.test:8443/reader///')).toEqual({
        ok: true,
        value: {
          origin: 'https://miniflux.test:8443',
          originPattern: 'https://miniflux.test:8443/*',
          basePath: '/reader',
        },
      });
    });
    it('normalizes the default port away from the origin', () => {
      const parsed = parseConnectionConfig('https://miniflux.test:443');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.origin).toBe('https://miniflux.test');
      expect(parsed.value.basePath).toBe('');
    });
    it('rejects non-HTTPS schemes, userinfo, query, fragment and escaped paths', () => {
      for (const baseUrl of [
        'http://miniflux.test',
        'https://user:pw@miniflux.test',
        'https://miniflux.test/?q=1',
        'https://miniflux.test/#frag',
        'https://miniflux.test/%2e%2e',
        'https://miniflux.test/reader\\x',
        'not a url',
      ]) {
        expect(parseConnectionConfig(baseUrl)).toEqual({
          ok: false,
          error: { type: 'SOURCE_BINDING' },
        });
      }
    });
  });

  describe('connectionStorageKey and token shape', () => {
    it('namespaces safe ids and rejects unsafe ids', () => {
      expect(connectionStorageKey('fixture_1-A')).toEqual({
        ok: true,
        value: 'readingSourceConnection:fixture_1-A',
      });
      for (const id of ['', '../x', 'a b', 'é', 'a'.repeat(65)]) {
        expect(connectionStorageKey(id)).toEqual({ ok: false, error: { type: 'SOURCE_BINDING' } });
      }
    });
    it('accepts a well-formed credential and rejects malformed tokens or configs', () => {
      expect(validateStoredCredential(credential).ok).toBe(true);
      for (const token of ['', 'a b', 'tab\ttoken', 'x'.repeat(257), 'null\0byte']) {
        expect(validateStoredCredential({ ...credential, token })).toEqual({
          ok: false,
          error: { type: 'SOURCE_BINDING' },
        });
      }
      expect(validateStoredCredential({ ...credential, baseUrl: 'http://insecure.test' }).ok).toBe(
        false,
      );
    });
  });

  describe('authorizeSourceRequest admission order', () => {
    it('gates governance first, then credential presence, then permission', () => {
      expect(
        authorizeSourceRequest({
          governanceEnabled: false,
          credentialPresent: true,
          permissionContains: true,
        }),
      ).toEqual({ ok: false, error: { type: 'GOVERNANCE_DISABLED' } });
      expect(
        authorizeSourceRequest({
          governanceEnabled: true,
          credentialPresent: false,
          permissionContains: true,
        }),
      ).toEqual({ ok: false, error: { type: 'NOT_CONFIGURED' } });
      expect(
        authorizeSourceRequest({
          governanceEnabled: true,
          credentialPresent: true,
          permissionContains: false,
        }),
      ).toEqual({ ok: false, error: { type: 'PERMISSION_DENIED' } });
      expect(
        authorizeSourceRequest({
          governanceEnabled: true,
          credentialPresent: true,
          permissionContains: true,
        }),
      ).toEqual({ ok: true, value: undefined });
    });
    it('keeps production live traffic hard-disabled (T003 gate)', () => {
      expect(READING_SOURCE_LIVE_TRAFFIC_ENABLED).toBe(false);
    });
  });
});
