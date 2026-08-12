/**
 * Match-pattern coverage tests (PROSO-114).
 *
 * The local-host gate must judge EFFECTIVE access: an install-time
 * all_urls grant covers a configured origin even though
 * permissions.contains() (the optional-grant proxy) would say no.
 *
 * @module tests/unit/utils/permissions/match-pattern
 */

import { describe, expect, it } from '@jest/globals';
import {
  originCoveredByGrantedPatterns,
  patternCoversOrigin,
} from '../../../../src/utils/permissions/match-pattern';

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
