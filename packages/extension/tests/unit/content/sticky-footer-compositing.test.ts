/**
 * Sticky Footer Compositing Cost Unit Tests (#194)
 *
 * The player footer is position:fixed and full-width, and it is on screen for
 * the whole reading session. A backdrop-filter on it makes the compositor
 * snapshot the region behind it and blur it into an intermediate render target
 * every frame that region is damaged -- and Proso damages it continuously
 * during playback (60fps rAF word sync behind it, scrollIntoView under it).
 *
 * These are guard tests, not style preferences: they fail if a backdrop filter
 * is reintroduced into the injected footer CSS.
 *
 * @module tests/unit/content/sticky-footer-compositing
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const footerSource = readFileSync(
  resolve(__dirname, '../../../src/utils/content/sticky-footer.ts'),
  'utf8',
);

/** Strip block/line comments so the guard reads CSS, not prose about it. */
const withoutComments = footerSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('sticky footer compositing cost (#194)', () => {
  it('injects no backdrop-filter', () => {
    const matches = withoutComments.match(/backdrop-filter\s*:/g) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('injects no -webkit-backdrop-filter', () => {
    const matches = withoutComments.match(/-webkit-backdrop-filter\s*:/g) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('keeps the footer background opaque', () => {
    // A translucent footer would reintroduce the temptation to blur behind it.
    expect(withoutComments).toMatch(/\.footer\s*\{[\s\S]*?background:\s*var\(--footer-bg\)\s*;/);
    expect(withoutComments).not.toMatch(
      /\.footer\s*\{[\s\S]*?background:\s*color-mix\([^)]*transparent/,
    );
  });
});
