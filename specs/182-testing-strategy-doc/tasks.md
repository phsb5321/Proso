# Tasks — 182 testing-strategy doc corrections

## T1 — Verify the real route and harness facts
- Confirm `ProsoApiAdapter.synthesize` → `POST /api/v1/tts/synthesize`
  (`packages/extension/src/adapters/api/proso-api.adapter.ts:142-148`).
- Confirm the Firefox leg loads the full extension via geckodriver
  (`scripts/chrome-mv3-diagnostics.mjs` firefoxLeg / installAddon).
- Confirm no `AudioContext` usage and the audio element's home (background/offscreen).
- Confirm no PDF viewer in the product (source hits are feature labels only).
**Gate:** evidence collected with file:line before editing.

## T2 — Rewrite section 4.4 (Audio Playback Testing)
- Remove the `AudioContext` mock, the page-DOM `audio` query, and the
  `window.speechSynthesis` mock.
- Replace with the real server-route pattern: stub `fetch` at the adapter boundary
  (pattern: `tests/integration/reader-journey.test.ts`) and/or the reading fixture
  server; assert the `/api/v1/tts/synthesize` request + the audio response.
**Gate:** no `speechSynthesis`/`AudioContext`/page-DOM-audio claim remains in the file.

## T3 — Fix section 1.4 (current approach)
- Replace the stale "static file checks, no full extension loading" claims with the
  geckodriver full-extension harness + HTTP-served visual baselines + Docker-only
  Playwright + `make user-gate`.
**Gate:** every claim cites a real file:line.

## T4 — Fix the PDF sections (2.4, 4.3, 5.4)
- Replace with an honest note: no PDF viewer exists; article extraction is covered by
  `tests/integration/reader-journey.test.ts`.
**Gate:** no PDF.js/`#viewer` testing claims remain.

## T5 — Verify + PR
- `grep -rn -i "speechSynthesis\|browser tts" docs/` — zero hits in the edited file
  (paste the output).
- `make verify` steps run directly → exit 0.
- Push, open PR `docs: ...`, do NOT merge; report the PR number.
