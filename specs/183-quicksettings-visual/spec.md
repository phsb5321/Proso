# Feature 183 — Repair the vacuous quick-settings visual tests

## Status: Proposed

## Problem

The two quick-settings visual tests in `packages/extension/tests/visual/settings-page.test.js`
carry the same vacuous `count() > 0` guard that the api-keys tests had before PR #125:

```js
const quickSettings = page.locator('[data-testid="settings-quick-settings-section"]');
if ((await quickSettings.count()) > 0) {
  // … screenshot …
}
```

When the guarded element is missing, the guard makes the whole test a no-op that
**PASSES**. A future refactor that drops `data-testid="settings-quick-settings-section"`
or `data-testid="settings-provider-select"` from `settings.html` would be silently
invisible to the visual suite — the exact defect PR #125 eliminated for the api-keys
section, still present for the quick-settings surface.

Affected tests:

- `quick settings section - light mode` (guard on the section testid)
- `form controls focus state` (guard on the provider-select testid — a
  quick-settings control whose screenshot target is the quick-settings section)

## Scope

- Remove the `count() > 0` guards from both tests (do not merely satisfy them).
- Assert `toBeVisible()` on the quick-settings section and its controls
  (provider select, voice select, speed slider, reset button) before the
  snapshot, mirroring the PR #125 treatment.
- Keep the screenshot baselines byte-stable (same page, same rendering —
  no baseline churn expected).

## Out of scope

- The `appearance` / `sidebar` visual tests (their own `count() > 0` guards are
  a separate surface; this feature is the quick-settings slice).
- The file://-harness baseline limitation recorded in slice #20 (settings
  visual baselines may encode unstyled DOM where the module script and
  stylesheet do not load). Not fought here; no new vacuous assertions added.
- Any settings.html markup change (the DOM is the fixture, not the fix).

## Non-goals

- No new assertions of the "asserting nothing" class.
- No baseline regeneration.

## Success criteria

1. `npx playwright test --project=firefox-visual -g "quick settings|form controls"`
   exits 0 on the canonical DOM.
2. Renaming `settings-quick-settings-section` in `settings.html` makes the
   quick-settings test FAIL (plant receipt recorded).
3. Renaming `settings-provider-select` in `settings.html` makes the
   form-controls test FAIL (plant receipt recorded).
4. `make verify` exits 0.
