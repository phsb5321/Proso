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

[Pending — filled after the diagnostic reproduces both failures and the
Firefox leg stays green. One chosen change, one falsifier per candidate.]
