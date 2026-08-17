# Feature 183 — Plan (quick-settings visual tests, PR #125 treatment)

## Context

The api-keys visual tests were repaired in PR #125 by removing the vacuous
`count() > 0` guard and asserting `toBeVisible()` on the section and its
controls (with DOM-state accordion expansion because the file:///harness
cannot run `options/main.ts`). The quick-settings tests still carry the old
guard. This feature applies the same treatment to them, minus the accordion
step (the quick-settings section is a plain always-visible card).

## Evidence-first sequence (receipts recorded)

1. **RED-before plant A** — rename `data-testid="settings-quick-settings-section"`
   in `packages/extension/src/entrypoints/settings.html`, rebuild, run the two
   tests: `quick settings section` still PASSES (guard is a no-op). Restore.
2. **RED-before plant B** — rename `data-testid="settings-provider-select"`,
   rebuild, run: `form controls focus state` still PASSES. Restore.
3. Apply the fix (below).
4. **Control** — canonical DOM: both tests PASS, baselines unchanged.
5. **Post-fix plants** — re-run plant A and plant B: both tests now FAIL.

## The fix

In `packages/extension/tests/visual/settings-page.test.js`:

- `quick settings section - light mode`: delete the `if (count() > 0)` wrapper;
  assert `toBeVisible()` on the section, the provider select, the voice select,
  the speed slider, and the reset button; keep the existing
  `scrollIntoViewIfNeeded` + `waitForLayoutStable` + screenshot sequence.
- `form controls focus state`: delete the `if (count() > 0)` wrapper; assert
  `toBeVisible()` on the provider select (before focus) and on the
  quick-settings section (the screenshot target); keep the existing focus +
  screenshot sequence.

## Verification

- `nix-shell --run "make verify"` must exit 0.
- The two plant receipts (RED-before: still PASS; post-fix: FAIL) are pasted
  into this diff's spec/tasks and the PR description.

## Risks

- **Baseline churn**: `toBeVisible` does not change layout; the screenshot
  sequence is unchanged, so no baseline updates are expected. If a baseline
  does drift, the drift is evidence of a real rendering change and must be
  reviewed before regenerating.
- **Harness limitation (slice #20)**: settings visual baselines may encode
  unstyled DOM over file://. Not in scope to fight here; the new assertions
  are visibility assertions on the real testids, not pixel assertions, so they
  hold regardless of styling.
