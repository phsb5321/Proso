// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Extension-page boundary (PROSO-130).
 *
 * The content script must never run on the extension's OWN pages
 * (moz-extension:// / chrome-extension://): stamping paragraph affordances
 * and injecting !important styles into the settings page is what produced the
 * pink play-triangle over "Proso Settings". The manifest's `exclude_matches`
 * is the real fix; this guard is the belt-and-braces layer that survives a
 * manifest refactor. Pure logic — directly unit-testable.
 *
 * @module utils/content/extension-page
 */

/**
 * True when `url` is one of the extension's own pages. Also covers the
 * browser-internal schemes that must never host page UI.
 */
export function isExtensionPage(url: string): boolean {
  return (
    url.startsWith('moz-extension://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome://')
  );
}
