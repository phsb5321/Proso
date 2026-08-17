# Feature 182 — Remove the historical mocked `window.speechSynthesis` example (slice #12)

**Created**: 17/08/2026 | **Status**: spec — planned for implementation in this slice.

## Problem

`docs/firefox-extension-testing-strategy.md` section 4.4 "Audio Playback Testing" contains a
15-line example mocking `window.speechSynthesis`. Browser `speechSynthesis` was deliberately
removed from this product in commit `9797dc6` (AGENTS.md, Firefox-First guideline 4: "browser
speechSynthesis was deliberately removed; do not reintroduce it without a new decision"). No
test in the repository models it. PR #113 reconciled this same claim class everywhere else
(`docs/architecture/`, `docs/PRE_LAUNCH_CHECKLIST.md`) and deliberately left this example out
of scope — slice #12 closes that gap.

A testing-strategy doc that describes a removed API is worse than no doc: a reader inherits
the false premise that `speechSynthesis` is a testable surface, and a future engineer may
mock it instead of testing the real route.

## Scope

1. Remove the `window.speechSynthesis` mock (section 4.4 part 3) and replace it with the REAL
   server-route testing pattern:
   `ServerTtsAudioAdapter` → `ProsoApiAdapter` → `POST /api/v1/tts/synthesize`
   (`packages/extension/src/adapters/audio/server-tts-audio.adapter.ts`,
   `packages/extension/src/adapters/api/proso-api.adapter.ts:142-148`), stubbed via the
   reading fixture server (`scripts/lib/reading-fixture-server.mjs`) or a mocked `fetch`.
2. Audit the SAME file for other stale claims and fix them:
   - 4.4 part 1 (`AudioContext` mock): the product plays via `new Audio()` in the Firefox
     event-page background (`playback-service.ts` attachAndPlay ~:1208) or the MV3 offscreen
     document — no `AudioContext` is used.
   - 4.4 part 2 ("audio element in the page DOM"): the audio element is not in a page's DOM;
     it lives in the background (Firefox) / offscreen document (MV3).
   - 1.4 "Proso Current Approach": stale (says Firefox E2E is "static file checks, no full
     extension loading"). The current approach loads the full extension in Firefox via the
     raw geckodriver harness (`scripts/chrome-mv3-diagnostics.mjs` firefoxLeg ~:748,
     `installAddon`), the visual suite serves the built page over HTTP
     (`packages/extension/playwright.config.js` webServer), and `make user-gate` drives a
     real Firefox.
   - 2.4 / 4.3 / 5.4 (PDF.js viewer testing): the product has no PDF viewer — the "pdf"
     references in source are feature labels only (`045-pdf-removal-page-reader` comments).
     These sections describe a nonexistent surface; replace with a note pointing at the
     article-extraction testing (`packages/extension/tests/integration/reader-journey.test.ts`).
3. Every claim KEPT must cite a real `file:line`.

## Non-goals

- No change to product code, tests, or CI.
- No change to other docs (reading-journey-status.md is read-only; other docs already
  reconciled by PR #113).
- No deletion of the whole file — the doc's Playwright/geckodriver setup, visual regression,
  flakiness, signing, profile, CSP, CI and NixOS sections are largely still accurate; only
  the stale surfaces are corrected.

## Acceptance

- `grep -rn -i "speechSynthesis\|browser tts" docs/` returns zero NEW hits in
  `docs/firefox-extension-testing-strategy.md` (the historical hits in
  `docs/reading-journey-status.md` and `docs/money-path.md` are ledger/pricing records of
  the removal, out of scope).
- The replacement 4.4 cites the real adapter/api file:lines.
- `make verify` exits 0.
- Spec/plan/tasks tracked in `specs/182-testing-strategy-doc/`.
