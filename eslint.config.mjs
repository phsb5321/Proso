// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Webextension globals for the NixOS code-slop pre-commit gate's eslint pass.
 *
 * This repository has no runtime eslint setup (Biome is the linter); this file
 * exists so `aislop scan` (the universal code-slop backstop) does not report
 * WXT auto-imports and webextension globals as `no-undef` errors. It is inert
 * for biome, tsc, and the build. The globals mirror the extension's real
 * runtime surface: `chrome`/`browser` in extension contexts, and WXT's
 * auto-imported entrypoint wrappers (`defineContentScript`, `defineBackground`).
 */
export default [
  {
    languageOptions: {
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        defineContentScript: 'readonly',
        defineBackground: 'readonly',
      },
    },
  },
];
