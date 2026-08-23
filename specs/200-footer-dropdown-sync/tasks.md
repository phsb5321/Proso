# Tasks — 200-footer-dropdown-sync

- [x] T001 Record the pre-fix receipts in `specs/200-footer-dropdown-sync/research.md`: language override stored in `globalOverride` while `playback.start` reads only per-tab state; footer speed change never reaches the settings store; dropdown option highlights stale after external updates; full `_render()` on every speed/language pick.
- [x] T002 Language authority: `language.setOverride` writes the active tab's per-tab override, live-applies via an injected `setPlaybackLanguage` dep (wired to `PlaybackService.setLanguage`), and broadcasts; `language.clearOverride` clears both stores and re-applies the detected language.
- [x] T003 Wire `setPlaybackLanguage` in `background/init-hexagonal.ts`.
- [x] T004 `PlaybackService.setSpeed` persists the clamped speed through the injected settings store (idempotent with the existing settings subscription).
- [x] T005 `StickyFooter.updateState` refreshes speed-option and language-option active/aria-selected alongside button text.
- [x] T006 Speed action and language selection use targeted `updateState` updates — no full `_render()` for one-value changes.
- [x] T007 Escape closes both dropdowns; a document mousedown outside the footer closes both.
- [x] T008 Unit tests: language handlers (per-tab write, live-apply, clear restore), playback service (speed persisted), footer UI (dropdown refresh, Escape, outside click).
- [x] T009 Run focused suites, `make verify`, and the repo's browser/user gate for the affected surfaces; retain receipts.
- [x] T010 Commit atomic slices, run an exact-head different-family adversarial panel, resolve every finding, push, open the PR, squash-merge, confirm `state=MERGED`.
- [ ] T011 Update `docs/reading-journey-status.md` and remove the feature worktree; confirm shared `main` clean.
