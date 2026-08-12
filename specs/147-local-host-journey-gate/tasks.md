# Feature 147 — Tasks

Status recorded against the measured run, not intent.

| # | Task | State | Evidence |
|---|---|---|---|
| T01 | Extract actor primitives to `scripts/lib/firefox-popup.mjs`; rewire `public-actor-gate.mjs` onto it | done | `node scripts/public-actor-gate.mjs` → `PASS at bda64a0` after the extraction |
| T02 | Accessible name = `aria-label`, else the control's own visible text (the "Grant access" button carries no label) | done | `readPopup`/`clickByName` in the lib; visible-only for text-named controls so hidden rows cannot be addressed |
| T03 | Teach the fixture the synthesis host's wire contract | done | `/v1/capabilities`, `/v1/tts` with `Idempotency-Key` 16–128, exactly `{input, voice, speed}`, 422 on any extra field, 413 oversize, RFC-9457 errors, WAV generated in-process |
| T04 | Write `scripts/local-host-journey-gate.mjs` | done | 17 recorded steps; PASS requires the reader's host to serve the article **and** zero managed requests |
| T05 | Run it on `main` and report the truth | done | FAIL: `route taken: 4 managed /api/v1/tts/synthesize, 0 local /v1/tts` |
| T06 | Fix 1 — the settings page discarded the typed address | done | `controller.ts` persists `localHostUrl` independently of `enabled`; measured before/after: `localHostUrl: null` → the entered address survives, enable succeeds |
| T07 | Fix 2 — the chunked path still fell through to the server | done | `fallback-audio.adapter.ts` honours `failClosedOnGate` in all remaining chunked fall-throughs; managed requests went 4 → 0 |
| T08 | Fix 3 — `setLanguage()` was called from nowhere | done | `playback.start` derives the language once for the footer and synthesis; local route stopped answering "Language not supported: und" |
| T09 | Regression tests for the two unit-testable fixes | done | 4 new tests; extension unit suite 2446 passed (was 2443) |
| T10 | Plant sweep | done | `local-host-journey-plants PASS — 6 runs, every break caught` |
| T11 | Source-level falsifier of the load-bearing fix | done | Reverting the `setLanguage` call → gate exits 1, `Language not supported: und`, 0 local requests; restoring → PASS |
| T12 | Record in the ledger, including what the gate does not prove | done | `docs/reading-journey-status.md`, Update — 12/08/2026 |

## Not done, deliberately

- **The doorhanger is not exercised.** `extensions.webextOptionalPermissionPrompts=false`
  grants the request the page makes; the request, its user gesture and the
  resulting permission are real, but the prompt a reader would accept is not.
  Closing this needs chrome-context WebDriver Actions against the panel.
- **The gate runs against a fixture host, not the appliance.** The real host is
  covered at the adapter level by `tests/integration/local-host-live.test.ts`
  (env-gated, re-run live during this feature: PASS in 2.8 s).
- **`syncProviderUI` still rewrites a focused input.** With fix 1 the value
  written back equals what the reader typed, so nothing is lost, but the caret
  still jumps to the end mid-typing. Pre-existing, cosmetic, and out of scope
  here — recorded as adjacent debt in the ledger's next-slices list.
