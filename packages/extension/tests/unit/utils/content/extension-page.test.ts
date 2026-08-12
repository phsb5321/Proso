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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExtensionPage } from '../../../../src/utils/content/extension-page';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('isExtensionPage', () => {
  it("covers the extension's own pages", () => {
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

  it('keeps the early-return guard in content.ts main(), before any injection', () => {
    expect(contentSource).toContain('isExtensionPage(window.location.href)');
    const guardIndex = contentSource.indexOf('isExtensionPage(window.location.href)');
    const injectIndex = contentSource.indexOf('injectContentStyles();');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(injectIndex).toBeGreaterThan(guardIndex);
  });

  it('never reintroduces the broken manifest key (both browsers reject extension-scheme content-script patterns — measured PROSO-130)', () => {
    // Firefox: "Extension is invalid"; Chrome MV3: extension fails to load.
    // If someone re-adds exclude_matches with extension schemes, the builds
    // break and this test fails BEFORE the user does.
    expect(contentSource).not.toMatch(/excludeMatches\s*:\s*\[['"]moz-extension/);
  });
});
