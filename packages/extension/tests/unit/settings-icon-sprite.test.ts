// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Settings Icon Sprite
 *
 * The settings page draws its repeated glyphs by referencing one `<symbol>`
 * definition instead of re-inlining the path data at every site. A reference
 * that names a symbol which is not there renders nothing at all — no console
 * error, no failed request, just a chevron or a button icon that quietly
 * disappears. This is the check that notices.
 *
 * @module tests/unit/settings-icon-sprite.test
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_HTML = path.resolve(__dirname, '../../src/entrypoints/settings.html');

function readSettingsMarkup(): string {
  return fs.readFileSync(SETTINGS_HTML, 'utf-8');
}

function matchAll(markup: string, pattern: RegExp): string[] {
  return [...markup.matchAll(pattern)].map((match) => match[1]);
}

const definedSymbols = (markup: string): string[] => matchAll(markup, /<symbol id="([^"]+)"/g);
const referencedSymbols = (markup: string): string[] => matchAll(markup, /<use href="#([^"]+)"/g);

describe('settings icon sprite', () => {
  it('resolves every <use> reference to a symbol defined in the same document', () => {
    const markup = readSettingsMarkup();
    const defined = new Set(definedSymbols(markup));
    const dangling = referencedSymbols(markup).filter((id) => !defined.has(id));

    expect(dangling).toEqual([]);
  });

  it('references every symbol it defines', () => {
    // A symbol nobody draws is dead weight the bundler cannot see: it is markup,
    // not code, so neither knip nor tree-shaking will ever report it.
    const markup = readSettingsMarkup();
    const referenced = new Set(referencedSymbols(markup));
    const unused = definedSymbols(markup).filter((id) => !referenced.has(id));

    expect(unused).toEqual([]);
  });

  it('has references to check', () => {
    // Both assertions above pass trivially on markup with no <use> at all, which
    // is exactly what a botched find-and-replace would leave behind.
    expect(referencedSymbols(readSettingsMarkup()).length).toBeGreaterThan(0);
  });
});
