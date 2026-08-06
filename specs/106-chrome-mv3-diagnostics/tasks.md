# Tasks — Feature 106

## Audit

- [x] Confirm the worktree `proso-106-chrome-mv3-diagnostics` is isolated and
  at `origin/main` (`64e2fee`).
- [x] Verify the ledger premises against code: `new Audio()` in
  `PlaybackService.attachAndPlay` (no try/catch), no IAudioPlayer wiring in
  `composition/` or `entrypoints/background*`, offscreen document + protocol
  shipped in the Chrome build but unreferenced.
- [x] Verify the ✗ ledger row: Chromium E2E audio/stability specs can pass
  with zero observed TTS requests and clear their console-error state.
- [x] Confirm environment: `google-chrome` (system), `firefox-nightly`,
  geckodriver, fixture server lib, Playwright resolvable from
  `packages/extension`.

## Implement

- [x] Add `specs/106-chrome-mv3-diagnostics/{spec.md,plan.md,tasks.md}`.
- [x] Add `scripts/chrome-mv3-diagnostics.mjs` with Chrome MV3 and Firefox MV2
  legs: worker/background audio-context assertion, popup start-journey
  assertion (fixture article + fixture TTS stub, TTS request observed), and
  message-roundtrip assertion.
- [x] Wire the gate: Makefile target + `packages/extension/package.json`
  script.

## Verify and deliver

- [x] Chrome MV3 leg RED on current main — C1 (`typeof Audio === 'undefined'`
  in worker) and C2 (journey never reaches playing; 4 TTS requests observed,
  footer visible) fail; receipt in spec.md and `/tmp/proso-106-chrome-red.log`.
- [x] Firefox MV2 leg GREEN — C1 `typeof Audio === 'function'` in the
  background page; C2 all four sub-assertions pass (Loading... → Playing, 3 TTS
  requests, footer visible); receipt in spec.md and
  `/tmp/proso-106-firefox-green.log`.
- [x] Fill the Verdict section with one chosen smallest change and a falsifier
  per candidate.
- [x] `pnpm --filter @proso/extension check` passes; `git diff --check` passes.
- [ ] Commit, push, open the PR, wait for checks, squash-merge, and confirm
  `state=MERGED`.

## Reversal

One-line rollback after merge: `git revert <106-squash-sha>`.
