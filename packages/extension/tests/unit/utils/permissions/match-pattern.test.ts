/**
 * Match-pattern coverage tests (PROSO-114).
 *
 * The local-host gate must judge EFFECTIVE access: an install-time
 * all_urls grant covers a configured origin even though
 * permissions.contains() (the optional-grant proxy) would say no.
 *
 * @module tests/unit/utils/permissions/match-pattern
 */

import { describe, expect, it, jest } from '@jest/globals';
import {
  hostPermissionPatternForOrigin,
  originCoveredByGrantedPatterns,
  patternCoversOrigin,
  requestHostPermissionForOrigin,
} from '../../../../src/utils/permissions/match-pattern';

// WebExtension MatchPattern grammar has no port component. The permission is
// host-wide, while the caller keeps network traffic pinned to the exact origin.
describe('hostPermissionPatternForOrigin', () => {
  it('removes non-default ports from browser permission patterns', () => {
    expect(hostPermissionPatternForOrigin('http://127.0.0.1:45019')).toBe('http://127.0.0.1/*');
    expect(hostPermissionPatternForOrigin('https://host.example:8443')).toBe(
      'https://host.example/*',
    );
  });

  it('preserves bracketed IPv6 hosts without their port', () => {
    expect(hostPermissionPatternForOrigin('http://[::1]:45019')).toBe('http://[::1]/*');
  });

  it('fails closed for foreign schemes, paths, credentials, and malformed input', () => {
    expect(hostPermissionPatternForOrigin('ftp://host.example')).toBeNull();
    expect(hostPermissionPatternForOrigin('https://host.example/path')).toBeNull();
    expect(hostPermissionPatternForOrigin('https://user:secret@host.example')).toBeNull();
    expect(hostPermissionPatternForOrigin('not a URL')).toBeNull();
  });
});

describe('requestHostPermissionForOrigin', () => {
  it('invokes the browser synchronously with the valid host pattern', async () => {
    const request = jest.fn(async () => true);

    const pending = requestHostPermissionForOrigin('http://127.0.0.1:45019', { request });

    expect(request).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
    await expect(pending).resolves.toEqual({
      ok: true,
      pattern: 'http://127.0.0.1/*',
    });
  });

  it('returns a typed failure instead of throwing when the browser rejects', async () => {
    const request = jest.fn(async () => {
      throw new Error('IPv6 patterns are unavailable');
    });

    await expect(
      requestHostPermissionForOrigin('http://[::1]:45019', { request }),
    ).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
      message: 'The browser could not request host access. IPv6 patterns are unavailable',
    });
  });

  it('distinguishes reader denial from an unavailable permission API', async () => {
    const request = jest.fn(async () => false);

    await expect(
      requestHostPermissionForOrigin('https://host.example:8443', { request }),
    ).resolves.toEqual({
      ok: false,
      reason: 'denied',
      message: 'Host permission was not granted.',
    });
  });
});

describe('patternCoversOrigin', () => {
  it('all_urls covers every http(s) origin', () => {
    expect(patternCoversOrigin('<all_urls>', 'https://host.example')).toBe(true);
    expect(patternCoversOrigin('<all_urls>', 'http://127.0.0.1')).toBe(true);
  });

  it('wildcard-host patterns cover any host on the scheme', () => {
    expect(patternCoversOrigin('https://*/*', 'https://host.example')).toBe(true);
    expect(patternCoversOrigin('http://*/*', 'http://192.168.1.5')).toBe(true);
  });

  it('exact-host patterns cover that host only', () => {
    expect(patternCoversOrigin('https://host.example/*', 'https://host.example')).toBe(true);
    expect(patternCoversOrigin('https://host.example/*', 'https://other.example')).toBe(false);
  });

  it('scheme must match', () => {
    expect(patternCoversOrigin('https://host.example/*', 'http://host.example')).toBe(false);
  });

  it('a valid host pattern covers configured ports and IPv6 literals', () => {
    expect(patternCoversOrigin('http://127.0.0.1/*', 'http://127.0.0.1:45019')).toBe(true);
    expect(patternCoversOrigin('http://[::1]/*', 'http://[::1]:45019')).toBe(true);
  });

  it('rejects port-bearing patterns Firefox can store but cannot apply', () => {
    expect(patternCoversOrigin('http://127.0.0.1:45019/*', 'http://127.0.0.1:45019')).toBe(false);
    expect(patternCoversOrigin('http://[::1]:45019/*', 'http://[::1]:45019')).toBe(false);
  });

  it('malformed or foreign patterns fail closed', () => {
    expect(patternCoversOrigin('ftp://host.example/*', 'ftp://host.example')).toBe(false);
    expect(patternCoversOrigin('not a pattern', 'https://host.example')).toBe(false);
  });
});

describe('originCoveredByGrantedPatterns', () => {
  it('empty grant set covers nothing', () => {
    expect(originCoveredByGrantedPatterns('https://host.example', [])).toBe(false);
  });

  it('the PROSO-114 case: all_urls among the granted patterns passes', () => {
    expect(
      originCoveredByGrantedPatterns('https://host.example', [
        'https://logs.proso.com.br/*',
        '<all_urls>',
      ]),
    ).toBe(true);
  });

  it('an unrelated grant does not cover the origin', () => {
    expect(
      originCoveredByGrantedPatterns('https://host.example', ['https://logs.proso.com.br/*']),
    ).toBe(false);
  });
});
