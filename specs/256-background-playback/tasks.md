# Tasks — Feature 256 (background playback)

Ordered; each task names its falsifiable check. `[x]` marks work actually done
in this branch.

- [x] T001 — Polarity helper `utils/config/background-playback.ts` with unit
  tests proving stored `true` (stop) maps to "background playback off" and that
  a missing key falls back to the documented default.
- [x] T002 — `background/view-unload-policy.ts`: detach when background playback
  is enabled, stop when disabled, no-op when the reloading tab is not the
  playing tab or nothing is playing. Unit tests cover all four combinations.
- [x] T003 — `PlaybackService.detachVisualAttachment()` + detached flag;
  `checkHighlight` must not stop on a lost view while detached (or while the
  preference is on). Unit tests for both branches.
- [x] T004 — `entrypoints/content.ts` sends `playback.viewUnloaded`; `playback.stop`
  remains the explicit user stop from the popup.
- [x] T005 — `playback.viewUnloaded` handler registered, idempotent, `__tabId` bound
  from the sender.
- [x] T006 — Settings UI relabelled positively with an honest hint; same stored key.
- [x] T007 — Popup distinguishes playing-here / playing-elsewhere / view-closed and
  offers "Open the page" when the playing tab still exists.
- [ ] T008 — Loaded-Firefox journey: start reading, switch tab, wait through a
  quiet gap, assert audio time advances; navigate the source tab, assert audio
  continues; reload the source tab, assert audio continues; disable the option
  and assert playback stops on leaving. Record the event-page lifetime finding.
- [ ] T009 — Popup toggle for the new preference (one click from the toolbar),
  with its own test.
- [ ] T010 — Toolbar badge + action title while audio plays (global orientation).
- [ ] T011 — Deferred to later slices, tracked here so they are not silently
  assumed: Media Session progressive enhancement, sleep timer, sidebar/PiP
  player, durable resume (Feature 252).
