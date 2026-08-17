# Feature 183 — Tasks

## T-001 — Prove the vacuous guard (RED-before)

- [x] Rename `data-testid="settings-quick-settings-section"` →
  `…-PLANTED` in `packages/extension/src/entrypoints/settings.html`, rebuild,
  run `npx playwright test --project=firefox-visual -g "quick settings|form controls"`.
- [x] **Receipt (plant A, RED-before):** `quick settings section - light mode`
  **PASS** with the section testid renamed — the `count() > 0` guard makes the
  test a no-op. (`form controls focus state` failed only because its screenshot
  target vanished — the guard's subject is the provider select, not the section.)
- [x] Rename `data-testid="settings-provider-select"` → `…-PLANTED`, rebuild,
  run `-g "form controls"`.
- [x] **Receipt (plant B, RED-before):** `form controls focus state` **PASS**
  with the provider-select testid renamed — the `count() > 0` guard is a no-op.
- [x] Restore both renames (source clean).

## T-002 — Apply the PR #125 treatment

- [x] `quick settings section - light mode`: remove the `if (count() > 0)`
  wrapper; assert `toBeVisible()` on the section, `[data-testid="settings-provider-select"]`,
  `[data-testid="settings-voice-select"]`, `[data-testid="settings-speed-slider"]`,
  and `.section-reset-btn`; keep the screenshot sequence unchanged.
- [x] `form controls focus state`: remove the `if (count() > 0)` wrapper; assert
  `toBeVisible()` on the provider select (pre-focus) and on the quick-settings
  section (screenshot target); keep the focus + screenshot sequence unchanged.
- [x] Rebuild; control run: **both tests PASS, baselines unchanged** (2 passed, 5.4s).

## T-003 — Re-run the plants post-fix

- [x] Plant A (section testid renamed, rebuilt): **both tests FAIL**
  (`quick settings section` via the section `toBeVisible`; `form controls`
  via the section `toBeVisible` + screenshot target).
- [x] Plant B (provider-select testid renamed, rebuilt): **both tests FAIL**
  (`quick settings section` via the provider-select `toBeVisible`; `form controls`
  via its own provider-select `toBeVisible`).
- [x] Restore renames (source clean).

## T-004 — Spec artifacts + gate

- [x] `specs/183-quicksettings-visual/{spec,plan,tasks}.md` written and tracked
  in this diff.
- [x] `nix-shell --run "make verify"` exits 0.

## T-005 — Ship

- [ ] Commit (conventional), push branch `183-quicksettings-visual`.
- [ ] Open PR titled `test(visual): …` with both plant receipts pasted.
- [ ] Do NOT merge.
