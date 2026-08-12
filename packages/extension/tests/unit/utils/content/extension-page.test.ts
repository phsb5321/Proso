/**
 * Content-script boundary tests (PROSO-130 falsifier D).
 *
 * The content script must never run on the extension's own pages: the
 * manifest key (exclude_matches) is the real fix, the isExtensionPage guard
 * is what survives a manifest refactor. Removing EITHER must fail a test,
 * not a user.
 *
 * @module tests/unit/utils/content/extension-page
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isExtensionPage } from '../../../../src/utils/content/extension-page';

describe('isExtensionPage', () => {
  it('covers the extension's own pages', () => {
    expect(isExtensionPage('moz-extension://8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90/settings.html')).toBe(true);
    expect(isExtensionPage('chrome-extension://okijlcbmbfleifobcjkamiibfkdimd/popup.html')).toBe(true);
  });

  it('covers browser-internal pages', () => {
    expect(isExtensionPage('about:config')).toBe(true);
    expect(isExtensionPage('chrome://settings')).toBe(true);
  });

  it('never blocks article pages', () => {
    expect(isExtensionPage('https://example.com/article')).toBe(false);
    expect(isExtensionPage('http://127.0.0.1:8080/article')).toBe(false);
    expect(isExtensionPage('file:///tmp/article.html')).toBe(false);
  });
});

describe('content-script boundary is pinned (falsifier D)', () => {
  const contentSource = readFileSync(
    resolve(__dirname, '../../../../src/entrypoints/content.ts'),
    'utf8',
  );
  const wxtSource = readFileSync(
    resolve(__dirname, '../../../../wxt.config.ts'),
    'utf8',
  );

  it('injects exclude_matches into the MV3 manifest (per-browser: Firefox rejects extension-scheme patterns)', () => {
    expect(wxtSource).toContain('build:manifestGenerated');
    expect(wxtSource).toContain('exclude_matches');
    expect(wxtSource).toContain('chrome-extension://*/*');
  });

  it('keeps the early-return guard in content.ts main()', () => {
    expect(contentSource).toContain('isExtensionPage(window.location.href)');
    // The guard must run before any injection: it appears before the styles
    // injection call.
    const guardIndex = contentSource.indexOf('isExtensionPage(window.location.href)');
    const injectIndex = contentSource.indexOf('injectContentStyles();');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(injectIndex).toBeGreaterThan(guardIndex);
  });
});
