// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Accessibility Unit Tests - Settings Page
 *
 * Task: T076 (spec 056 — production readiness, User Story 6).
 *
 * Renders the real settings entrypoint markup (`src/entrypoints/settings.html`)
 * into jsdom and asserts axe-core reports zero critical/serious violations
 * (FR-027, FR-028).
 *
 * The markup is the project's own checked-in fixture (scripts stripped before
 * injection), so DOM parsing via the jsdom document is safe here.
 *
 * @module tests/unit/accessibility/settings.test
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { axe, criticalOrSerious, loadEntrypointFixture, renderFragment } from './render-entrypoint';

describe('Accessibility - Settings Page (T076)', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const body = loadEntrypointFixture(import.meta.url, '../../../src/entrypoints/settings.html');
    cleanup = renderFragment(body);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the settings container and navigation landmarks', () => {
    expect(document.querySelector('.container')).not.toBeNull();
    expect(document.querySelector('header')).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Settings navigation"]')).not.toBeNull();
  });

  it('has no critical or serious accessibility violations', async () => {
    const results = await axe(document.body);
    expect(criticalOrSerious(results)).toHaveNoViolations();
  });

  it('provides a skip link to the main content', () => {
    const skipLink = document.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skipLink).not.toBeNull();
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
  });

  it('associates the theme selector with a label', () => {
    const select = document.getElementById('themeMode');
    expect(select).not.toBeNull();
    const hasName =
      (select?.getAttribute('aria-label')?.trim().length ?? 0) > 0 ||
      document.querySelector('label[for="themeMode"]') !== null;
    expect(hasName).toBe(true);
  });

  it('exposes the tab-focus behavior as a named checkbox with an explanation', () => {
    const checkbox = document.getElementById('stopPlaybackOnTabChange') as HTMLInputElement | null;
    const label = checkbox?.closest('label');
    const hintId = checkbox?.getAttribute('aria-describedby');

    expect(checkbox?.type).toBe('checkbox');
    expect(label?.textContent).toContain('Stop playback when switching tabs');
    expect(hintId).toBe('stopPlaybackOnTabChangeHint');
    expect(document.getElementById(hintId ?? '')?.textContent).toContain('background listening');
  });
});
