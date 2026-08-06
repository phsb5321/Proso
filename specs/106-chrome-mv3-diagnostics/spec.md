# Feature 106 — Chrome MV3 reading diagnostics

## Goal

Turn the two known Chrome MV3 reading-journey failures from a one-off Docker
observation into a retained, deterministic, committed diagnostic, and name the
smallest Chrome-specific architecture change that fixes both — without
inferring a Firefox regression.

The ledger rows this feature operationalizes
(`docs/reading-journey-status.md`):

- ◐ "A Docker diagnostic reached the content script but the popup stayed
  `Loading...`; the Promise response was lost and MV3 worker `Audio` was
  undefined. The diagnostic was temporary, not a retained gate."
- ✗ "The existing Chromium audio E2E proves reading works — It can pass
  without initiating or observing a TTS request and clears errors."
- Next verified slices item 2 (verbatim): "Reproduce Chrome's message-response
  and audio-context failures in committed diagnostics, then choose the smallest
  Chrome-specific architecture change. Do not infer a Firefox regression."

## Requirements

- **FR-001:** A retained diagnostic runs on the Chrome MV3 build and exits RED
  when (a) the popup/start message Promise response is lost (popup stuck on
  `Loading...`) and when (b) `Audio` is undefined in the MV3 worker context.
- **FR-002:** The same diagnostic exits GREEN when both conditions work: the
  audio context the playback path uses is functional, and the popup start
  journey completes to a playing state with its message response received.
- **FR-003:** The diagnostic also runs on the Firefox MV2 build and must stay
  GREEN there — non-regression proven by assertion, not by absence. If it
  cannot run on Firefox, the exact reason is reported as a finding, not a
  license to skip.
- **FR-004:** The journey assertion is deterministic and self-contained: a
  local fixture article and a local Proso API stub; a TTS request must actually
  be observed leaving the extension (the ✗ ledger row above is the contrast —
  the existing Chromium suite can pass without one).
- **FR-005:** The diagnostic is wired into the delivery harness like the
  existing gates (Makefile target; package script), named, and exit-code
  graded (0 = all checks pass, 1 = any check fails).
- **FR-006:** The verdict names the smallest Chrome-specific architecture
  change that fixes both failures, chosen among real candidates, each with a
  falsifier (what would disprove that it is the smallest / that it works).
- **FR-007:** Spec, plan, and tasks ship in the same diff as the diagnostic.

## Acceptance

- `node scripts/chrome-mv3-diagnostics.mjs` on current `main`-based Chrome MV3
  build exits 1 and prints the failing check(s); the RED output is pasted in
  the delivery report with its command and exit code.
- The same command on the Firefox MV2 build exits 0; the GREEN output is
  pasted with its command and exit code.
- The failing checks on Chrome map one-to-one onto the two ledger failure
  modes: worker audio context and start-journey/response.
- `pnpm --filter @proso/extension check` (Biome) passes; `git diff --check`
  passes; commits are conventional and atomic.
- The verdict section names exactly one smallest change with a falsifier per
  candidate considered.

## Out of scope

- Implementing the chosen fix (a follow-up slice applies the verdict).
- Any change to the Firefox path to make Chrome pass.
- `.github/workflows/*`, prod/server configuration, secrets, the vault.
- Edits to `docs/reading-journey-status.md` (read-only for this feature; its
  ledger rows are inputs, not outputs).

## Verdict

**Chosen smallest change — a worker-safe `Audio` shim over the shipped offscreen
document.**

`PlaybackService` constructs `new Audio()` directly (and reads `src`, `play`,
`pause`, `currentTime`, `duration`, `paused`, `playbackRate`, and the
`timeupdate`/`ended`/`error` events — ~15 touchpoints, no port). Chrome MV3
service workers have no DOM, so `Audio` is undefined there and the first
playback attempt throws, killing the whole start journey. The minimal
Chrome-specific fix is to make `Audio` exist in the worker: a small
`OffscreenAudioElement` class installed in the background entrypoint only when
`typeof Audio === 'undefined'` (the guard never fires on Firefox MV2, so the
Firefox path is untouched), proxying that exact HTMLMediaElement surface to the
already-shipped offscreen document (`offscreen.html` + `LOAD_AUDIO`/`PLAY`/
`PAUSE`/`STOP`/`SEEK`/`SET_SPEED`/`GET_STATE`/`OFFSCREEN_EVENT` protocol — dead
code today, verified in `.output/chrome-mv3`), plus the `"offscreen"` manifest
permission (Chrome-only, via a WXT per-browser manifest transform) and lazy
`chrome.offscreen.createDocument`. Zero PlaybackService changes; one new file;
one wiring line.

**Empirical constraints the chosen change must satisfy** (measured 06/08/2026):

- `chrome.offscreen` is **undefined without the `"offscreen"` permission** in
  Chrome for Testing 151 — verified by patching the built manifest
  (`typeof chrome.offscreen` flipped from `undefined` to `object`). The
  offscreen-based fix must add that permission, and it must be Chrome-only:
  `"offscreen"` is not a Firefox permission.
- `chrome.runtime.reload()` leaves the extension unregistered in headless
  Chromium; the diagnostic reboots via a two-phase launch on one profile.
- Branded Google Chrome 137+ rejects `--load-extension` ("not allowed in
  Google Chrome, ignoring") — the diagnostic therefore drives the
  Playwright-bundled Chromium (Chrome for Testing) with a NixOS-derived
  `LD_LIBRARY_PATH`. The repo's own `test:e2e:ext` suite cannot run on this
  host as-is for the same reason (environment finding, not a code defect).

## Candidates and falsifiers

| Candidate | Why not smallest / what would disprove it |
|---|---|
| **A. Worker `Audio` shim → offscreen document** (chosen) | Build it and run the diagnostic: C1 stays RED if the shim is not installed; C2 stays RED if offscreen creation fails, the event protocol drops messages, or `duration` is never populated. A green Chrome run with `typeof Audio === 'function'` in the worker and C2 playing proves it. |
| **B. Wire the existing `OffscreenAudioAdapter`/`DirectAudioAdapter` (IAudioPlayer) and refactor PlaybackService onto the port** | Strictly larger: ~15 audioElement touchpoints plus a port that lacks `src`/`paused`/`currentTime` semantics; both adapters are unwired dead code with their own hazards (whole-MP3 `Array.from` transfer through messages). Falsifier: the diagnostic must stay GREEN on Firefox MV2 (any Firefox regression disproves it) and go GREEN on Chrome. |
| **C. Fix the message-response path only** (popup timeout/retry) | Cannot fix both by construction: with only C, C1 and C2 stay RED because `Audio` is still undefined in the worker. The diagnostic itself is the falsifier. |
| **D. Move playback into the content script** (the page has `Audio`) | Larger cross-context refactor and changes the Firefox path; rejected on size before testing. Falsifier: C2 must still complete with the footer/word-sync loop intact. |

## Receipts (06/08/2026)

Chrome MV3 leg on current `main` (RED — both failures reproduced):

```bash
$ node scripts/chrome-mv3-diagnostics.mjs --chrome ; echo $?
  ok   fixture server started — http://127.0.0.1:35415
  ok   chrome-mv3 build present — .../.output/chrome-mv3
  ok   chromium binary — .../chromium-1234/chrome-linux64/chrome
  ok   nix-store LD_LIBRARY_PATH derived — 20 lib dirs
  ok   fixture API configured in profile — http://127.0.0.1:35415 (read back: ...)
  ok   extension service worker — chrome-extension://gpbclhlenbjcnlidhmickpgmhnafilni/background.js
  ok   extension booted against fixture API — http://127.0.0.1:35415
  FAIL  C1 worker audio context — typeof Audio === 'undefined' in MV3 worker; \
        offscreen probe: {"offscreenApi":"undefined","getContexts":"function"}
  ok   C3 popup roundtrip — playback.getState answered {...}
  FAIL  C2 popup start journey — initial status 'Ready'; left Loading...: \
        '[object Object]'; reached playing: Timed out waiting for popup status \
        to reach Playing/Paused (last value: null); TTS requests observed by \
        fixture stub: 4; footer on article: visible
chrome-mv3-diagnostics FAIL — 10 check(s), 2 failed: C1 worker audio context, \
  C2 popup start journey
$ echo $?
1
```

Firefox MV2 leg (GREEN — non-regression by assertion; the same four journey
sub-assertions pass on the working architecture):

```bash
$ node scripts/chrome-mv3-diagnostics.mjs --firefox ; echo $?
  ok   firefox-mv2 build present — .../.output/firefox-mv2
  ok   built extension installed in Firefox
  ok   extension reloaded against fixture API — http://127.0.0.1:42621
  ok   popup page loaded
  ok   C1 background audio context — typeof Audio === 'function' in Firefox background page
  ok   C3 popup roundtrip — playback.getState answered {...}
  ok   popup Play clicked (article tab stays active)
  ok   C2 popup start journey — all four sub-assertions passed (entered journey: \
        'Loading...'; left Loading...: 'Playing'; reached playing: 'Playing'; \
        TTS requests observed by fixture stub: 3; footer on article: visible)
chrome-mv3-diagnostics PASS — 9 check(s), 0 failed
$ echo $?
0
```

Combined run (the retained gate): `node scripts/chrome-mv3-diagnostics.mjs` →
18 checks, 2 failed (both on Chrome), exit 1; Firefox leg green throughout.
Full logs: `/tmp/proso-106-chrome-red.log`, `/tmp/proso-106-firefox-green.log`,
`/tmp/proso-106-both.log`.
