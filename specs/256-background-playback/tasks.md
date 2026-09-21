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
  offers "Open the source tab" when the playing tab still exists, focusing its
  window. Original title and live-audio evidence now reach getState/broadcast;
  detached delivery does not depend on the content script. Fresh starts require
  explicit Stop before replacing an existing session; Resume is authoritative.
  Popup, handler, adapter and service unit tests cover these paths.
- [ ] T008 — Loaded-Firefox journey: start reading, switch tab, wait through a
  quiet gap, assert audio time advances; navigate the source tab, assert audio
  continues; reload the source tab, assert audio continues; disable the option
  and assert playback stops on leaving. Record the event-page lifetime finding.
- [x] T009 — Native popup toggle "Keep listening when I leave this page" uses
  the polarity helper and legacy storage key. Visible On/Off, aria-pressed,
  keyboard focus, external storage changes and write failure are unit-covered;
  disclosure names browser lifetime, continued synthesis/credits and titles.
- [x] T010 — Global toolbar badge + original document title while audio is live;
  cleared on pause, waiting, stop/error (including a vanished tab). Adapter writes
  are serialized and deduplicated; no paragraph notifications or badge progress.
  Unit tests cover publication, transitions and lack of repeat progress writes.
- [ ] T011 — Deferred to later slices, tracked here so they are not silently
  assumed: Media Session progressive enhancement, sleep timer, sidebar/PiP
  player, durable resume (Feature 252).

## 256b verification — 20/09/2026

`[x]` above means implemented and unit-tested, not released or full Feature 095
acceptance. Work stays in `256b-popup-affordances`; no push requested.

- `pnpm --filter @proso/extension lint`: exit 0, 200 files, 68 warnings.
- `pnpm --filter @proso/extension exec tsc --noEmit`: exit 0 after `wxt prepare`.
- From `packages/extension`: `NODE_OPTIONS=--experimental-vm-modules npx jest
  --selectProjects unit --selectProjects contract`: exit 0; 161 suites passed,
  3,241 tests passed, one existing skipped suite/test; no Jest snapshots.
- `make fuzz`: exit 0; 11 tests across extension/server, seed `20260730`,
  `FC_NUM_RUNS=100`. Replay: `FC_SEED=20260730 FC_NUM_RUNS=100 make fuzz`.
- `make user-gate`: exit 2 by the Feature 095 fail-closed boundary. Its Firefox
  build and internal-dispatch smoke passed (three TTS requests, visible reading,
  pause holds position, resume advances). This is diagnostic-only.
- `make public-actor-gate`: first run exit 2, missing visible Pause immediately
  after observing its name. First replay of `node scripts/public-actor-gate.mjs`
  and a second replay passed Play → Pause → Resume. The first anomaly is
  retained; this is not stable acceptance of the new attention behaviors or T008.
- `GENERATOR_FAMILY=openai make gate`: exit 2 at doctor, missing generated
  server Prisma client. Direct Prisma generation fails on the unavailable
  NixOS engine checksum (404). No cross-family reviewer verdict was obtained.

Logs: `/tmp/256-{lint,tsc,jest}-final.log`, `/tmp/256-fuzz.log`,
`/tmp/256-user-gate.log`, `/tmp/256-gate.log`,
`/tmp/256-public-actor{,-replay,-replay2}.log`; first-failure receipt:
`/tmp/256-public-actor-first-receipt.json`. Browser receipts and screenshots are
under `.artifacts/{smoke-reading,public-actor-gate}/`. Their HEAD is the branch
base `c4d89a2`; they exercised the uncommitted build, not an exact-head release.
The new controls' browser acceptance, T008's switch/navigation/reload campaign,
visual snapshot refresh and a cross-family review remain outstanding.
