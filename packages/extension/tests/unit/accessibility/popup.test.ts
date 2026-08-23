// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Accessibility Unit Tests - Popup
 *
 * Task: T077 (spec 056 — production readiness, User Story 6).
 *
 * Renders the real popup entrypoint markup (`src/entrypoints/popup/index.html`)
 * into jsdom and asserts axe-core reports zero critical/serious violations
 * (FR-027, FR-028, FR-030).
 *
 * The markup is the project's own static fixture (scripts stripped before
 * injection), so DOM parsing via the jsdom document is safe here.
 *
 * @module tests/unit/accessibility/popup.test
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { axe, criticalOrSerious, loadEntrypointFixture, renderFragment } from './render-entrypoint';

describe('Accessibility - Popup (T077)', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const body = loadEntrypointFixture(
      import.meta.url,
      '../../../src/entrypoints/popup/index.html',
    );
    cleanup = renderFragment(body);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the popup container with all tab panels', () => {
    expect(document.querySelector('[data-testid="popup-container"]')).not.toBeNull();
    expect(document.getElementById('panel-player')).not.toBeNull();
    expect(document.getElementById('panel-tools')).not.toBeNull();
    expect(document.getElementById('panel-queue')).not.toBeNull();
  });

  it('has no critical or serious accessibility violations', async () => {
    const results = await axe(document.body);
    expect(criticalOrSerious(results)).toHaveNoViolations();
  });

  it('exposes ARIA roles for the tablist and progress bar', () => {
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(document.querySelectorAll('[role="tabpanel"]').length).toBe(3);
    expect(document.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('labels current word highlighting as approximate', () => {
    const timingBasis = document.getElementById('timing-basis');
    expect(timingBasis?.getAttribute('role')).toBe('note');
    expect(timingBasis?.textContent).toContain('Word highlighting: approximate');
  });

  it('does not expose the inactive OCR control in Tools', () => {
    const ocr = document.getElementById('ocr-section') as HTMLElement;
    expect(ocr.hidden).toBe(true);
    expect(getComputedStyle(ocr).display).toBe('none');
  });

  it('labels every interactive control with an accessible name', () => {
    const controls = document.querySelectorAll<HTMLElement>('button, input[type="range"]');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of Array.from(controls)) {
      const hasName =
        (control.getAttribute('aria-label')?.trim().length ?? 0) > 0 ||
        (control.textContent?.trim().length ?? 0) > 0 ||
        control.querySelector('span, svg') !== null;
      expect(hasName).toBe(true);
    }
  });
});
