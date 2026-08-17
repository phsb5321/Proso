# Plan — 182 testing-strategy doc corrections

## Approach

Single-doc edit in `docs/firefox-extension-testing-strategy.md` plus tracked spec
artifacts. No product code, no tests, no CI changes.

1. **Section 4.4 rewrite** — replace the three stale strategies (AudioContext mock,
   page-DOM audio element, `window.speechSynthesis` mock) with the real route:
   - Playback plays via `new Audio()` in the Firefox background event page
     (`playback-service.ts:1208` attachAndPlay) or the MV3 offscreen document
     (`adapters/audio/offscreen-audio-element.adapter.ts`).
   - The server route is `ServerTtsAudioAdapter` →
     `ProsoApiAdapter.synthesize` (`api/proso-api.adapter.ts:142-148`,
     `POST /api/v1/tts/synthesize`).
   - The deterministic way to test it: stub `fetch` at the adapter boundary (the
     reader-journey integration test does exactly this —
     `tests/integration/reader-journey.test.ts` mockFetch) or serve the reading fixture
     (`scripts/lib/reading-fixture-server.mjs`) and assert the request
     `{text, provider, ...}` + the audio blob response.
2. **Section 1.4 rewrite** — the current approach: the retained geckodriver harness loads
   the full extension in Firefox (`scripts/chrome-mv3-diagnostics.mjs` firefoxLeg,
   installAddon); the visual suite serves the BUILT page over HTTP
   (`packages/extension/playwright.config.js` webServer); Docker-only Playwright;
   `make user-gate` drives a real Firefox through public controls.
3. **PDF sections (2.4, 4.3, 5.4)** — replace with a short honest note: the product has no
   PDF viewer ("pdf" in source = feature labels of the page-reader work); article
   extraction is tested in `tests/integration/reader-journey.test.ts`.
4. **Keep/cite rule** — every retained claim gets a `file:line` citation where it is
   checkable; sections that are already accurate (Playwright setup, visual regression,
   flakiness, signing, profile isolation, CSP, CI/NixOS) stay untouched apart from links.

## Files

- `docs/firefox-extension-testing-strategy.md` (edited).
- `specs/182-testing-strategy-doc/{spec,plan,tasks}.md` (new, tracked).

## Gates

- `grep -rn -i "speechSynthesis\|browser tts" docs/` — no hits in the edited file.
- `make verify` exits 0 (run steps directly; `make` not on PATH in this environment).
- Diff is docs-only (no src/test/CI files).
