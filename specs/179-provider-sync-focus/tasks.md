# Feature 179 tasks

## 1. Understand the clobber path

- [x] Read `docs/reading-journey-status.md` slice #22 (cross-tab listener fires
  for the page's own writes; pre-#147 data loss, post-#147 cosmetic caret jump).
- [x] Trace: `setupLocalHostEventListeners` input → debounced
  `saveLocalHostSettings` → storage write → `setupStorageChangeListener` →
  `syncProviderUI` reassigns `localHostUrl.value`.

## 2. Fix (smallest correct)

- [x] `provider-state.ts`: `ProviderUI.isLocalHostUrlFocused?: () => boolean`;
  `syncProviderUI` skips `localHostUrl.value` while the guard is true (absent ⇒
  unchanged behavior).
- [x] `controller.ts`: `OptionsElements.isLocalHostUrlFocused?` wired in
  `getElements()` to `document.activeElement === elements?.localHostUrl`; all
  three `syncProviderUI(elements, …)` call sites inherit it.

## 3. Regression — both directions, runnable

- [x] `tests/unit/utils/options/provider-state.test.ts`:
  - Direction A (focused): sync must NOT reassign the in-flight value —
    **FAILS pre-fix** (`Expected: "http://127.0.0.1:8899" / Received:
    "https://host.example/tts"`), passes post-fix.
  - Direction B (not focused / absent guard): stored URL still lands.
  - Shield: provider/enable/voice sync while the URL field is guarded.

## 4. Deterministic gates

- [ ] Focused unit suite green (8/8, both directions proven).
- [ ] `nix-shell --run "make verify"` exits 0.
- [ ] Extension lint no new warnings; `tsc --noEmit` clean.

## 5. Delivery (DO NOT MERGE — report only)

- [ ] `specs/179-provider-sync-focus/{spec,plan,tasks}.md` committed with the diff.
- [ ] Commit + push `179-provider-sync-focus`.
- [ ] Open PR titled `fix(settings): ...`; report PR number + falsifier receipts.
