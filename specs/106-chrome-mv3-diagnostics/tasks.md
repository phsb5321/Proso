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

- [ ] Add `specs/106-chrome-mv3-diagnostics/{spec.md,plan.md,tasks.md}`.
- [ ] Add `scripts/chrome-mv3-diagnostics.mjs` with Chrome MV3 and Firefox MV2
  legs: worker/background audio-context assertion, popup start-journey
  assertion (fixture article + fixture TTS stub, TTS request observed), and
  message-roundtrip assertion.
- [ ] Wire the gate: Makefile target + `packages/extension/package.json`
  script.

## Verify and deliver

- [ ] Chrome MV3 leg RED on current main — capture command + exit code + RED
  output.
- [ ] Firefox MV2 leg GREEN — capture command + exit code + GREEN output.
- [ ] Fill the Verdict section with one chosen smallest change and a falsifier
  per candidate.
- [ ] `pnpm --filter @proso/extension check` passes; `git diff --check` passes.
- [ ] Commit, push, open the PR, wait for checks, squash-merge, and confirm
  `state=MERGED`.

## Reversal

One-line rollback after merge: `git revert <106-squash-sha>`.
